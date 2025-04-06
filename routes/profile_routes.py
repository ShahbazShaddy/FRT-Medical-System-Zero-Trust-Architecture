from flask import Blueprint, jsonify, session, request, redirect, render_template
from database import get_db_connection

profile_bp = Blueprint('profile', __name__, url_prefix='/api')

@profile_bp.route('/profile')
def get_profile():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = session['user_id']
    role = session['role']
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Get basic user info
        cursor.execute("""
            SELECT FullName, Email, Role, PhoneNumber, ProfileCompleted
            FROM Users WHERE UserID = ?
        """, (user_id,))
        
        user = cursor.fetchone()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Basic profile data
        profile_data = {
            'name': user[0],
            'email': user[1],
            'role': user[2],
            'phone': user[3],
            'profileCompleted': user[4]
        }
        
        # Role-specific data
        if role == 'Patient':
            cursor.execute("""
                SELECT DOB, Gender, Address, EmergencyContact, EmergencyPhone, MedicalHistory,
                       HasDoctor, DoctorID
                FROM PatientProfiles
                WHERE UserID = ?
            """, (user_id,))
            
            patient_data = cursor.fetchone()
            
            if patient_data:
                profile_data.update({
                    'dob': patient_data[0].strftime('%Y-%m-%d') if patient_data[0] else None,
                    'gender': patient_data[1],
                    'address': patient_data[2],
                    'emergency_contact': patient_data[3],
                    'emergency_phone': patient_data[4],
                    'medical_history': patient_data[5],
                    'hasDoctor': patient_data[6],
                    'doctorId': patient_data[7]
                })
                
        else:  # Doctor
            cursor.execute("""
                SELECT DoctorID, PMDC_No, Specialization, OfficeHours, 
                       HospitalClinic, Experience, Education
                FROM DoctorProfiles
                WHERE UserID = ?
            """, (user_id,))
            
            doctor_data = cursor.fetchone()
            
            if doctor_data:
                profile_data.update({
                    'doctorId': doctor_data[0],
                    'pmdc_no': doctor_data[1],
                    'specialization': doctor_data[2],
                    'office_hours': doctor_data[3],
                    'hospital_clinic': doctor_data[4],
                    'experience': doctor_data[5],
                    'education': doctor_data[6]
                })
        
        return jsonify(profile_data), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@profile_bp.route('/edit-profile', methods=['POST'])
