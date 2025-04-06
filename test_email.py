import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email_config import EMAIL_CONFIG

def test_email():
    EMAIL_HOST = EMAIL_CONFIG['HOST']
    EMAIL_PORT = EMAIL_CONFIG['PORT']
    EMAIL_USER = EMAIL_CONFIG['USER']
    EMAIL_PASSWORD = EMAIL_CONFIG['PASSWORD']
    
    print(f"Testing email with: {EMAIL_USER}")
    print(f"Password length: {len(EMAIL_PASSWORD)}")
    
    try:
        msg = MIMEMultipart()
        msg['From'] = EMAIL_USER
        msg['To'] = EMAIL_USER  # Send to yourself for testing
        msg['Subject'] = "Test Email from FRT Healthcare"
        
        msg.attach(MIMEText("This is a test email to verify SMTP settings.", 'plain'))
        
        with smtplib.SMTP(EMAIL_HOST, EMAIL_PORT) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(EMAIL_USER, EMAIL_PASSWORD)
            server.send_message(msg)
            
        print("Test email sent successfully!")
        return True
    except Exception as e:
        print(f"Test email failed: {str(e)}")
        return False

if __name__ == "__main__":
    test_email()
