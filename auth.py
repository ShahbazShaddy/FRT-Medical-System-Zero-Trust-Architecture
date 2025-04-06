# auth.py - Handles user authentication (Sign-up, Sign-in, Logout)

from flask import Blueprint, request, session, jsonify
from flask_bcrypt import Bcrypt
from database import get_db_connection
import pyodbc  # Ensure this is imported for handling database exceptions
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from datetime import datetime, timedelta
import string
from email_config import EMAIL_CONFIG

auth_bp = Blueprint('auth', __name__)
bcrypt = Bcrypt()

# Store OTPs temporarily (in a real app, use a database or Redis)
otps = {}

# Get email configuration from config file
EMAIL_HOST = EMAIL_CONFIG['HOST']
EMAIL_PORT = EMAIL_CONFIG['PORT']
EMAIL_USER = EMAIL_CONFIG['USER']
EMAIL_PASSWORD = EMAIL_CONFIG['PASSWORD']

def send_email(to_email, subject, message):
    """Send email with the given message"""
    try:
        print(f"Attempting to send email to {to_email} using {EMAIL_USER}")
        msg = MIMEMultipart()
        msg['From'] = EMAIL_USER
        msg['To'] = to_email
        msg['Subject'] = subject
        
        msg.attach(MIMEText(message, 'plain'))
        
        with smtplib.SMTP(EMAIL_HOST, EMAIL_PORT) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            print(f"Logging in with user: {EMAIL_USER}")
            server.login(EMAIL_USER, EMAIL_PASSWORD)
            print("Login successful, sending message")
            server.send_message(msg)
            print("Message sent successfully")
        return True
    except Exception as e:
        print(f"Failed to send email: {str(e)}")
        return False

def generate_doc_id():
    """Generate a unique 6-character doctor ID"""
    for attempt in range(10):  # Try a maximum of 10 times
        # Generate a random 6-character string (letters and numbers)
        doc_id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        
        # Check if this ID already exists in DoctorProfiles table instead of Users
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # First check if DoctorProfiles table exists
        cursor.execute("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DoctorProfiles'")
        doctor_profiles_exists = cursor.fetchone()[0] > 0
        
        # If using normalized schema, check DoctorProfiles table
        if doctor_profiles_exists:
            cursor.execute("SELECT 1 FROM DoctorProfiles WHERE DoctorID = ?", (doc_id,))
        else:
            # For backwards compatibility with old schema
            cursor.execute("SELECT 1 FROM Users WHERE DoctorID = ?", (doc_id,))
            
        exists = cursor.fetchone()
        conn.close()
        
        if not exists:
            return doc_id
    
    # If we get here, we couldn't generate a unique ID after 10 attempts
    raise ValueError("Could not generate a unique doctor ID after multiple attempts")

# Generate and send OTP
@auth_bp.route('/send-otp', methods=['POST'])
def send_otp():
    data = request.json
    email = data.get('email')
    
    if not email:
        return jsonify({'error': 'Email is required'}), 400
    
    # Generate a 6-digit OTP
    otp = ''.join([str(random.randint(0, 9)) for _ in range(6)])
    
    # Store OTP with expiration time (10 minutes)
    expiration_time = datetime.now() + timedelta(minutes=10)
    otps[email] = {
        'otp': otp,
        'expires_at': expiration_time
    }
    
    # Send OTP via email
    subject = "Your FRT Healthcare Verification Code"
    message = f"""
    Hello,
    
    Your verification code for FRT Healthcare is: {otp}
    
    This code will expire in 10 minutes.
    
    If you did not request this code, please ignore this email.
    
    Best regards,
    FRT Healthcare Team
    """
    
    if not send_email(email, subject, message):
        return jsonify({'error': 'Failed to send verification email'}), 500
    
    return jsonify({'message': 'Verification code sent to your email'}), 200

# Verify OTP
@auth_bp.route('/verify-otp', methods=['POST'])
def verify_otp():
    data = request.json
    email = data.get('email')
    otp = data.get('otp')
    
    if not email or not otp:
        return jsonify({'error': 'Email and OTP are required'}), 400
    
    # Check if OTP exists and is valid
    if email not in otps:
        return jsonify({'error': 'No verification code found for this email'}), 400
    
    stored_otp = otps[email]
    if datetime.now() > stored_otp['expires_at']:
        del otps[email]  # Remove expired OTP
        return jsonify({'error': 'Verification code has expired'}), 400
    
    if otp != stored_otp['otp']:
        return jsonify({'error': 'Invalid verification code'}), 400
    
    # OTP is valid, remove it from storage
    del otps[email]
    
    return jsonify({'message': 'Email verified successfully'}), 200

