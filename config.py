# config.py - Database Configuration

# Database Configuration
DB_CONFIG = {
    'DRIVER': '{ODBC Driver 17 for SQL Server}',
    'SERVER': 'GHAFIL',  # or 'localhost' depending on your setup
    'DATABASE': 'Automated FRT',  # Replace with your database name
    'Trusted_Connection': 'yes'  # This enables Windows Authentication
}

# Flask Session Configuration
SESSION_TYPE = 'filesystem'
SECRET_KEY = 'your-secret-key-here'
