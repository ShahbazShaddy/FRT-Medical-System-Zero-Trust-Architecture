from flask import Blueprint, jsonify, session, request
from database import get_db_connection
import os
from frt_processing import process_frt, live_frt
from video_upload import upload_video

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
