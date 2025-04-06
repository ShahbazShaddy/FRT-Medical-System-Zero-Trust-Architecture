from database import get_db_connection
import traceback

def setup_encryption_tables():
    """Create encryption-related database tables if they don't exist."""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # First check if the table exists
        cursor.execute("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'UserEncryptionKeys'")
        table_exists = cursor.fetchone()[0] > 0
        
        if not table_exists:
            print("Creating UserEncryptionKeys table...")
            try:
                cursor.execute("""
                    CREATE TABLE UserEncryptionKeys (
                        KeyID INT IDENTITY(1,1) PRIMARY KEY,
                        UserID INT NOT NULL,
                        PublicKey NVARCHAR(MAX) NOT NULL,
                        PrivateKey NVARCHAR(MAX) NOT NULL,
                        CreatedAt DATETIME DEFAULT GETDATE(),
                        FOREIGN KEY (UserID) REFERENCES Users(UserID)
                    )
                """)
                print("UserEncryptionKeys table created successfully")
            except Exception as create_error:
                print(f"Error creating UserEncryptionKeys table: {str(create_error)}")
                traceback.print_exc()
                raise create_error
        else:
            # Check if the table has the required columns
            print("Checking UserEncryptionKeys columns...")
            required_columns = ['KeyID', 'UserID', 'PublicKey', 'PrivateKey', 'CreatedAt']
            
            for column in required_columns:
                cursor.execute(f"""
                    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = 'UserEncryptionKeys' AND COLUMN_NAME = '{column}'
                """)
                has_column = cursor.fetchone()[0] > 0
                
                if not has_column:
                    print(f"Missing required column: {column}")
                    print("Dropping and recreating UserEncryptionKeys table...")
                    
                    # Drop and recreate the table if it's missing columns
                    cursor.execute("DROP TABLE UserEncryptionKeys")
                    cursor.execute("""
                        CREATE TABLE UserEncryptionKeys (
                            KeyID INT IDENTITY(1,1) PRIMARY KEY,
                            UserID INT NOT NULL,
                            PublicKey NVARCHAR(MAX) NOT NULL,
                            PrivateKey NVARCHAR(MAX) NOT NULL,
                            CreatedAt DATETIME DEFAULT GETDATE(),
                            FOREIGN KEY (UserID) REFERENCES Users(UserID)
                        )
                    """)
                    print("UserEncryptionKeys table recreated successfully")
                    break

        # Check if ChatMessages table exists
        cursor.execute("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ChatMessages'")
        chat_table_exists = cursor.fetchone()[0] > 0
        
        if chat_table_exists:
            # Check if the new dual-encryption columns exist
            cursor.execute("""
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'ChatMessages' AND COLUMN_NAME = 'SenderEncryptedMessage'
            """)
            has_sender_column = cursor.fetchone()[0] > 0
            
            cursor.execute("""
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'ChatMessages' AND COLUMN_NAME = 'RecipientEncryptedMessage'
            """)
            has_recipient_column = cursor.fetchone()[0] > 0
            
            # Handle existing EncryptedMessage column
            cursor.execute("""
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'ChatMessages' AND COLUMN_NAME = 'EncryptedMessage'
            """)
            has_old_column = cursor.fetchone()[0] > 0
            
            # Add the new columns if they don't exist
            if not has_sender_column:
                print("Adding SenderEncryptedMessage column to ChatMessages table...")
                cursor.execute("""
                    ALTER TABLE ChatMessages
                    ADD SenderEncryptedMessage NVARCHAR(MAX) NULL
                """)
                print("SenderEncryptedMessage column added successfully")
                
            if not has_recipient_column:
                print("Adding RecipientEncryptedMessage column to ChatMessages table...")
                cursor.execute("""
                    ALTER TABLE ChatMessages
                    ADD RecipientEncryptedMessage NVARCHAR(MAX) NULL
                """)
                print("RecipientEncryptedMessage column added successfully")
                
            # If we're migrating from the old schema, copy data and drop the old column
            if has_old_column and has_sender_column and has_recipient_column:
                print("Migrating data from EncryptedMessage to dual-encryption columns...")
                cursor.execute("""
                    UPDATE ChatMessages 
                    SET RecipientEncryptedMessage = EncryptedMessage,
                        SenderEncryptedMessage = EncryptedMessage
                    WHERE EncryptedMessage IS NOT NULL
                """)
                
                print("Dropping old EncryptedMessage column...")
                cursor.execute("""
                    ALTER TABLE ChatMessages
                    DROP COLUMN EncryptedMessage
                """)
                print("Old column dropped successfully")
        else:
            print("ChatMessages table doesn't exist yet. It will be created when needed.")

        conn.commit()
        print("Encryption tables setup complete!")
        return True
    except Exception as e:
        conn.rollback()
        print(f"Error setting up encryption tables: {str(e)}")
        traceback.print_exc()
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    setup_encryption_tables()
