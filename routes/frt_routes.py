from flask import Blueprint, jsonify, session, request, send_file
from database import get_db_connection
import os
import time
import asyncio
from frt_processing import process_frt, live_frt
from video_upload import upload_video
from utils.pdf_generator import create_medical_report, get_groq_analysis

# Create the directory for storing report files
REPORTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'generated_reports')
os.makedirs(REPORTS_DIR, exist_ok=True)

frt_bp = Blueprint('frt', __name__, url_prefix='/api/frt')

# Configure uploads directory
UPLOAD_DIR = 'uploads'
os.makedirs(UPLOAD_DIR, exist_ok=True)

@frt_bp.route('/history')
def get_frt_history():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(""" 
        SELECT ResultID, MaxDistance, RiskLevel, CreatedAt, Symptoms 
        FROM FRTResults 
        WHERE UserID = ? 
        ORDER BY CreatedAt DESC""", 
        (session['user_id'],))
    
    results = []
    for row in cursor.fetchall():
        results.append({
            'id': row[0],
            'maxDistance': row[1],
            'riskLevel': row[2],
            'date': row[3].strftime("%Y-%m-%d %H:%M:%S"),
            'symptoms': row[4]
        })
    
    conn.close()
    return jsonify(results)

@frt_bp.route('/save-result', methods=['POST'])
def save_frt_result():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
        
    data = request.json
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            INSERT INTO FRTResults (UserID, MaxDistance, RiskLevel, Symptoms)
            VALUES (?, ?, ?, ?)
        """, (session['user_id'], data['maxDistance'], data['riskLevel'], data['symptoms']))
        conn.commit()
        return jsonify({'message': 'Result saved successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@frt_bp.route('/upload', methods=['POST'])
def upload():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
        
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400

    video_file = request.files['video']
    if video_file:
        filename, error = upload_video(video_file)
        if error:
            return jsonify({'error': error}), 400
        
        video_path = os.path.join(UPLOAD_DIR, filename)
        result = process_frt(video_path)
        print(result)
        return jsonify({'filename': filename, 'result': result}), 200

    return jsonify({'error': 'File upload failed'}), 500

@frt_bp.route('/live', methods=['GET'])
def live_frt_route():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
        
    result = live_frt()
    return jsonify({'result': result})

# Route to get the logged-in doctor's own FRT history
@frt_bp.route('/doctor-history')
def get_doctor_frt_history():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    # Verify user is a doctor (optional but good practice)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT Role FROM Users WHERE UserID = ?", (session['user_id'],))
    user = cursor.fetchone()

    if not user or user[0] != 'Doctor':
         # Even if not strictly necessary for fetching own data, keeps roles clear
        conn.close()
        return jsonify({'error': 'Unauthorized access'}), 403

    try:
        cursor.execute("""
            SELECT ResultID, MaxDistance, RiskLevel, CreatedAt, Symptoms
            FROM FRTResults
            WHERE UserID = ?
            ORDER BY CreatedAt DESC
        """, (session['user_id'],))

        results = []
        for row in cursor.fetchall():
            results.append({
                'id': row[0],
                'maxDistance': row[1],
                'riskLevel': row[2],
                'date': row[3].strftime("%Y-%m-%d %H:%M:%S"), # Consistent date format
                'symptoms': row[4]
            })

        conn.close()
        return jsonify(results)

    except Exception as e:
        if 'conn' in locals() and conn:
             conn.close()
        return jsonify({'error': str(e)}), 500

# Route to get patient-specific FRT results (existing route)
@frt_bp.route('/patient-results/<int:patient_id>')
def get_patient_results(patient_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
        
    # Verify that the requester is a doctor
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Check if user is a doctor
        cursor.execute("SELECT Role FROM Users WHERE UserID = ?", (session['user_id'],))
        user = cursor.fetchone()
        
        if not user or user[0] != 'Doctor':
            return jsonify({'error': 'Unauthorized access'}), 403
        
        # Get patient's name
        cursor.execute("SELECT FullName FROM Users WHERE UserID = ?", (patient_id,))
        patient = cursor.fetchone()
        
        if not patient:
            return jsonify({'error': 'Patient not found'}), 404
            
        # Get patient's FRT results
        cursor.execute("""
            SELECT ResultID, MaxDistance, RiskLevel, CreatedAt, Symptoms 
            FROM FRTResults 
            WHERE UserID = ? 
            ORDER BY CreatedAt DESC
        """, (patient_id,))
        
        results = []
        for row in cursor.fetchall():
            results.append({
                'id': row[0],
                'maxDistance': row[1],
                'riskLevel': row[2],
                'date': row[3],
                'symptoms': row[4]
            })
        
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@frt_bp.route('/generate-report', methods=['POST'])
def generate_report():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
        
    data = request.json
    patient_id = data.get('patientId')
    test_ids = data.get('testIds', [])
    
    if not patient_id or not test_ids:
        return jsonify({'error': 'Missing required parameters'}), 400
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get doctor information
        cursor.execute("""
            SELECT u.FullName, dp.Specialization, dp.HospitalClinic
            FROM Users u
            LEFT JOIN DoctorProfiles dp ON u.UserID = dp.UserID
            WHERE u.UserID = ? AND u.Role = 'Doctor'
        """, (session['user_id'],))
        
        doctor_row = cursor.fetchone()
        if not doctor_row:
            return jsonify({'error': 'Doctor profile not found'}), 404
        
        doctor_data = {
            'userId': session['user_id'],
            'fullName': doctor_row[0],
            'specialization': doctor_row[1],
            'hospital_clinic': doctor_row[2]
        }
        
        # Get patient information
        cursor.execute("""
            SELECT u.FullName, pp.DOB, pp.Gender, pp.MedicalHistory
            FROM Users u
            LEFT JOIN PatientProfiles pp ON u.UserID = pp.UserID
            WHERE u.UserID = ?
        """, (patient_id,))
        
        patient_row = cursor.fetchone()
        if not patient_row:
            return jsonify({'error': 'Patient profile not found'}), 404
        
        # Calculate age if DOB is available
        age = None
        if patient_row[1]:
            from datetime import datetime
            try:
                dob = datetime.strptime(patient_row[1], '%Y-%m-%d')
                today = datetime.today()
                age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
            except (ValueError, TypeError):
                # Handle date parsing errors
                age = 'Unknown'
        
        patient_data = {
            'userId': patient_id,
            'fullName': patient_row[0],
            'age': age or 'Not provided',
            'gender': patient_row[2] or 'Not provided',
            'medicalHistory': patient_row[3] or 'Not provided'
        }
        
        # Ensure test_ids contains only integers to prevent SQL injection
        try:
            test_ids = [int(test_id) for test_id in test_ids]
            patient_id = int(patient_id)  # Ensure patient_id is also an integer
        except ValueError:
            return jsonify({'error': 'Invalid test ID or patient ID format'}), 400
        
        # Get test results - create parameterized query with appropriate number of placeholders
        if not test_ids:
            return jsonify({'error': 'No test IDs provided'}), 400
            
        test_id_placeholders = ','.join(['?' for _ in test_ids])
        
        query = """
            SELECT ResultID, MaxDistance, RiskLevel, CreatedAt, Symptoms 
            FROM FRTResults 
            WHERE ResultID IN ({}) AND UserID = ?
        """.format(test_id_placeholders)
        
        # Execute with integer IDs and patient_id at the end
        cursor.execute(query, test_ids + [patient_id])
        
        test_results = []
        for row in cursor.fetchall():
            # Convert SQL date to string to avoid strptime issues
            date_str = row[3].strftime("%Y-%m-%d %H:%M:%S") if row[3] else None
            
            test_results.append({
                'id': row[0],
                'maxDistance': row[1],
                'riskLevel': row[2],
                'date': date_str,
                'symptoms': row[4]
            })
        
        if not test_results:
            return jsonify({'error': 'No test results found'}), 404
        
        # Get AI analysis using Groq
        analysis_text = asyncio.run(get_groq_analysis(patient_data, test_results))
        
        # Generate the PDF report
        report_info = create_medical_report(doctor_data, patient_data, test_results, analysis_text)
        
        # Store report reference in database with all required columns
        cursor.execute("""
            INSERT INTO Reports (DoctorID, PatientID, FilePath, ReportName, ReportType, IncludedTestIDs, GeneratedAt)
            VALUES (?, ?, ?, ?, ?, ?, GETDATE())
        """, (
            session['user_id'], 
            patient_id, 
            report_info['filepath'],
            report_info['reportName'],
            'FRT',  # Default report type
            report_info['includedTestIds']
        ))
        
        conn.commit()
        
        return jsonify({
            'message': 'Report generated successfully',
            'reportUrl': report_info['url']
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@frt_bp.route('/reports/download/<filename>')
def download_report(filename):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    # Security check - verify the user has access to this report
    filepath = os.path.join(REPORTS_DIR, filename)
    
    if not os.path.exists(filepath):
        return jsonify({'error': 'Report not found'}), 404
    
    # Send the file as attachment
    return send_file(filepath, as_attachment=True)

@frt_bp.route('/recommend-test', methods=['POST'])
def recommend_test():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
        
    data = request.json
    patient_id = data.get('patientId')
    
    if not patient_id:
        return jsonify({'error': 'Missing patient ID'}), 400
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Store recommendation in database
        cursor.execute("""
            INSERT INTO TestRecommendations (DoctorID, PatientID, RecommendedAt, Status)
            VALUES (?, ?, GETDATE(), 'Pending')
        """, (session['user_id'], patient_id))
        
        conn.commit()
        
        return jsonify({'message': 'Test recommendation sent successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@frt_bp.route('/latest-report')
def get_latest_report():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Get the latest report for the current patient
        cursor.execute("""
            SELECT r.ReportID, r.FilePath, r.ReportName, r.ReportType, r.GeneratedAt,
                   u.FullName as DoctorName,
                   (SELECT COUNT(value) FROM STRING_SPLIT(r.IncludedTestIDs, ',')) as TestCount
            FROM Reports r
            JOIN Users u ON r.DoctorID = u.UserID
            WHERE r.PatientID = ?
            ORDER BY r.GeneratedAt DESC
        """, (session['user_id'],))
        
        report = cursor.fetchone()
        
        if report:
            # Format the data for the frontend
            report_data = {
                'report': {
                    'ReportID': report[0],
                    'FilePath': f"/api/frt/reports/download/{os.path.basename(report[1])}",
                    'ReportName': report[2],
                    'ReportType': report[3],
                    'GeneratedAt': report[4].strftime("%Y-%m-%d %H:%M:%S") if report[4] else None,
                    'DoctorName': report[5],
                    'TestCount': report[6] or 0
                }
            }
            return jsonify(report_data)
        else:
            return jsonify({'report': None})
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@frt_bp.route('/test-details/<int:test_id>')
def get_test_details(test_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
        
    # Verify that the requester is a doctor
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Check if user is a doctor
        cursor.execute("SELECT Role FROM Users WHERE UserID = ?", (session['user_id'],))
        user = cursor.fetchone()
        
        if not user or user[0] != 'Doctor':
            return jsonify({'error': 'Unauthorized access'}), 403
        
        # Get the test details
        cursor.execute("""
            SELECT r.ResultID, r.MaxDistance, r.RiskLevel, r.CreatedAt, r.Symptoms, u.FullName, u.UserID
            FROM FRTResults r
            JOIN Users u ON r.UserID = u.UserID
            WHERE r.ResultID = ?
        """, (test_id,))
        
        test = cursor.fetchone()
        
        if not test:
            return jsonify({'error': 'Test not found'}), 404
            
        test_details = {
            'id': test[0],
            'maxDistance': test[1],
            'riskLevel': test[2],
            'date': test[3].strftime("%Y-%m-%d %H:%M:%S") if test[3] else None,
            'symptoms': test[4],
            'patientName': test[5],
            'patientId': test[6]
        }
        
        return jsonify(test_details)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()
