from flask import Blueprint, render_template, redirect, session
from database import get_db_connection

page_bp = Blueprint('pages', __name__)

@page_bp.route('/login')
def login_page():
    return render_template('login.html')

@page_bp.route('/signup')
def signup_page():
    return render_template('signup.html')

@page_bp.route('/')
def root():
    return render_template('home.html')

@page_bp.route('/chat')
def chat_page():
    if 'user_id' not in session:
        return redirect('/login')
    return render_template('index.html')

@page_bp.route('/patient-dashboard')
def patient_dashboard():
    if 'user_id' not in session or session['role'] != 'Patient':
        return redirect('/login')
    
    # Check if profile is completed
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT ProfileCompleted FROM Users WHERE UserID = ?", (session['user_id'],))
    profile_completed = cursor.fetchone()[0]
    conn.close()
    
    if not profile_completed:
        return redirect('/complete-profile')
    
    return render_template('patient-dashboard.html')

@page_bp.route('/doctor-dashboard')
def doctor_dashboard():
    if 'user_id' not in session or session['role'] != 'Doctor':
        return redirect('/login')
    
    # Check if profile is completed
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT ProfileCompleted FROM Users WHERE UserID = ?", (session['user_id'],))
    profile_completed = cursor.fetchone()[0]
    conn.close()
    
    if not profile_completed:
        return redirect('/complete-profile')
    
    return render_template('doctor-dashboard.html')

@page_bp.route('/complete-profile')
def complete_profile_page():
    if 'user_id' not in session:
        return redirect('/login')
    
    # Check if profile is already completed
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT ProfileCompleted FROM Users WHERE UserID = ?", (session['user_id'],))
    profile_completed = cursor.fetchone()[0]
    conn.close()
    
    if profile_completed:
        # If profile is already completed, redirect to the appropriate dashboard
        if session['role'] == 'Patient':
            return redirect('/patient-dashboard')
        else:
            return redirect('/doctor-dashboard')
    
    # If profile is not completed, redirect to the appropriate profile completion page
    if session['role'] == 'Patient':
        return render_template('patient-profile.html')
    else:  # Doctor
        return render_template('doctor-profile.html')
