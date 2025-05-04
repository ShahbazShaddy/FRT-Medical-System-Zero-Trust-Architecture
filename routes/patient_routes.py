from flask import Blueprint, jsonify, session, request
from database import get_db_connection
import re

patient_bp = Blueprint('patient', __name__, url_prefix='/api/patient')

@patient_bp.route('/doctor-association')
def get_doctor_association():
    if 'user_id' not in session or session['role'] != 'Patient':
        return jsonify({'error': 'Not authorized'}), 401
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Check if patient is associated with a doctor
        cursor.execute("""
            SELECT p.HasDoctor, p.DoctorID, d.FullName, d.Email, u.CreatedAt, dp.UserID as DoctorUserID
            FROM PatientProfiles p
            LEFT JOIN DoctorProfiles dp ON p.DoctorID = dp.DoctorID
            LEFT JOIN Users d ON dp.UserID = d.UserID
            LEFT JOIN Users u ON p.UserID = u.UserID
            WHERE p.UserID = ?
        """, (session['user_id'],))
        
        user_data = cursor.fetchone()
        
        if not user_data:
            return jsonify({'error': 'User not found'}), 404
        
        has_doctor = user_data[0]
        
        if has_doctor:
            return jsonify({
                'hasDoctor': True,
                'doctorId': user_data[1],
                'doctorName': user_data[2],
                'doctorEmail': user_data[3],
                'associationDate': user_data[4].strftime("%Y-%m-%d") if user_data[4] else None,
                'doctorUserId': user_data[5]  # Add doctor's UserID for chat
            })
        else:
            return jsonify({'hasDoctor': False})
    except Exception as e:
        print(f"Error in get_doctor_association: {str(e)}")
        return jsonify({'error': f'Database error: {str(e)}'}), 500
    finally:
        conn.close()

@patient_bp.route('/associate-doctor', methods=['POST'])
def associate_with_doctor():
    if 'user_id' not in session or session['role'] != 'Patient':
        return jsonify({'error': 'Not authorized'}), 401
    
    data = request.json
    doctor_id = data.get('doctorId')
    
    # Input validation
    if not doctor_id:
        return jsonify({'error': 'Doctor ID is required'}), 400
    
    # Clean up the doctor_id by removing any whitespace
    doctor_id = str(doctor_id).strip()
    
    # Validate doctor_id format (should be a string of 6 alphanumeric characters)
    # Make regex case-insensitive by using (?i) and allow both uppercase and lowercase
    if not re.match(r'^[A-Za-z0-9]{6}$', doctor_id):
        return jsonify({'error': 'Invalid Doctor ID format. Doctor ID should be a 6-character alphanumeric value.'}), 400
    
    # Convert doctor_id to uppercase to match how it's stored in the database
    doctor_id = doctor_id.upper()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # First verify the doctor exists
    cursor.execute("SELECT 1 FROM DoctorProfiles WHERE DoctorID = ?", (doctor_id,))
    doctor = cursor.fetchone()
    
    if not doctor:
        conn.close()
        return jsonify({'error': 'Invalid Doctor ID. Please check and try again.'}), 400
    
    # Associate patient with doctor
    try:
        # First, check if the patient already has a doctor association
        cursor.execute("SELECT HasDoctor, DoctorID FROM PatientProfiles WHERE UserID = ?", (session['user_id'],))
        patient_data = cursor.fetchone()
        
        if patient_data and patient_data[0] and patient_data[1] == doctor_id:
            # Already associated with this doctor
            conn.close()
            return jsonify({'message': 'You are already associated with this doctor'}), 200
        
        # Update the patient record
        cursor.execute("""
            UPDATE PatientProfiles 
            SET HasDoctor = 1, DoctorID = ? 
            WHERE UserID = ?
        """, (doctor_id, session['user_id']))
        
        conn.commit()
        conn.close()
        
        return jsonify({'message': 'Successfully associated with doctor'}), 200
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': str(e)}), 500

@patient_bp.route('/remove-doctor-association', methods=['POST'])
def remove_doctor_association():
    if 'user_id' not in session or session['role'] != 'Patient':
        return jsonify({'error': 'Not authorized'}), 401
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            UPDATE PatientProfiles 
            SET HasDoctor = 0, DoctorID = NULL 
            WHERE UserID = ?
        """, (session['user_id'],))
        
        conn.commit()
        conn.close()
        
        return jsonify({'message': 'Doctor association removed successfully'}), 200
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500