def edit_profile():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    role = session['role']
    user_id = session['user_id']
    
    # Common fields
    phone = data.get('phone')
    if not phone:
        return jsonify({'error': 'Phone number is required'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Update phone in Users table
        cursor.execute("""
            UPDATE Users 
            SET PhoneNumber = ? 
            WHERE UserID = ?
        """, (phone, user_id))
        
        if role == 'Patient':
            # Patient-specific fields
            dob = data.get('dob')
            gender = data.get('gender')
            address = data.get('address')
            emergency_contact = data.get('emergency_contact')
            emergency_phone = data.get('emergency_phone')
            medical_history = data.get('medical_history', '')
            
            # Validate required fields
            if not dob or not gender or not address or not emergency_contact or not emergency_phone:
                return jsonify({'error': 'All fields except Medical History are required'}), 400
            
            # Update patient profile
            cursor.execute("""
                UPDATE PatientProfiles 
                SET DOB = ?, Gender = ?, Address = ?, 
                    EmergencyContact = ?, EmergencyPhone = ?, MedicalHistory = ?
                WHERE UserID = ?
            """, (dob, gender, address, emergency_contact, emergency_phone, medical_history, user_id))
            
        elif role == 'Doctor':
            # Doctor-specific fields
            specialization = data.get('specialization')
            office_hours = data.get('office_hours')
            hospital_clinic = data.get('hospital_clinic')
            experience = data.get('experience')
            education = data.get('education')
            
            # Validate required fields
            if not specialization or not office_hours or not hospital_clinic or not experience or not education:
                return jsonify({'error': 'All fields are required'}), 400
            
            # Update doctor profile
            cursor.execute("""
                UPDATE DoctorProfiles 
                SET Specialization = ?, OfficeHours = ?, 
                    HospitalClinic = ?, Experience = ?, Education = ?
                WHERE UserID = ?
            """, (specialization, office_hours, hospital_clinic, experience, education, user_id))
        
        conn.commit()
        return jsonify({'message': 'Profile updated successfully'}), 200
    
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@profile_bp.route('/complete-profile', methods=['POST', 'OPTIONS'])
def complete_profile():
    # Handle OPTIONS request for testing the endpoint
    if request.method == 'OPTIONS':
        return jsonify({'message': 'Endpoint is reachable'}), 200
        
    print("\n----- COMPLETE PROFILE ENDPOINT CALLED -----")
    print(f"Request method: {request.method}")
    print(f"Request headers: {dict(request.headers)}")
    print(f"Request cookies: {request.cookies}")
    print(f"Session data: {session}")
    
    if 'user_id' not in session:
        print("USER NOT AUTHENTICATED - No user_id in session")
        return jsonify({'error': 'Not authenticated'}), 401
    
    # Log request body
    try:
        data = request.get_json()
        print(f"Request data received: {data}")
    except Exception as e:
        print(f"Error parsing JSON: {str(e)}")
        print(f"Raw request data: {request.data}")
        return jsonify({'error': 'Invalid JSON: ' + str(e)}), 400
    
    role = session.get('role')
    user_id = session.get('user_id')
    
    print(f"Session data - user_id: {user_id}, role: {role}")
    
    # Common fields
    phone = data.get('phone')
    if not phone:
        print("ERROR: Phone number is missing")
        return jsonify({'error': 'Phone number is required'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # First update the phone number in the Users table
        cursor.execute("""
            UPDATE Users 
            SET PhoneNumber = ?
            WHERE UserID = ?
        """, (phone, user_id))
        
        print(f"Processing profile for role: {role}")
        
        if role == 'Patient':
            # Patient-specific fields
            dob = data.get('dob')
            gender = data.get('gender')
            address = data.get('address')
            emergency_contact = data.get('emergency_contact')
            emergency_phone = data.get('emergency_phone')
            medical_history = data.get('medical_history', '')
            
            # Validate required fields for patients
            if not dob:
                return jsonify({'error': 'Date of birth is required'}), 400
            if not gender:
                return jsonify({'error': 'Gender is required'}), 400
            if not address:
                return jsonify({'error': 'Address is required'}), 400
            if not emergency_contact:
                return jsonify({'error': 'Emergency contact name is required'}), 400
            if not emergency_phone:
                return jsonify({'error': 'Emergency contact phone is required'}), 400
            
            # Check if patient profile exists
            cursor.execute("SELECT 1 FROM PatientProfiles WHERE UserID = ?", (user_id,))
            profile_exists = cursor.fetchone()
            
            if profile_exists:
                # Update existing patient profile
                cursor.execute("""
                    UPDATE PatientProfiles 
                    SET DOB = ?, Gender = ?, Address = ?, 
                        EmergencyContact = ?, EmergencyPhone = ?, MedicalHistory = ?
                    WHERE UserID = ?
                """, (dob, gender, address, emergency_contact, emergency_phone, medical_history, user_id))
            else:
                # Create new patient profile
                cursor.execute("""
                    INSERT INTO PatientProfiles 
                    (UserID, DOB, Gender, Address, EmergencyContact, EmergencyPhone, MedicalHistory)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (user_id, dob, gender, address, emergency_contact, emergency_phone, medical_history))
            
            print(f"Updated patient profile for user_id: {user_id}")
            
        elif role == 'Doctor':
            # Doctor-specific fields
            specialization = data.get('specialization')
            office_hours = data.get('office_hours')
            hospital_clinic = data.get('hospital_clinic')
            experience = data.get('experience')
            education = data.get('education')
            
            print(f"Doctor profile data - specialization: {specialization}, office_hours: {office_hours}")
            print(f"hospital_clinic: {hospital_clinic}, experience: {experience}, education: {education}")
            
            # Validate required fields for doctors only
            if not specialization:
                print("ERROR: Specialization is missing")
                return jsonify({'error': 'Specialization is required'}), 400
            if not office_hours:
                print("ERROR: Office hours are missing")
                return jsonify({'error': 'Office hours are required'}), 400
            if not hospital_clinic:
                print("ERROR: Hospital/clinic is missing")
                return jsonify({'error': 'Hospital/clinic is required'}), 400
            if not experience:
                print("ERROR: Experience is missing")
                return jsonify({'error': 'Experience is required'}), 400
            if not education:
                print("ERROR: Education is missing")
                return jsonify({'error': 'Education is required'}), 400
            
            # Get doctor ID
            cursor.execute("SELECT DoctorID FROM DoctorProfiles WHERE UserID = ?", (user_id,))
            doctor_id_row = cursor.fetchone()
            
            if not doctor_id_row:
                print("ERROR: Doctor ID not found")
                return jsonify({'error': 'Doctor ID not found in the system'}), 400
                
            doctor_id = doctor_id_row[0]
            
            # Check if doctor profile exists
            cursor.execute("SELECT 1 FROM DoctorProfiles WHERE UserID = ?", (user_id,))
            profile_exists = cursor.fetchone()
            
            if profile_exists:
                # Update existing doctor profile
                cursor.execute("""
                    UPDATE DoctorProfiles 
                    SET Specialization = ?, OfficeHours = ?, HospitalClinic = ?, 
                        Experience = ?, Education = ?
                    WHERE UserID = ?
                """, (specialization, office_hours, hospital_clinic, experience, education, user_id))
            else:
                # This should not happen as doctor profile should be created at signup
                print("ERROR: Doctor profile not found - this should not happen")
                return jsonify({'error': 'Doctor profile not found'}), 500
            
            print(f"Updated doctor profile for user_id: {user_id}")
            
        else:
            print(f"ERROR: Unknown role {role}")
            return jsonify({'error': f'Unknown role: {role}'}), 400
        
        # Set profile as completed in Users table
        cursor.execute("""
            UPDATE Users 
            SET ProfileCompleted = 1
            WHERE UserID = ?
        """, (user_id,))
        
        conn.commit()
        print("Database changes committed successfully")
        return jsonify({'message': 'Profile completed successfully'}), 200
    
    except Exception as e:
        conn.rollback()
        error_message = str(e)
        print(f"ERROR in complete_profile: {error_message}")
        return jsonify({'error': error_message}), 500
    finally:
        conn.close()
        print("Database connection closed")
        print("----- COMPLETE PROFILE ENDPOINT FINISHED -----\n")
