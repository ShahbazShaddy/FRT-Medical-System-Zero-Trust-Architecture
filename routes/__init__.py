# Package initialization file
from flask import Blueprint

# Import all blueprint modules to make them available when importing the package
from .patient_routes import patient_bp
from .doctor_routes import doctor_bp
from .chat_routes import chat_bp
from .profile_routes import profile_bp
from .encryption_routes import encryption_bp
from .frt_routes import frt_bp
from .page_routes import page_bp

# List of all blueprints for easy registration
all_blueprints = [
    patient_bp,
    doctor_bp,
    chat_bp,
    profile_bp,
    encryption_bp,
    frt_bp,
    page_bp
]

def register_blueprints(app):
    """Register all route blueprints with the Flask app"""
    for blueprint in all_blueprints:
        app.register_blueprint(blueprint)
