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

@doctor_bp.route('/dashboard-stats')
def get_doctor_dashboard_stats():
    """Get statistics for the doctor dashboard"""
    if 'user_id' not in session or session.get('role') != 'Doctor':
        return jsonify({'error': 'Unauthorized access'}), 403
        
    doctor_id = session.get('user_id')
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get current month and previous month
        from datetime import datetime
        current_date = datetime.now()
        current_month = current_date.month
        current_year = current_date.year
        
        # Calculate previous month and year
        prev_month = current_month - 1 if current_month > 1 else 12
        prev_year = current_year if current_month > 1 else current_year - 1
        
        # 1. Active patients count
        cursor.execute("""
            SELECT COUNT(*) as active_patients 
            FROM PatientProfiles 
            WHERE DoctorID = (
                SELECT DoctorID FROM DoctorProfiles WHERE UserID = ?
            )
        """, (doctor_id,))
        active_patients = cursor.fetchone()[0] or 0
        
        # Count for previous month (patients who were added this month)
        cursor.execute("""
            SELECT COUNT(*) 
            FROM PatientProfiles pp
            JOIN Users u ON pp.UserID = u.UserID
            WHERE pp.DoctorID = (
                SELECT DoctorID FROM DoctorProfiles WHERE UserID = ?
            )
            AND MONTH(u.CreatedAt) = ? AND YEAR(u.CreatedAt) = ?
        """, (doctor_id, current_month, current_year))
        new_patients_this_month = cursor.fetchone()[0] or 0
        
        # 2. FRT Tests reviewed count
        cursor.execute("""
            SELECT COUNT(*) as tests_reviewed
            FROM FRTResults fr
            JOIN PatientProfiles pp ON fr.UserID = pp.UserID
            WHERE pp.DoctorID = (
                SELECT DoctorID FROM DoctorProfiles WHERE UserID = ?
            )
        """, (doctor_id,))
        tests_reviewed = cursor.fetchone()[0] or 0
        
        # Count tests from this month
        cursor.execute("""
            SELECT COUNT(*) 
            FROM FRTResults fr
            JOIN PatientProfiles pp ON fr.UserID = pp.UserID
            WHERE pp.DoctorID = (
                SELECT DoctorID FROM DoctorProfiles WHERE UserID = ?
            )
            AND MONTH(fr.CreatedAt) = ? AND YEAR(fr.CreatedAt) = ?
        """, (doctor_id, current_month, current_year))
        tests_this_month = cursor.fetchone()[0] or 0
        
        # Count tests from previous month
        cursor.execute("""
            SELECT COUNT(*) 
            FROM FRTResults fr
            JOIN PatientProfiles pp ON fr.UserID = pp.UserID
            WHERE pp.DoctorID = (
                SELECT DoctorID FROM DoctorProfiles WHERE UserID = ?
            )
            AND MONTH(fr.CreatedAt) = ? AND YEAR(fr.CreatedAt) = ?
        """, (doctor_id, prev_month, prev_year))
        tests_prev_month = cursor.fetchone()[0] or 0
        
        # 3. Reports generated count
        cursor.execute("""
            SELECT COUNT(*) as reports_generated
            FROM Reports
            WHERE DoctorID = ?
        """, (doctor_id,))
        reports_generated = cursor.fetchone()[0] or 0
        
        # Count reports from this month
        cursor.execute("""
            SELECT COUNT(*) 
            FROM Reports
            WHERE DoctorID = ?
            AND MONTH(GeneratedAt) = ? AND YEAR(GeneratedAt) = ?
        """, (doctor_id, current_month, current_year))
        reports_this_month = cursor.fetchone()[0] or 0
        
        # Count reports from previous month
        cursor.execute("""
            SELECT COUNT(*) 
            FROM Reports
            WHERE DoctorID = ?
            AND MONTH(GeneratedAt) = ? AND YEAR(GeneratedAt) = ?
        """, (doctor_id, prev_month, prev_year))
        reports_prev_month = cursor.fetchone()[0] or 0
        
        # Calculate month-over-month changes
        tests_change = tests_this_month - tests_prev_month
        reports_change = reports_this_month - reports_prev_month
        
        conn.close()
        
        return jsonify({
            'activePatients': {
                'count': active_patients,
                'newThisMonth': new_patients_this_month,
            },
            'testsReviewed': {
                'count': tests_reviewed,
                'change': tests_change
            },
            'reportsGenerated': {
                'count': reports_generated,
                'change': reports_change
            }
        })
        
    except Exception as e:
        if 'conn' in locals():
            conn.close()
        # SECURITY FIX: Don't expose detailed error information to client
        import traceback
        traceback.print_exc()  # Log detailed error for server-side debugging
        return jsonify({
            'error': 'Failed to fetch dashboard statistics'
        }), 500
