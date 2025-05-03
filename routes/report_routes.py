from flask import Blueprint, jsonify, session
from database import get_db_connection
import os

report_bp = Blueprint('report', __name__)

@report_bp.route('/api/frt/latest-report', methods=['GET'])
def get_latest_report():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Get the latest report for the patient
        # Using TOP 1 instead of LIMIT for better SQL Server compatibility
        cursor.execute("""
            SELECT TOP 1 r.ReportID, r.FilePath, r.ReportType, r.GeneratedAt,
                   u.FullName as DoctorName,
                   (SELECT COUNT(*) FROM ReportTests rt WHERE rt.ReportID = r.ReportID) as TestCount
            FROM Reports r
            JOIN Users u ON r.DoctorID = u.UserID
            WHERE r.PatientID = ?
            ORDER BY r.GeneratedAt DESC
        """, (session['user_id'],))
        
        report = cursor.fetchone()
        
        if report:
            # Sanitize filepath to prevent XSS in front-end rendering
            safe_filepath = os.path.basename(report[1]) if report[1] else None
            
            return jsonify({
                'report': {
                    'ReportID': report[0],
                    'FilePath': safe_filepath,
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
