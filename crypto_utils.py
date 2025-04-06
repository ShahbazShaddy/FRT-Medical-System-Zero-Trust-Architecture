from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
import os
import json
import base64

def generate_key_pair():
    """Generate a new RSA key pair"""
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend()
    )
    public_key = private_key.public_key()
    
    # Serialize keys to PEM format
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )
    
    return {
        'private_key': private_pem.decode('utf-8'),
        'public_key': public_pem.decode('utf-8')
    }

def encrypt_message(message, recipient_public_key_pem):
    """Encrypt a message using recipient's public key"""
    # Load recipient's public key
    recipient_public_key = serialization.load_pem_public_key(
        recipient_public_key_pem.encode('utf-8'),
        backend=default_backend()
    )
    
    # Generate a random symmetric key
    symmetric_key = os.urandom(32)  # 256-bit key
    
    # Encrypt the message with the symmetric key
    iv = os.urandom(16)  # 128-bit IV
    cipher = Cipher(algorithms.AES(symmetric_key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    
    # Pad the message to be a multiple of 16 bytes (AES block size)
    padded_message = message.encode('utf-8')
    padding_length = 16 - (len(padded_message) % 16)
    padded_message += bytes([padding_length]) * padding_length
    
    # Encrypt the message
    encrypted_message = encryptor.update(padded_message) + encryptor.finalize()
    
    # Encrypt the symmetric key with the recipient's public key
    encrypted_symmetric_key = recipient_public_key.encrypt(
        symmetric_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )
    
    # Return the encrypted message, IV, and encrypted symmetric key
    result = {
        'encrypted_message': base64.b64encode(encrypted_message).decode('utf-8'),
        'iv': base64.b64encode(iv).decode('utf-8'),
        'encrypted_key': base64.b64encode(encrypted_symmetric_key).decode('utf-8')
    }
    
    return json.dumps(result)

def decrypt_message(encrypted_data, private_key_pem):
    """Decrypt a message using private key"""
    # Parse the encrypted data
    data = json.loads(encrypted_data)
    encrypted_message = base64.b64decode(data['encrypted_message'])
    iv = base64.b64decode(data['iv'])
    encrypted_key = base64.b64decode(data['encrypted_key'])
    
    # Load private key
    private_key = serialization.load_pem_private_key(
        private_key_pem.encode('utf-8'),
        password=None,
        backend=default_backend()
    )
    
    # Decrypt the symmetric key
    symmetric_key = private_key.decrypt(
        encrypted_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )
    
    # Decrypt the message using the symmetric key
    cipher = Cipher(algorithms.AES(symmetric_key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    padded_message = decryptor.update(encrypted_message) + decryptor.finalize()
    
    # Remove padding
    padding_length = padded_message[-1]
    message = padded_message[:-padding_length]
    
    return message.decode('utf-8')
