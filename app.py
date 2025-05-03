import os
from flask import Flask, session, jsonify, request, render_template
from flask_session import Session
from datetime import timedelta
from flask_socketio import SocketIO, join_room, leave_room
import traceback
from setup_tables import setup_encryption_tables
import chatbot  # Import the new chatbot module

try:
    from config import SECRET_KEY, DB_CONFIG
except ImportError:
    print("WARNING: Using config_template.py instead of config.py.")
    print("Please create a config.py file with your actual configuration settings.")
    print("See config_template.py for reference.")
    from config_template import SECRET_KEY, DB_CONFIG

app = Flask(__name__)
app.secret_key = SECRET_KEY
app.config['SESSION_TYPE'] = 'filesystem'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=30)
Session(app)

# Initialize SocketIO with the app
socketio = SocketIO(app, cors_allowed_origins="*")

# Create uploads directory
UPLOAD_DIR = 'uploads'
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Import and register blueprints from routes package
from routes import register_blueprints
register_blueprints(app)

# Import auth blueprint and register it
from auth import auth_bp
app.register_blueprint(auth_bp, url_prefix='/auth')

# Initialize socketio for chat routes
from routes.chat_routes import init_socketio
init_socketio(socketio)

# Simple initialization function to be called when needed
def initialize_app():
    """Initialize database tables needed for the application"""
    setup_encryption_tables()

# Add this initialization route (accessible to doctors)
@app.route('/init-app', methods=['GET'])
def init_app_route():
    if 'user_id' in session and session.get('role') == 'Doctor':
        initialize_app()
        return jsonify({'message': 'Application initialized successfully'}), 200
    return jsonify({'error': 'Not authorized'}), 401

# Add compatibility routes for existing frontend
@app.route('/chat', methods=['POST'])
def chat_legacy():
    """Legacy route that forwards to the new chatbot endpoint"""
    from routes.chat_routes import chat_with_bot
    return chat_with_bot()

@app.route('/api/doctor-info')
def doctor_info_legacy():
    """Legacy route that forwards to the new doctor info endpoint"""
    from routes.doctor_routes import get_doctor_info
    return get_doctor_info()

@app.route('/faqs')
def faqs():
    return render_template('faqs.html')

# Add dashboard statistics endpoint
@app.route('/api/patient/dashboard-stats')
def get_dashboard_stats():
    """API endpoint to get dashboard statistics data for the patient dashboard"""
    from datetime import datetime
    import sqlite3
    
    try:
        if 'user_id' not in session:
            return jsonify({'error': 'Not authenticated'}), 401
            
        user_id = session.get('user_id')
        
        # Connect to the database using a context manager to ensure connection is closed
        with sqlite3.connect('instance/database.db') as conn:
            conn.row_factory = sqlite3.Row
            db = conn.cursor()
            
            # Get the last assessment data
            last_assessment_query = """
                SELECT date, risk_level FROM FunctionalReachTests 
                WHERE patient_id = ? ORDER BY date DESC LIMIT 1
            """
            last_assessment = db.execute(last_assessment_query, (user_id,)).fetchone()
            
            # Get tests count
            tests_count_query = """
                SELECT COUNT(*) as count FROM FunctionalReachTests 
                WHERE patient_id = ?
            """
            tests_count = db.execute(tests_count_query, (user_id,)).fetchone()
            total_count = tests_count['count'] if tests_count else 0
            
            # Get current month vs previous month comparison
            current_month = datetime.now().month
            current_year = datetime.now().year
            
            # Format response data with user-friendly empty states
            response_data = {
                'lastAssessment': {
                    'date': last_assessment['date'] if last_assessment else "No tests yet",
                    'status': last_assessment['risk_level'] if last_assessment else "No data"
                },
                'testsCompleted': {
                    'count': total_count,
                    'change': None  # We'll leave this null for now
                },
                'avgDistance': {
                    'value': None,
                    'change': None
                }
            }
            
            # Only calculate average distance if there are tests
            if total_count > 0:
                # Get average distance
                avg_distance_query = """
                    SELECT AVG(max_distance) as avg_distance FROM FunctionalReachTests 
                    WHERE patient_id = ? AND max_distance > 0
                """
                avg_distance = db.execute(avg_distance_query, (user_id,)).fetchone()
                
                if avg_distance and avg_distance['avg_distance']:
                    response_data['avgDistance']['value'] = round(avg_distance['avg_distance'], 1)
        
        return jsonify(response_data)
        
    except sqlite3.Error as e:
        print(f"Database error in dashboard stats: {e}")
        return jsonify({
            'lastAssessment': {'date': "No tests yet", 'status': "Database error"},
            'testsCompleted': {'count': 0, 'change': None},
            'avgDistance': {'value': None, 'change': None}
        }), 500
    except Exception as e:
        print(f"Error getting dashboard stats: {e}")
        # Return empty data with appropriate messages instead of error
        return jsonify({
            'lastAssessment': {'date': "No tests yet", 'status': "No records found"},
            'testsCompleted': {'count': 0, 'change': None},
            'avgDistance': {'value': None, 'change': None}
        })

# WebSocket event handlers
@socketio.on('connect')
def handle_connect():
    if 'user_id' not in session:
        return False  # Reject the connection
    
    # Join a room for this user to receive private messages
    join_room(f"user_{session['user_id']}")
    print(f"User {session['user_id']} connected to WebSocket")

@socketio.on('disconnect')
def handle_disconnect():
    if 'user_id' in session:
        leave_room(f"user_{session['user_id']}")
        print(f"User {session['user_id']} disconnected from WebSocket")

# Update the app.run() to use SocketIO
if __name__ == "__main__":
    socketio.run(app, debug=True)