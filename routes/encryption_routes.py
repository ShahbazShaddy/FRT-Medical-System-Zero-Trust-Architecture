from flask import Blueprint, jsonify, session, request
from database import get_db_connection
from crypto_utils import generate_key_pair
from setup_tables import setup_encryption_tables
import traceback

encryption_bp = Blueprint('encryption', __name__, url_prefix='/api/encryption-keys')

@encryption_bp.route('/generate', methods=['POST'])
def generate_encryption_keys():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    # Ensure tables exist before proceeding
    setup_encryption_tables()
    
    try:
        user_id = session['user_id']
        print(f"Generating encryption keys for user_id: {user_id}")
        
        # Check if keys were provided in the request (from client-side generation)
        if request.is_json and request.json.get('public_key') and request.json.get('private_key'):
            keys = {
                'public_key': request.json.get('public_key'),
                'private_key': request.json.get('private_key')
            }
            print("Using client-provided encryption keys.")
        else:
            # Generate keys server-side
            keys = generate_key_pair()
            print(f"Generated server-side encryption keys. Public key length: {len(keys['public_key'])}, private key length: {len(keys['private_key'])}")
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        try:
            # Double-check that the UserEncryptionKeys table exists and has correct schema
            cursor.execute("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'UserEncryptionKeys'")
            if cursor.fetchone()[0] == 0:
                print("UserEncryptionKeys table missing, creating now...")
                cursor.execute("""
                    CREATE TABLE UserEncryptionKeys (
                        KeyID INT IDENTITY(1,1) PRIMARY KEY,
                        UserID INT NOT NULL,
                        PublicKey NVARCHAR(MAX) NOT NULL,
                        PrivateKey NVARCHAR(MAX) NOT NULL,
                        CreatedAt DATETIME DEFAULT GETDATE(),
                        FOREIGN KEY (UserID) REFERENCES Users(UserID)
                    )
                """)
            
            # Check if user already has keys
            cursor.execute("SELECT KeyID FROM UserEncryptionKeys WHERE UserID = ?", (user_id,))
            existing_key = cursor.fetchone()
            
            if existing_key:
                # Update existing keys
                print(f"Updating existing keys for user {user_id}")
                cursor.execute("""
                    UPDATE UserEncryptionKeys 
                    SET PublicKey = ?, PrivateKey = ?, CreatedAt = GETDATE()
                    WHERE UserID = ?
                """, (keys['public_key'], keys['private_key'], user_id))
            else:
                # Create new keys
                print(f"Inserting new keys for user {user_id}")
                cursor.execute("""
                    INSERT INTO UserEncryptionKeys (UserID, PublicKey, PrivateKey)
                    VALUES (?, ?, ?)
                """, (user_id, keys['public_key'], keys['private_key']))
            
            conn.commit()
            print(f"Successfully saved keys to database for user {user_id}")
            
            # Verify keys were saved
            cursor.execute("SELECT PublicKey, PrivateKey FROM UserEncryptionKeys WHERE UserID = ?", (user_id,))
            stored_keys = cursor.fetchone()
            if not stored_keys:
                print(f"ERROR: Failed to save keys for user {user_id} - verification query returned no results")
                return jsonify({'error': 'Failed to save encryption keys'}), 500
                
            print(f"Verification successful - found stored keys with lengths: {len(stored_keys[0])}, {len(stored_keys[1])}")
            return jsonify({'message': 'Encryption keys generated successfully', 'keys': keys}), 200
            
        except Exception as db_error:
            conn.rollback()
            print(f"Database error in generate_encryption_keys: {str(db_error)}")
            traceback.print_exc()
            return jsonify({'error': f'Database error: {str(db_error)}'}), 500
        finally:
            conn.close()
    except Exception as e:
        print(f"Unexpected error in generate_encryption_keys: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@encryption_bp.route('/trigger-generation/<int:user_id>', methods=['POST'])
def trigger_key_generation(user_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Check if the target user exists
        cursor.execute("SELECT 1 FROM Users WHERE UserID = ?", (user_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Target user not found'}), 404
        
        # Check if they already have keys
        cursor.execute("SELECT 1 FROM UserEncryptionKeys WHERE UserID = ?", (user_id,))
        if cursor.fetchone():
            conn.close()
            return jsonify({'message': 'User already has encryption keys'}), 200
        
        # Generate keys for the user
        keys = generate_key_pair()
        
        # Create new keys
        cursor.execute("""
            INSERT INTO UserEncryptionKeys (UserID, PublicKey, PrivateKey)
            VALUES (?, ?, ?)
        """, (user_id, keys['public_key'], keys['private_key']))
        
        conn.commit()
        conn.close()
        
        return jsonify({'message': 'Encryption keys generated for user'}), 200
    except Exception as e:
        traceback.print_exc()
        print(f"Error in trigger_key_generation: {str(e)}")
        return jsonify({'error': str(e)}), 500

@encryption_bp.route('/<int:user_id>', methods=['GET'])
def get_public_key(user_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    # Ensure tables exist
    setup_encryption_tables()
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Retrieve the public key
        cursor.execute("SELECT PublicKey FROM UserEncryptionKeys WHERE UserID = ?", (user_id,))
        key = cursor.fetchone()
        
        if not key:
            print(f"No public key found for user_id: {user_id}")
            return jsonify({'error': 'Public key not found for this user'}), 404
        
        print(f"Retrieved public key for user_id: {user_id}")
        return jsonify({'public_key': key[0]}), 200
    except Exception as e:
        traceback.print_exc()
        print(f"Error in get_public_key: {str(e)}")
        return jsonify({'error': f'Failed to retrieve public key: {str(e)}'}), 500
    finally:
        conn.close()

@encryption_bp.route('/user', methods=['GET'])
def get_user_keys():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    # Ensure tables exist
    setup_encryption_tables()
    
    try:
        user_id = session['user_id']
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Ensure the table exists
        cursor.execute("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'UserEncryptionKeys'")
        if cursor.fetchone()[0] == 0:
            setup_encryption_tables()
            conn.close()
            return jsonify({'error': 'Encryption keys table created, please retry'}), 503
        
        cursor.execute("SELECT PublicKey, PrivateKey FROM UserEncryptionKeys WHERE UserID = ?", (user_id,))
        key = cursor.fetchone()
        
        if not key:
            print(f"Keys not found for user_id: {user_id}")
            return jsonify({'error': 'Keys not found for current user'}), 404
        
        return jsonify({
            'public_key': key[0],
            'private_key': key[1]
        }), 200
    except Exception as e:
        traceback.print_exc()
        print(f"Error in get_user_keys: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@encryption_bp.route('/debug', methods=['GET'])
def debug_encryption_keys():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = session['user_id']
    role = session['role']
    
    try:
        # Check database connection
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Check if UserEncryptionKeys table exists
        cursor.execute("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'UserEncryptionKeys'")
        table_exists = cursor.fetchone()[0] > 0
        
        # Check if user has keys
        has_keys = False
        if table_exists:
            cursor.execute("SELECT COUNT(*) FROM UserEncryptionKeys WHERE UserID = ?", (user_id,))
            has_keys = cursor.fetchone()[0] > 0
        
        # Check if we can generate keys
        key_gen_success = False
        key_gen_error = None
        try:
            test_keys = generate_key_pair()
            key_gen_success = True
        except Exception as e:
            key_gen_error = str(e)
        
        conn.close()
        
        return jsonify({
            'user_id': user_id,
            'role': role,
            'table_exists': table_exists,
            'has_keys': has_keys,
            'can_generate_keys': key_gen_success,
            'key_gen_error': key_gen_error
        }), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
