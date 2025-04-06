from flask import Blueprint, jsonify, session, redirect
from database import get_db_connection

doctor_bp = Blueprint('doctor', __name__, url_prefix='/api/doctor')

@doctor_bp.route('/info')
def get_doctor_info():
    if 'user_id' not in session or session['role'] != 'Doctor':
        return jsonify({'error': 'Not authorized'}), 401
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT DoctorID FROM DoctorProfiles WHERE UserID = ?", (session['user_id'],))
    doctor_data = cursor.fetchone()
    conn.close()
    
    if doctor_data:
        return jsonify({'doctorId': doctor_data[0]})
    
    return jsonify({'error': 'Doctor information not found'}), 404

@doctor_bp.route('/patients')
def get_doctor_patients():
    if 'user_id' not in session or session['role'] != 'Doctor':
        return jsonify({'error': 'Not authorized'}), 401
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get the doctor's ID
    cursor.execute("SELECT DoctorID FROM DoctorProfiles WHERE UserID = ?", (session['user_id'],))
    doctor_id_row = cursor.fetchone()
    
    if not doctor_id_row:
        conn.close()
        return jsonify({'error': 'Doctor ID not found'}), 404
    
    doctor_id = doctor_id_row[0]
    
    # Get all patients associated with this doctor
    cursor.execute("""
        SELECT u.UserID, u.FullName, u.Email, u.CreatedAt 
        FROM Users u
        JOIN PatientProfiles p ON u.UserID = p.UserID
        WHERE u.Role = 'Patient' AND p.HasDoctor = 1 AND p.DoctorID = ?
    """, (doctor_id,))
    
    patients = []
    for row in cursor.fetchall():
        patients.append({
            'userId': row[0],
            'fullName': row[1],
            'email': row[2],
            'createdAt': row[3].strftime("%Y-%m-%d")
        })
    
    conn.close()
    return jsonify(patients)
