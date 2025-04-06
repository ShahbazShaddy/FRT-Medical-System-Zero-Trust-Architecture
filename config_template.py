# Configuration template (rename to config.py when deployed)
# DO NOT add actual secrets to this template file

# Database configuration
DB_CONFIG = {
    'server': 'your_server_name',  # Replace with actual server in local config
    'database': 'your_database_name',  # Replace with actual database in local config
    'trusted_connection': 'yes'  # Use Windows authentication
}

# Security settings
SECRET_KEY = 'replace_with_strong_random_key'  # Replace with actual key in local config
SESSION_TIMEOUT = 30  # minutes

# Encryption settings (Only store public parameters, not private keys)
ENCRYPTION_CONFIG = {
    'key_algorithm': 'RSA-OAEP',
    'key_length': 2048,
    'hash_algorithm': 'SHA-256'
}

# Template values - REPLACE THESE IN YOUR LOCAL CONFIG.PY FILE
# DO NOT COMMIT THE ACTUAL CONFIG.PY WITH REAL VALUES