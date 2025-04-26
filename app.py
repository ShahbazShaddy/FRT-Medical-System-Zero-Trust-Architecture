import os
from flask import Flask, session, jsonify, request
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