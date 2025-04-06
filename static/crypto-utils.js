/**
 * Utility functions for end-to-end encryption in the browser
 */

const crypto_utils = {
    /**
     * Generate a key pair for the current user
     */
    async generateKeyPair() {
        const keyPair = await window.crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256",
            },
            true,
            ["encrypt", "decrypt"]
        );
        
        // Export the keys to PEM format
        const publicKeyPem = await this.exportPublicKey(keyPair.publicKey);
        const privateKeyPem = await this.exportPrivateKey(keyPair.privateKey);
        
        return {
            publicKey: publicKeyPem,
            privateKey: privateKeyPem
        };
    },
    
    /**
     * Export a public key to PEM format
     */
    async exportPublicKey(key) {
        const exported = await window.crypto.subtle.exportKey("spki", key);
        const exportedAsString = this.arrayBufferToBase64(exported);
        const pemExported = `-----BEGIN PUBLIC KEY-----\n${exportedAsString}\n-----END PUBLIC KEY-----`;
        return pemExported;
    },
    
    /**
     * Export a private key to PEM format
     */
    async exportPrivateKey(key) {
        const exported = await window.crypto.subtle.exportKey("pkcs8", key);
        const exportedAsString = this.arrayBufferToBase64(exported);
        const pemExported = `-----BEGIN PRIVATE KEY-----\n${exportedAsString}\n-----END PRIVATE KEY-----`;
        return pemExported;
    },
    
    /**
     * Import a public key from PEM format
     */
    async importPublicKey(pem) {
        // Convert PEM to binary
        const pemHeader = "-----BEGIN PUBLIC KEY-----";
        const pemFooter = "-----END PUBLIC KEY-----";
        const pemContents = pem.substring(
            pemHeader.length,
            pem.length - pemFooter.length - 1
        ).replace(/\n/g, "");
        
        const binaryDer = this.base64ToArrayBuffer(pemContents);
        
        return window.crypto.subtle.importKey(
            "spki",
            binaryDer,
            {
                name: "RSA-OAEP",
                hash: "SHA-256",
            },
            true,
            ["encrypt"]
        );
    },
    
    /**
     * Import a private key from PEM format
     */
    async importPrivateKey(pem) {
        // Convert PEM to binary
        const pemHeader = "-----BEGIN PRIVATE KEY-----";
        const pemFooter = "-----END PRIVATE KEY-----";
        const pemContents = pem.substring(
            pemHeader.length,
            pem.length - pemFooter.length - 1
        ).replace(/\n/g, "");
        
        const binaryDer = this.base64ToArrayBuffer(pemContents);
        
        return window.crypto.subtle.importKey(
            "pkcs8",
            binaryDer,
            {
                name: "RSA-OAEP",
                hash: "SHA-256",
            },
            true,
            ["decrypt"]
        );
    },
    
    /**
     * Encrypt a message with the recipient's public key
     */
    async encrypt_message(message, recipientPublicKeyPem) {
        try {
            // Import the recipient's public key
            const recipientPublicKey = await this.importPublicKey(recipientPublicKeyPem);
            
            // Generate a random symmetric key
            const symmetricKey = await window.crypto.subtle.generateKey(
                {
                    name: "AES-GCM",
                    length: 256,
                },
                true,
                ["encrypt", "decrypt"]
            );
            
            // Encrypt the message with the symmetric key
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const encodedMessage = new TextEncoder().encode(message);
            
            const encryptedMessage = await window.crypto.subtle.encrypt(
                {
                    name: "AES-GCM",
                    iv: iv
                },
                symmetricKey,
                encodedMessage
            );
            
            // Export the symmetric key
            const rawSymmetricKey = await window.crypto.subtle.exportKey("raw", symmetricKey);
            
            // Encrypt the symmetric key with the recipient's public key
            const encryptedSymmetricKey = await window.crypto.subtle.encrypt(
                {
                    name: "RSA-OAEP"
                },
                recipientPublicKey,
                rawSymmetricKey
            );
            
            // Return everything needed to decrypt
            return JSON.stringify({
                encryptedMessage: this.arrayBufferToBase64(encryptedMessage),
                iv: this.arrayBufferToBase64(iv),
                encryptedSymmetricKey: this.arrayBufferToBase64(encryptedSymmetricKey)
            });
        } catch (error) {
            console.error("Encryption error:", error);
            throw error;
        }
    },
    
    /**
     * Decrypt a message with the user's private key
     */
    async decrypt_message(encryptedDataStr, privateKeyPem) {
        try {
            console.log("Decrypting message...");
            // Check if input is valid
            if (!encryptedDataStr || typeof encryptedDataStr !== 'string') {
                console.error("Invalid encrypted data:", encryptedDataStr);
                throw new Error("Invalid encrypted data format");
            }
            
            if (!privateKeyPem || !privateKeyPem.includes("BEGIN PRIVATE KEY")) {
                console.error("Invalid private key format");
                throw new Error("Invalid private key format");
            }
            
            let encryptedData;
            try {
                encryptedData = JSON.parse(encryptedDataStr);
            } catch (e) {
                console.error("Failed to parse encrypted data JSON:", e);
                throw new Error("Invalid encrypted data format - not valid JSON");
            }
            
            // Log what we're working with (without revealing sensitive data)
            console.log("Encrypted data properties:", Object.keys(encryptedData));
            console.log("Private key length:", privateKeyPem.length);
            
            // Import the private key
            const privateKey = await this.importPrivateKey(privateKeyPem);
            console.log("Successfully imported private key");
            
            // Decrypt the symmetric key
            const encryptedSymmetricKey = this.base64ToArrayBuffer(encryptedData.encryptedSymmetricKey);
            
            let rawSymmetricKey;
            try {
                rawSymmetricKey = await window.crypto.subtle.decrypt(
                    {
                        name: "RSA-OAEP"
                    },
                    privateKey,
                    encryptedSymmetricKey
                );
                console.log("Successfully decrypted symmetric key");
            } catch (error) {
                console.error("Failed to decrypt symmetric key:", error);
                throw new Error("Failed to decrypt message: key decryption error");
            }
            
            // Import the symmetric key
            const symmetricKey = await window.crypto.subtle.importKey(
                "raw",
                rawSymmetricKey,
                {
                    name: "AES-GCM",
                    length: 256
                },
                false,
                ["decrypt"]
            );
            
            // Decrypt the message
            const iv = this.base64ToArrayBuffer(encryptedData.iv);
            const encryptedMessage = this.base64ToArrayBuffer(encryptedData.encryptedMessage);
            
            try {
                const decryptedMessage = await window.crypto.subtle.decrypt(
                    {
                        name: "AES-GCM",
                        iv: iv
                    },
                    symmetricKey,
                    encryptedMessage
                );
                
                // Decode the decrypted message
                return new TextDecoder().decode(decryptedMessage);
            } catch (error) {
                console.error("Failed to decrypt message content:", error);
                throw new Error("Failed to decrypt message content");
            }
        } catch (error) {
            console.error("Decryption error:", error);
            throw error;
        }
    },
    
    /**
     * Convert ArrayBuffer to Base64 string
     */
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    },
    
    /**
     * Convert Base64 string to ArrayBuffer
     */
    base64ToArrayBuffer(base64) {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
};

async function ensureUserKeys() {
    try {
        console.log("Checking for existing encryption keys...");
        
        // First try to get existing keys
        const response = await fetch('/api/encryption-keys/user');
        if (response.ok) {
            const data = await response.json();
            console.log("Retrieved existing encryption keys:", data);
            return data;
        } else {
            console.warn("No existing keys found. Generating new keys...");
            
            // Generate new keys
            const genResponse = await fetch('/api/encryption-keys/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (genResponse.ok) {
                const result = await genResponse.json();
                console.log("Generated new encryption keys successfully:", result.keys);
                return result.keys;
            } else {
                const errorData = await genResponse.json();
                console.error("Failed to generate encryption keys:", errorData.error);
                throw new Error(errorData.error || "Failed to generate encryption keys");
            }
        }
    } catch (error) {
        console.error("Error ensuring encryption keys:", error);
        throw error;
    }
}
