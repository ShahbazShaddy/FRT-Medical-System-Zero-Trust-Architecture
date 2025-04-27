from flask import Blueprint, jsonify, session, request, make_response
from database import get_db_connection
import traceback
import chatbot
from flask_socketio import emit, join_room
import json
import base64
from flask import make_response, send_file
from io import BytesIO

chat_bp = Blueprint('chat', __name__, url_prefix='/api/chat')

# This will be set from app.py
socketio = None

def init_socketio(socket_instance):
    global socketio
    socketio = socket_instance

@chat_bp.route('/<int:user_id>')
def get_chat_history(user_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    current_user_id = session['user_id']
    current_user_role = session['role']
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Get chat messages between the two users
        cursor.execute("""
            SELECT MessageID, SenderID, RecipientID, SenderEncryptedMessage, RecipientEncryptedMessage, 
                   Timestamp, IsRead
            FROM ChatMessages
            WHERE (SenderID = ? AND RecipientID = ?) OR (SenderID = ? AND RecipientID = ?)
            ORDER BY Timestamp ASC
        """, (current_user_id, user_id, user_id, current_user_id))
        
        messages = []
        for row in cursor.fetchall():
            is_from_doctor = (row[1] == current_user_id and current_user_role == 'Doctor') or \
                             (row[1] == user_id and current_user_role == 'Patient')
            
            # Determine which encrypted message to use based on who's viewing
            encrypted_message = row[3] if row[1] == current_user_id else row[4]
            
            messages.append({
                'id': row[0],
                'senderId': row[1],
                'recipientId': row[2],
                'encryptedMessage': encrypted_message,
                'timestamp': row[5].strftime("%Y-%m-%d %H:%M:%S"),
                'isRead': row[6],
                'isFromDoctor': is_from_doctor
            })
        
        # Mark messages as read
        cursor.execute("""
            UPDATE ChatMessages
            SET IsRead = 1
            WHERE SenderID = ? AND RecipientID = ? AND IsRead = 0
        """, (user_id, current_user_id))
        
        conn.commit()
        return jsonify(messages), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@chat_bp.route('/send', methods=['POST'])
def send_message():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    recipient_id = data.get('recipientId')
    sender_encrypted_message = data.get('senderEncryptedMessage')
    recipient_encrypted_message = data.get('recipientEncryptedMessage')
    sender_encrypted_file = data.get('senderEncryptedFile')
    recipient_encrypted_file = data.get('recipientEncryptedFile')
    file_metadata = data.get('fileMetadata')
    
    # Check for required fields - either message or file must be present
    if not recipient_id:
        return jsonify({'error': 'Recipient ID is required'}), 400
        
    if not ((sender_encrypted_message and recipient_encrypted_message) or 
           (sender_encrypted_file and recipient_encrypted_file)):
        return jsonify({'error': 'Either encrypted messages or files are required'}), 400
    
    sender_id = session['user_id']
    sender_role = session['role']
    print(f"Received message from {sender_id} ({sender_role}) to {recipient_id}")
    
    # Convert strings to appropriate types
    try:
        recipient_id = int(recipient_id)
    except ValueError:
        return jsonify({'error': 'Invalid recipient ID format'}), 400
    
    # Convert base64 file data to binary if present
    binary_sender_file = None
    binary_recipient_file = None
    
    if sender_encrypted_file and recipient_encrypted_file:
        try:
            binary_sender_file = base64.b64decode(sender_encrypted_file)
            binary_recipient_file = base64.b64decode(recipient_encrypted_file)
        except Exception as e:
            print(f"Error decoding file data: {str(e)}")
            return jsonify({'error': 'Invalid file data format'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Verify the recipient exists and can receive messages
        cursor.execute("SELECT Role FROM Users WHERE UserID = ?", (recipient_id,))
        recipient = cursor.fetchone()
        
        if not recipient:
            return jsonify({'error': 'Recipient not found'}), 404
        
        recipient_role = recipient[0]
        print(f"Recipient role: {recipient_role}")
        
        # Check if there's a valid doctor-patient relationship
        if sender_role == 'Doctor':
            cursor.execute("""
                SELECT 1 FROM PatientProfiles p
                JOIN DoctorProfiles d ON p.DoctorID = d.DoctorID
                WHERE p.UserID = ? AND d.UserID = ?
            """, (recipient_id, sender_id))
        else:  # Patient
            cursor.execute("""
                SELECT 1 FROM PatientProfiles p
                JOIN DoctorProfiles d ON p.DoctorID = d.DoctorID
                WHERE p.UserID = ? AND d.UserID = ?
            """, (sender_id, recipient_id))
        
        relationship = cursor.fetchone()
        if not relationship:
            return jsonify({'error': 'No doctor-patient relationship exists'}), 403
        
        # Insert the encrypted messages
        cursor.execute("""
            INSERT INTO ChatMessages (SenderID, RecipientID, Message, 
                                     SenderEncryptedMessage, RecipientEncryptedMessage,
                                     SenderEncryptedFile, RecipientEncryptedFile, FileMetadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (sender_id, recipient_id, "Encrypted message", 
             sender_encrypted_message, recipient_encrypted_message,
             binary_sender_file, binary_recipient_file, file_metadata))
        
        # Get the ID and timestamp of the new message
        cursor.execute("SELECT @@IDENTITY, GETDATE()")
        message_data = cursor.fetchone()
        message_id = message_data[0]
        timestamp = message_data[1].strftime("%Y-%m-%d %H:%M:%S")
        
        conn.commit()
        print(f"Encrypted message/file saved to database with ID {message_id}")
        
        # Emit a socket event to the recipient
        if socketio:
            event_data = {
                'message_id': message_id,
                'sender_id': sender_id,
                'recipient_id': recipient_id,
                'timestamp': timestamp,
                'is_from_doctor': sender_role == 'Doctor'
            }
            
            # Add message data if present
            if sender_encrypted_message and recipient_encrypted_message:
                event_data['sender_encrypted_message'] = sender_encrypted_message
                event_data['recipient_encrypted_message'] = recipient_encrypted_message
            
            # Add file metadata if present
            if file_metadata:
                event_data['file_metadata'] = file_metadata
                event_data['has_file'] = True
            
            socketio.emit('new_message', event_data, room=f"user_{recipient_id}")
            print(f"Socket event emitted to room user_{recipient_id}")
        
        return jsonify({'message': 'Message sent successfully', 'message_id': message_id}), 200
    except Exception as e:
        conn.rollback()
        print(f"Error in send_message: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@chat_bp.route('/bot', methods=['POST'])
def chat_with_bot():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    user_id = session['user_id']
    user_question = request.json.get('question')
    new_conversation = request.json.get('new_conversation', False)
    
    if user_question:
        # Process the chat using the chatbot module
        result = chatbot.process_chat(user_id, user_question, new_conversation)
        
        # Check if we need to save the conversation to the database
        frt_recommended = result["frt_recommended"]
        save_conversation = False
        
        # Check if the response contains a definitive FRT recommendation
        if "Proceed with the FRT".lower() in result["answer"].lower():
            frt_recommended = 1
            save_conversation = True
        elif "There is no need to do the FRT".lower() in result["answer"].lower():
            frt_recommended = 0
            save_conversation = True
            
        # Only save when there's a definitive recommendation
        if save_conversation:
            try:
                # Get formatted conversation from the chatbot module
                formatted_conversation = chatbot.get_formatted_conversation(user_id)
                
                conn = get_db_connection()
                cursor = conn.cursor()
                
                # First, check if there's an existing "Pending Test" entry for this user
                cursor.execute("""
                    SELECT ResultID FROM FRTResults 
                    WHERE UserID = ? AND RiskLevel = 'Pending Test'
                """, (user_id,))
                
                existing_result = cursor.fetchone()
                
                if existing_result and frt_recommended == 1:
                    # Update the existing record with new conversation
                    cursor.execute("""
                        UPDATE FRTResults 
                        SET Symptoms = ?
                        WHERE ResultID = ?
                    """, (formatted_conversation, existing_result[0]))
                else:
                    # Insert new record only if there's a recommendation
                    cursor.execute("""
                        INSERT INTO FRTResults (UserID, MaxDistance, RiskLevel, Symptoms)
                        VALUES (?, ?, ?, ?)
                    """, (user_id, 0, 'Pending Test' if frt_recommended else 'Not Recommended', formatted_conversation))
                
                conn.commit()
                conn.close()
            except Exception as e:
                print(f"Error saving chat history: {e}")

        return jsonify(result)

    return jsonify({"answer": "Sorry, I didn't understand that."})

@chat_bp.route('/reset', methods=['POST'])
def reset_conversation():
    if 'user_id' in session:
        user_id = session['user_id']
        chatbot.reset_conversation(user_id)
    return jsonify({'status': 'success'})

# Add a new route to download files
@chat_bp.route('/file/<int:message_id>', methods=['GET'])
def get_file(message_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = session['user_id']
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Get the file data based on who's requesting
        cursor.execute("""
            SELECT SenderID, RecipientID, SenderEncryptedFile, RecipientEncryptedFile, FileMetadata
            FROM ChatMessages
            WHERE MessageID = ?
        """, (message_id,))
        
        message = cursor.fetchone()
        
        if not message:
            return jsonify({'error': 'File not found'}), 404
            
        sender_id, recipient_id, sender_file, recipient_file, file_metadata = message
        
        # Check if user is permitted to download this file
        if user_id != sender_id and user_id != recipient_id:
            return jsonify({'error': 'Unauthorized access to file'}), 403
            
        # Choose the right file version based on who's downloading
        file_data = sender_file if user_id == sender_id else recipient_file
        
        if not file_data:
            return jsonify({'error': 'No file attached to this message'}), 404
            
        # Parse file metadata to get filename and content type
        if not file_metadata:
            filename = f"file_{message_id}"
            content_type = "application/octet-stream"
        else:
            try:
                metadata = json.loads(file_metadata)
                filename = metadata.get('filename', f"file_{message_id}")
                content_type = metadata.get('type', "application/octet-stream")
            except:
                filename = f"file_{message_id}"
                content_type = "application/octet-stream"
                
        # Create response with file data
        response = make_response(file_data)
        response.headers.set('Content-Type', content_type)
        response.headers.set('Content-Disposition', f'attachment; filename="{filename}"')
        return response
        
    except Exception as e:
        print(f"Error retrieving file: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()
