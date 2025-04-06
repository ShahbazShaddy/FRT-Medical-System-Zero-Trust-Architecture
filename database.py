# database.py - Handles database connection

import pyodbc
from config import DB_CONFIG

# Establish connection to MS SQL Server
def get_db_connection():
    conn_str = f"DRIVER={DB_CONFIG['DRIVER']};SERVER={DB_CONFIG['SERVER']};DATABASE={DB_CONFIG['DATABASE']};Trusted_Connection=yes"
    return pyodbc.connect(conn_str)
