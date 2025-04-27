from flask import Blueprint, jsonify, session
from database import get_db_connection

report_bp = Blueprint('report', __name__)

@report_bp.route('/api/frt/latest-report', methods=['GET'])
def get_latest_report():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Get the latest report for the patient
        cursor.execute("""
            SELECT r.ReportID, r.FilePath, r.ReportType, r.GeneratedAt,
                   u.FullName as DoctorName,
                   (SELECT COUNT(*) FROM ReportTests rt WHERE rt.ReportID = r.ReportID) as TestCount
            FROM Reports r
            JOIN Users u ON r.DoctorID = u.UserID
            WHERE r.PatientID = ?
            ORDER BY r.GeneratedAt DESC
            LIMIT 1
        """, (session['user_id'],))
        
        report = cursor.fetchone()
        
        if report:
            return jsonify({
                'report': {
                    'ReportID': report[0],
                    'FilePath': report[1],
                    'ReportType': report[2],
                    'GeneratedAt': report[3],
                    'DoctorName': report[4],
                    'TestCount': report[5]
                }
            })
        else:
            return jsonify({'report': None})
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()
