from database import get_db_connection

try:
    conn = get_db_connection()
    print("Connection successful!")
    conn.close()
except Exception as e:
    print(f"Connection failed: {str(e)}")