# 🔹 User Signup (Registration)
@auth_bp.route('/signup', methods=['POST'])
def signup():
    data = request.json
    full_name = data.get('full_name')
    email = data.get('email')
    password = data.get('password')
    role = data.get('role')  # 'Patient' or 'Doctor'
    
    print(f"Processing signup for {email} as {role}")
    
    # Additional fields
    has_doctor = data.get('has_doctor', False)
    doctor_id = data.get('doctor_id') if has_doctor else None
    pmdc_no = data.get('pmdc_no')
    
    # Validate input
    if not full_name or not email or not password or role not in ['Patient', 'Doctor']:
        print(f"Missing required fields: name={bool(full_name)}, email={bool(email)}, password={bool(password)}, role={role}")
        return jsonify({'error': 'Missing or invalid required fields'}), 400
    
    # Additional validation for Doctor role
    if role == 'Doctor' and not pmdc_no:
        print(f"Doctor signup missing PMDC_No")
        return jsonify({'error': 'PMDC Registration Number is required for doctors'}), 400
    
    # Validate doctor_id if patient is associated with a doctor
    if role == 'Patient' and has_doctor and doctor_id:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM DoctorProfiles WHERE DoctorID = ?", (doctor_id,))
        valid_doctor = cursor.fetchone()
        conn.close()
        
        if not valid_doctor:
            return jsonify({'error': 'Invalid Doctor ID'}), 400
    
    # Generate doctor_id for doctors
    if role == 'Doctor':
        try:
            doctor_id = generate_doc_id()
            print(f"Generated doctor_id: {doctor_id}")
        except ValueError as e:
            print(f"Error generating doctor_id: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Begin transaction
        conn.autocommit = False
        
        # Insert user into the Users table
        print("Inserting into Users table...")
        cursor.execute("""
            INSERT INTO Users (FullName, Email, PasswordHash, Role) 
            VALUES (?, ?, ?, ?)
        """, (full_name, email, hashed_password, role))
        
        # Get the inserted user ID
        cursor.execute("SELECT @@IDENTITY")
        user_id = int(cursor.fetchone()[0])
        print(f"Created user with ID: {user_id}")
        
        # Create the appropriate profile
        if role == 'Patient':
            print("Creating patient profile...")
            cursor.execute("""
                INSERT INTO PatientProfiles (UserID, HasDoctor, DoctorID)
                VALUES (?, ?, ?)
            """, (user_id, has_doctor, doctor_id))
        else:  # Doctor
            print(f"Creating doctor profile with doctor_id: {doctor_id}, pmdc_no: {pmdc_no}")
            try:
                cursor.execute("""
                    INSERT INTO DoctorProfiles (UserID, DoctorID, PMDC_No)
                    VALUES (?, ?, ?)
                """, (user_id, doctor_id, pmdc_no))
                print("Doctor profile created successfully")
            except Exception as e:
                print(f"Error inserting doctor profile: {str(e)}")
                raise e
            
        # Commit the transaction
        conn.commit()
        print("Transaction committed successfully")
        
        # If it's a doctor, send them their Doctor ID
        if role == 'Doctor':
            subject = "Your FRT Healthcare Doctor ID"
            message = f"""
            Hello Dr. {full_name},
            
            Your FRT Healthcare Doctor ID is: {doctor_id}
            
            Please keep this ID safe and share it with your patients so they can associate their accounts with you.
            
            Best regards,
            FRT Healthcare Team
            """
            send_email(email, subject, message)
            print(f"Email sent to {email} with doctor ID {doctor_id}")
        
        return jsonify({'message': 'User registered successfully'}), 201
    except pyodbc.IntegrityError as e:
        conn.rollback()
        error_msg = str(e)
        print(f"IntegrityError: {error_msg}")
        if "IX_Users_Email" in error_msg:
            return jsonify({'error': 'Email already exists'}), 409
        elif "DoctorProfiles" in error_msg and "DoctorID" in error_msg:
            # Doctor ID conflict - very rare but can happen
            return jsonify({'error': 'System error: Generated doctor ID already exists. Please try again.'}), 409
        else:
            return jsonify({'error': f'Database error: {error_msg}'}), 500
    except Exception as e:
        conn.rollback()
        print(f"Unexpected error in signup: {str(e)}")
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500
    finally:
        conn.autocommit = True
        conn.close()
        print("Database connection closed")

# 🔹 User Login (Authentication)
@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')

    # Validate input
    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT UserID, FullName, Email, PasswordHash, Role, CreatedAt, ProfileCompleted FROM Users WHERE Email = ?", (email,))
    user = cursor.fetchone()
    conn.close()

    if user and bcrypt.check_password_hash(user[3], password):  # Verify hashed password
        session['user_id'] = user[0]
        session['full_name'] = user[1]
        session['role'] = user[4]
        return jsonify({
            'message': 'Login successful',
            'user': {
                'id': user[0],
                'name': user[1],
                'email': user[2],
                'role': user[4],
                'created_at': user[5],
                'profileCompleted': user[6]
            }
        }), 200
    else:
        return jsonify({'error': 'Invalid email or password'}), 401

# 🔹 User Logout
@auth_bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logout successful'}), 200
