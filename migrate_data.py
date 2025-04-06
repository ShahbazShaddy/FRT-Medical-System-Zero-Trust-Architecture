# Script to migrate data from old schema to new normalized schema
from database import get_db_connection

def migrate_data():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        print("Starting migration...")
        
        # Check if new tables exist
        cursor.execute("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DoctorProfiles'")
        if cursor.fetchone()[0] == 0:
            print("Error: New tables do not exist. Please run create_normalized_tables.sql first.")
            return
        
        # Get all users from old table
        cursor.execute("""
            SELECT UserID, FullName, Email, PasswordHash, Role, CreatedAt, ProfileCompleted, PhoneNumber,
                   DOB, Gender, Address, EmergencyContact, EmergencyPhone, MedicalHistory,
                   HasDoctor, DoctorID, PMDC_No,
                   Specialization, OfficeHours, HospitalClinic, Experience, Education
            FROM Users
        """)
        
        users = cursor.fetchall()
        print(f"Found {len(users)} users to migrate.")
        
        # For each user, insert into new tables
        for user in users:
            user_id = user[0]
            role = user[4]
            
            # Insert into new Users table
            cursor.execute("""
                INSERT INTO Users (UserID, FullName, Email, PasswordHash, Role, CreatedAt, ProfileCompleted, PhoneNumber)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (user[0], user[1], user[2], user[3], user[4], user[5], user[6], user[7]))
            
            # Create profile based on role
            if role == 'Patient':
                cursor.execute("""
                    INSERT INTO PatientProfiles (UserID, DOB, Gender, Address, EmergencyContact, EmergencyPhone, MedicalHistory, HasDoctor, DoctorID)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (user_id, user[8], user[9], user[10], user[11], user[12], user[13], user[14], user[15]))
                
            elif role == 'Doctor':
                cursor.execute("""
                    INSERT INTO DoctorProfiles (UserID, DoctorID, PMDC_No, Specialization, OfficeHours, HospitalClinic, Experience, Education)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (user_id, user[15], user[16], user[17], user[18], user[19], user[20], user[21]))
            
            print(f"Migrated user {user_id} ({role})")
        
        print("Migration completed successfully!")
        
    except Exception as e:
        print(f"Migration failed: {str(e)}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_data()
