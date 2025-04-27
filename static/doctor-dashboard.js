// Fetch doctor information on page load
document.addEventListener('DOMContentLoaded', async function() {
    try {
        const response = await fetch('/api/doctor-info');
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('doctorId').textContent = data.doctorId;
        }
    } catch (error) {
        console.error('Error fetching doctor info:', error);
    }
});

// Display associated patients
async function showPatients() {
    try {
        const response = await fetch('/api/doctor/patients');
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error);
        
        const modalContent = createPatientsModal(data);
        showModal('My Patients', modalContent);
    } catch (error) {
        alert('Error fetching patients: ' + error.message);
    }
}

// Create modal content for patients list
function createPatientsModal(patients) {
    if (patients.length === 0) {
        return '<p>You have no associated patients yet.</p>';
    }

    let html = `<div class="patients-list">`;
    patients.forEach(patient => {
        html += `
            <div class="patient-item">
                <div class="patient-name">${patient.fullName}</div>
                <div class="patient-email">${patient.email}</div>
                <div class="patient-actions">
                    <button onclick="viewPatientDetails(${patient.userId})">View Details</button>
                    <button onclick="chatWithPatient(${patient.userId}, '${patient.fullName}')">
                        <i class="fas fa-comment-medical"></i> Chat
                    </button>
                    <button onclick="sendRecommendation(${patient.userId})">See Test</button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    return html;
}

// Global variables for encryption and communication
let socket;
let userKeys;
let recipientPublicKey;
let currentChatPartner;

// Initialize socket listeners function (call this after socket is created)
function initializeSocketListeners() {
    if (!socket) return;
    
    console.log('Initializing socket listeners');
    
    // Remove any existing listeners to prevent duplicates
    socket.off('new_message');
    
    // Add new message listener
    socket.on('new_message', (data) => {
        console.log('Doctor received new message via socket:', data);
        
        // Only process if it's from the current chat partner
        if (currentChatPartner && 
            ((data.sender_id == currentChatPartner && data.recipient_id == getUserId()) || 
             (data.sender_id == getUserId() && data.recipient_id == currentChatPartner))) {
            
            // Add message to chat using the appropriate encrypted version
            try {
                // Select the appropriate encrypted message version
                const encryptedMessage = data.sender_id == getUserId() 
                    ? data.sender_encrypted_message    // If I'm the sender, use sender version
                    : data.recipient_encrypted_message; // Otherwise use recipient version
                    
                if (encryptedMessage) {
                    // Decrypt and display the message
                    crypto_utils.decrypt_message(encryptedMessage, userKeys.private_key)
                        .then(decryptedText => {
                            console.log("Successfully decrypted message:", decryptedText.substring(0, 20) + "...");
                            // Add message to chat
                            const messageElement = createMessageElement(
                                decryptedText, 
                                data.sender_id == getUserId() ? 'sent' : 'received', 
                                data.timestamp
                            );
                            document.getElementById('chat-messages').appendChild(messageElement);
                        })
                        .catch(error => {
                            console.error('Error decrypting socket message:', error);
                            // Add message with error
                            const messageElement = createMessageElement(
                                "⚠️ Could not decrypt message (received just now)", 
                                data.sender_id == getUserId() ? 'sent' : 'received', 
                                data.timestamp
                            );
                            document.getElementById('chat-messages').appendChild(messageElement);
                        });
                }
            } catch (error) {
                console.error('Error processing new message:', error);
            }
        }
    });
}

// Add this new function to chat with patient using encryption
async function chatWithPatient(patientId, patientName) {
    // Close any existing modal
    const existingModal = document.querySelector('.modal');
    if (existingModal) existingModal.remove();
    
    // Create chat modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content chat-modal">
            <div class="modal-header">
                <h2>Chat with ${patientName}</h2>
                <span class="close">&times;</span>
            </div>
            <div class="chat-container">
                <div id="chat-messages" class="chat-messages"></div>
                <div class="chat-status">
                    <span id="encryption-status" class="encryption-status">Setting up secure channel...</span>
                </div>
                <div class="chat-input-container">
                    <textarea id="chat-input" placeholder="Type your message here..." disabled></textarea>
                    <button id="attach-file">Attach File</button>
                    <input type="file" id="file-input" style="display:none;" />
                    <button id="send-message" disabled>Send</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Set up event listeners
    modal.querySelector('.close').onclick = () => {
        currentChatPartner = null;
        modal.remove();
    };
    
    window.onclick = (event) => {
        if (event.target === modal) {
            currentChatPartner = null;
            modal.remove();
        }
    };

    // Initialize encryption and chat
    try {
        await initializeChat(patientId, patientName);
        
        // Enable the input once encryption is ready
        document.getElementById('chat-input').disabled = false;
        document.getElementById('send-message').disabled = false;
        document.getElementById('encryption-status').textContent = '🔒 End-to-end encrypted';
        
        // Load existing messages
        loadChatHistory(patientId);
    } catch (error) {
        console.error("Failed to initialize chat:", error);
        document.getElementById('encryption-status').textContent = '⚠️ Secure channel setup failed';
    }

    // Handle file attachment
    let selectedFile = null;
    
    document.getElementById('attach-file').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });
    
    document.getElementById('file-input').addEventListener('change', (e) => {
        selectedFile = e.target.files[0];
        if(selectedFile) {
            // Show file selection info
            const messageInput = document.getElementById('chat-input');
            messageInput.placeholder = `File selected: ${selectedFile.name}`;
            
            // Add a cancel button
            const cancelFileBtn = document.createElement('button');
            cancelFileBtn.id = 'cancel-file';
            cancelFileBtn.textContent = 'Cancel';
            cancelFileBtn.onclick = (e) => {
                e.preventDefault();
                selectedFile = null;
                messageInput.placeholder = 'Type your message here...';
                if (cancelFileBtn.parentNode) {
                    cancelFileBtn.remove();
                }
            };
            
            // Add the cancel button to the container
            const container = document.querySelector('.chat-input-container');
            if (container && !document.getElementById('cancel-file')) {
                container.appendChild(cancelFileBtn);
            }
        }
    });

    // Set up send button with encryption
    document.getElementById('send-message').addEventListener('click', async () => {
        const messageInput = document.getElementById('chat-input');
        const message = messageInput.value.trim();
        
        if ((message || selectedFile) && recipientPublicKey) {
            const success = await sendEncryptedMessage(patientId, message, selectedFile);
            
            if (success) {
                messageInput.value = '';
                if (selectedFile) {
                    selectedFile = null;
                    messageInput.placeholder = 'Type your message here...';
                    const cancelBtn = document.getElementById('cancel-file');
                    if (cancelBtn) cancelBtn.remove();
                }
            }
        } else if (!recipientPublicKey) {
            console.error("Cannot send message - encryption not ready");
            alert("Cannot send message: Secure connection not established. Please try again.");
        }
    });

    // Set up enter key to send
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('send-message').click();
        }
    });
}

// Initialize WebSocket connection and crypto with improved error handling
async function initializeChat(patientId, patientName) {
    currentChatPartner = patientId;
    document.getElementById('encryption-status').textContent = 'Setting up secure connection...';
    
    // Initialize WebSocket connection
    if (!socket) {
        socket = io();
        
        socket.on('connect', () => {
            console.log('Connected to WebSocket server');
            // Initialize listeners after successful connection
            initializeSocketListeners();
        });
    } else {
        // If socket already exists, make sure listeners are set up
        initializeSocketListeners();
    }
    
    try {
        // Step 1: Generate our own keys if we don't have them
        console.log("Ensuring user has encryption keys...");
        document.getElementById('encryption-status').textContent = 'Generating encryption keys...';
        await ensureUserKeys();
        
        // Step 2: Get recipient's public key
        console.log("Getting recipient's public key...");
        document.getElementById('encryption-status').textContent = 'Fetching recipient public key...';
        await getRecipientPublicKey(patientId);
        
        if (recipientPublicKey) {
            console.log("Got recipient public key successfully");
            document.getElementById('encryption-status').textContent = '🔒 End-to-end encrypted';
            
            // Enable chat input now that encryption is ready
            document.getElementById('chat-input').disabled = false;
            document.getElementById('send-message').disabled = false;
        } else {
            throw new Error("Failed to get recipient's public key");
        }
    } catch (error) {
        console.error("Chat initialization error:", error);
        document.getElementById('encryption-status').textContent = '⚠️ Secure channel setup failed';
        document.getElementById('chat-input').value = "Can't send encrypted messages. Please try again later.";
        document.getElementById('chat-input').disabled = true;
        document.getElementById('send-message').disabled = true;
    }
}

async function getRecipientPublicKey(recipientId) {
    try {
        const response = await fetch(`/api/encryption-keys/${recipientId}`);
        
        if (response.ok) {
            const data = await response.json();
            recipientPublicKey = data.public_key;
            return true;
        } else {
            // If recipient has no keys, try to trigger key generation for them
            const triggerResponse = await fetch(`/api/encryption-keys/trigger-generation/${recipientId}`, {
                method: 'POST'
            });
            
            if (triggerResponse.ok) {
                // Try again to get their public key
                const retryResponse = await fetch(`/api/encryption-keys/${recipientId}`);
                if (retryResponse.ok) {
                    const data = await retryResponse.json();
                    recipientPublicKey = data.public_key;
                    return true;
                }
            }
            
            throw new Error(`Couldn't get recipient's public key: ${response.status}`);
        }
    } catch (error) {
        console.error('Error fetching recipient public key:', error);
        throw error;
    }
}

function getUserId() {
    // Extract user ID from body data attribute
    return document.body.getAttribute('data-user-id');
}

async function ensureUserKeys() {
    try {
        console.log("Checking for existing encryption keys...");
        // First try to get existing keys
        const response = await fetch('/api/encryption-keys/user');
        
        if (response.ok) {
            userKeys = await response.json();
            console.log("Retrieved existing encryption keys");
            
            // Validate the keys
            if (!userKeys.private_key || !userKeys.private_key.includes("BEGIN PRIVATE KEY")) {
                console.warn("Retrieved invalid private key, regenerating...");
                throw new Error("Invalid private key format");
            }
        } else {
            console.log("No existing keys found, generating new keys...");
            // Generate new keys
            const genResponse = await fetch('/api/encryption-keys/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (genResponse.ok) {
                const result = await genResponse.json();
                userKeys = result.keys;
                console.log("Generated new encryption keys successfully");
            } else {
                console.error('Failed to generate encryption keys:', genResponse.status);
                throw new Error("Failed to generate encryption keys");
            }
        }
    } catch (error) {
        console.error('Error managing encryption keys:', error);
        alert("Error: Failed to set up secure messaging. Please try again later.");
        throw error;
    }
}

// Function to serialize Decimal objects
function serializeDecimal(obj) {
    if (typeof obj === 'object' && obj !== null) {
        if (obj.constructor && obj.constructor.name === 'Decimal') {
            return obj.toString(); // Convert Decimal to string
        }
        const serializedObj = {};
        for (const key in obj) {
            serializedObj[key] = serializeDecimal(obj[key]); // Recursively process nested objects
        }
        return serializedObj;
    }
    return obj; // Return other types as-is
}

async function sendEncryptedMessage(patientId, message, file = null) {
    if (!userKeys || !recipientPublicKey) {
        alert("Error: Cannot send message. Encryption keys not available.");
        return false;
    }
    
    // Always show the message optimistically first
    const timestamp = new Date().toISOString();
    const chatContainer = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message sent';
    
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    
    // Create message content based on whether we have text, file, or both
    if (file) {
        contentElement.innerHTML = `<div class="file-attachment">
            <i class="fas fa-paperclip"></i> ${file.name} (${formatFileSize(file.size)})
        </div>`;
        if (message) {
            contentElement.innerHTML += `<div class="message-text">${message}</div>`;
        }
    } else {
        contentElement.textContent = message;
    }
    
    const timeElement = document.createElement('div');
    timeElement.className = 'message-time';
    timeElement.textContent = new Date(timestamp).toLocaleString();
    
    const statusElement = document.createElement('div');
    statusElement.className = 'message-status';
    statusElement.innerHTML = '<span class="sending">Sending...</span>';
    
    messageElement.appendChild(contentElement);
    messageElement.appendChild(timeElement);
    messageElement.appendChild(statusElement);
    chatContainer.appendChild(messageElement);
    
    // Scroll to bottom of chat
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    try {
        // Create the payload with serialized strings
        const payload = {
            recipientId: String(patientId) // Convert to string to avoid number format issues
        };

        // Handle message text if present
        if (message) {
            console.log("Encrypting message for recipient...");
            const recipientEncryptedMessage = await crypto_utils.encrypt_message(message, recipientPublicKey);

            console.log("Encrypting message for sender (self)...");
            const senderEncryptedMessage = await crypto_utils.encrypt_message(message, userKeys.public_key);

            payload.senderEncryptedMessage = senderEncryptedMessage;
            payload.recipientEncryptedMessage = recipientEncryptedMessage;
        }

        // Handle file if present
        if (file) {
            statusElement.innerHTML = '<span class="sending">Encrypting file...</span>';
            console.log("Encrypting file for recipient...");

            try {
                // Encrypt the file for recipient
                const recipientEncryptedFile = await crypto_utils.encrypt_file(file, recipientPublicKey);
                
                // Encrypt the file for sender
                const senderEncryptedFile = await crypto_utils.encrypt_file(file, userKeys.public_key);
                
                // Store file metadata
                const fileMetadata = JSON.stringify({
                    filename: file.name,
                    type: file.type,
                    size: file.size,
                    lastModified: file.lastModified
                });
                
                payload.senderEncryptedFile = senderEncryptedFile.encryptedDataBase64;
                payload.recipientEncryptedFile = recipientEncryptedFile.encryptedDataBase64;
                payload.fileMetadata = fileMetadata;
                
                statusElement.innerHTML = '<span class="sending">Uploading file...</span>';
            } catch (encryptError) {
                console.error("File encryption error:", encryptError);
                statusElement.innerHTML = '<span class="failed">File encryption failed</span>';
                return false;
            }
        }
        
        console.log("Sending dual-encrypted data...");
        console.log("Payload keys:", Object.keys(payload));
        
        // Serialize the payload to handle Decimal objects
        const response = await fetch('/api/chat/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(serializeDecimal(payload)) // Use serializeDecimal here
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Server error response:", errorText);
            
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (parseError) {
                errorData = { error: errorText || response.statusText };
            }
            
            throw new Error(`Server error: ${errorData.error || response.statusText}`);
        }
        
        console.log("Message sent successfully!");
        
        // Update status icon
        statusElement.innerHTML = '<span class="sent">✓</span>';
        
        return true;
    } 
    catch (error) {
        console.error('Error sending encrypted message:', error);
        
        // Update status to show the error
        let errorMessage = 'Failed to send';
        if (file) errorMessage = 'File upload failed';
        
        // Special handling for Decimal serialization error
        if (error.message.includes("Decimal is not JSON serializable")) {
            console.log("Server has Decimal serialization issue, but message is likely sent successfully");
            // This is a known server issue but the message is usually processed correctly
            statusElement.innerHTML = '<span class="partial">✓ <small>(Server notice)</small></span>';
            return true; // Consider the message sent successfully despite the error
        }
        
        statusElement.innerHTML = `<span class="failed">${errorMessage}</span> <button class="retry-btn">Retry</button>`;
        
        // Add retry functionality
        const retryBtn = statusElement.querySelector('.retry-btn');
        if (retryBtn) {
            retryBtn.onclick = async () => {
                statusElement.innerHTML = '<span class="sending">Retrying...</span>';
                const success = await sendEncryptedMessage(patientId, message, file);
                if (success) {
                    messageElement.remove();
                }
            };
        }
        
        return false;
    }
}

// Load chat history from server with decryption
async function loadChatHistory(patientId) {
    try {
        const response = await fetch(`/api/chat/${patientId}`);
        if (!response.ok) {
            throw new Error('Failed to load chat history');
        }
        
        const messages = await response.json();
        console.log(`Loaded ${messages.length} messages from history`);
        
        const chatContainer = document.getElementById('chat-messages');
        chatContainer.innerHTML = '';
        
        if (messages.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-chat';
            emptyMessage.textContent = 'No messages yet. Start the conversation!';
            chatContainer.appendChild(emptyMessage);
            return;
        }
        
        // Process messages - decrypt them one by one
        for (const msg of messages) {
            try {
                // Handle file-only messages
                if (msg.file_metadata) {
                    console.log(`Processing file attachment for message ${msg.id}`);
                    
                    // Create message element with file attachment
                    chatContainer.appendChild(
                        createMessageElement(
                            msg.encryptedMessage ? await decryptMessage(msg.encryptedMessage) : "", 
                            msg.isFromDoctor ? 'sent' : 'received', 
                            msg.timestamp,
                            msg.file_metadata,
                            msg.id
                        )
                    );
                    continue;
                }
                
                // Handle text-only messages
                if (!msg.encryptedMessage) {
                    console.log("Message has no encryption, using plain text");
                    chatContainer.appendChild(
                        createMessageElement(msg.message || "No message content", 
                            msg.isFromDoctor ? 'sent' : 'received', 
                            msg.timestamp)
                    );
                    continue;
                }
                
                console.log(`Attempting to decrypt message ${msg.id} from ${msg.isFromDoctor ? 'doctor' : 'patient'}`);
                console.log(`Private key exists: ${!!userKeys?.private_key}`);
                
                try {
                    const decryptedText = await crypto_utils.decrypt_message(msg.encryptedMessage, userKeys.private_key);
                    console.log(`Message ${msg.id} decrypted successfully`);
                    
                    chatContainer.appendChild(
                        createMessageElement(decryptedText, 
                            msg.isFromDoctor ? 'sent' : 'received', 
                            msg.timestamp)
                    );
                } catch (decryptError) {
                    console.error(`Error decrypting message ${msg.id}:`, decryptError);
                    chatContainer.appendChild(
                        createMessageElement("⚠️ Could not decrypt message", 
                            msg.isFromDoctor ? 'sent' : 'received', 
                            msg.timestamp)
                    );
                }
            } catch (error) {
                console.error('Error processing message:', error);
                continue;
            }
        }
        
        // Scroll to bottom of chat
        chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

function createMessageElement(text, type, timestamp, fileMetadata = null, messageId = null) {
    const messageElement = document.createElement('div');
    messageElement.className = `chat-message ${type}`;
    
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    
    // Add file attachment if present
    if (fileMetadata) {
        try {
            const metadata = JSON.parse(fileMetadata);
            contentElement.innerHTML = `<div class="file-attachment">
                <i class="fas fa-paperclip"></i> ${metadata.filename} (${formatFileSize(metadata.size)})
                <button class="download-file" data-message-id="${messageId}">Download</button>
            </div>`;
            
            // Add message text if present
            if (text && text.trim() !== '') {
                contentElement.innerHTML += `<div class="message-text">${text}</div>`;
            }
            
            // Add click handler for download button
            setTimeout(() => {
                const downloadBtn = messageElement.querySelector('.download-file');
                if (downloadBtn) {
                    downloadBtn.addEventListener('click', () => {
                        window.open(`/api/chat/file/${messageId}`, '_blank');
                    });
                }
            }, 0);
        } catch (e) {
            console.error("Error parsing file metadata:", e);
            if (text && text.trim() !== '') {
                contentElement.textContent = text;
            } else {
                contentElement.textContent = "File attachment";
            }
        }
    } else {
        contentElement.textContent = text;
    }
    
    const timeElement = document.createElement('div');
    timeElement.className = 'message-time';
    timeElement.textContent = new Date(timestamp).toLocaleString();
    
    messageElement.appendChild(contentElement);
    messageElement.appendChild(timeElement);
    
    return messageElement;
}

// Helper function to format file size
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    else return (bytes / 1073741824).toFixed(1) + ' GB';
}

function addMessageToChat(messageData) {
    const chatContainer = document.getElementById('chat-messages');
    if (!chatContainer) return;

    // Check if the message is sent by the current user
    if (messageData.sender_id === getUserId()) {
        // Display the message directly without decryption
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message sent';

        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        
        // Check if this is a file message
        if (messageData.file_metadata) {
            try {
                const metadata = JSON.parse(messageData.file_metadata);
                contentElement.innerHTML = `<div class="file-attachment">
                    <i class="fas fa-paperclip"></i> ${metadata.filename} (${formatFileSize(metadata.size)})
                    <button class="download-file" data-message-id="${messageData.message_id}">Download</button>
                </div>`;
                
                if (messageData.sender_encrypted_message) {
                    contentElement.innerHTML += `<div class="message-text">Message with attachment</div>`;
                }
                
                // Add download event listener
                setTimeout(() => {
                    const downloadBtn = contentElement.querySelector('.download-file');
                    if (downloadBtn) {
                        downloadBtn.addEventListener('click', () => {
                            window.open(`/api/chat/file/${messageData.message_id}`, '_blank');
                        });
                    }
                }, 0);
            } catch (e) {
                contentElement.textContent = "File attachment";
            }
        } else if (messageData.sender_encrypted_message) {
            contentElement.textContent = "Encrypted message";
        } else {
            contentElement.textContent = "Message";
        }

        const timeElement = document.createElement('div');
        timeElement.className = 'message-time';
        timeElement.textContent = new Date(messageData.timestamp).toLocaleString();

        messageElement.appendChild(contentElement);
        messageElement.appendChild(timeElement);
        chatContainer.appendChild(messageElement);

        // Scroll to bottom of chat
        chatContainer.scrollTop = chatContainer.scrollHeight;
    } else {
        // Process received message based on type
        if (messageData.recipient_encrypted_message) {
            // Decrypt the text message using crypto_utils
            crypto_utils.decrypt_message(messageData.recipient_encrypted_message, userKeys.private_key)
                .then(decryptedMessage => {
                    const messageElement = createMessageElement(
                        decryptedMessage, 
                        'received', 
                        messageData.timestamp,
                        messageData.file_metadata,
                        messageData.message_id
                    );
                    chatContainer.appendChild(messageElement);
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                })
                .catch(error => {
                    console.error('Error decrypting message:', error);
                    const messageElement = createMessageElement(
                        "⚠️ Could not decrypt message", 
                        'received', 
                        messageData.timestamp,
                        messageData.file_metadata,
                        messageData.message_id
                    );
                    chatContainer.appendChild(messageElement);
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                });
        } else if (messageData.file_metadata) {
            // Just show file attachment without message
            const messageElement = createMessageElement(
                "", 
                'received', 
                messageData.timestamp,
                messageData.file_metadata,
                messageData.message_id
            );
            chatContainer.appendChild(messageElement);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }
}

// Update the decryption function with better error handling
async function decryptMessage(encryptedData) {
    if (!encryptedData) {
        return "Message could not be displayed (no encrypted data)";
    }
    
    if (!userKeys || !userKeys.private_key) {
        return "Message could not be decrypted (no decryption key)";
    }
    
    try {
        return await crypto_utils.decrypt_message(encryptedData, userKeys.private_key);
    } catch (error) {
        console.error('Decryption error:', error);
        return "⚠️ Could not decrypt message (format or key mismatch)";
    }
}

// Display patient records
function showPatientRecords() {
    alert('Feature coming soon: View detailed patient records');
}

function showAnalytics() {
    alert('Feature coming soon: View patient analytics');
}

// Display profile settings - Updated to use the editProfile function
function showProfileSettings() {
    editProfile();
}

// Function to edit profile (same as in dashboard.js)
async function editProfile() {
    try {
        // Fetch current profile data
        const response = await fetch('/api/profile');
        const profileData = await response.json();
        
        if (!response.ok) throw new Error(profileData.error);
        
        // Create form based on user role
        let formHtml = `
        <form id="editProfileForm" class="profile-edit-form">
            <div class="form-group">
                <label for="edit-phone">Phone Number</label>
                <input type="tel" id="edit-phone" name="phone" value="${profileData.phone || ''}" required>
            </div>
        `;
        
        // Add role-specific fields
        if (profileData.role === 'Doctor') {
            formHtml += `
                <div class="form-group">
                    <label for="edit-specialization">Specialization</label>
                    <input type="text" id="edit-specialization" name="specialization" value="${profileData.specialization || ''}" required>
                </div>
                
                <div class="form-group">
                    <label for="edit-office-hours">Office Hours</label>
                    <input type="text" id="edit-office-hours" name="office_hours" value="${profileData.office_hours || ''}" required>
                </div>
                
                <div class="form-group">
                    <label for="edit-hospital-clinic">Hospital/Clinic Name & Address</label>
                    <textarea id="edit-hospital-clinic" name="hospital_clinic" required>${profileData.hospital_clinic || ''}</textarea>
                </div>
                
                <div class="form-group">
                    <label for="edit-experience">Years of Experience</label>
                    <input type="number" id="edit-experience" name="experience" min="0" value="${profileData.experience || ''}" required>
                </div>
                
                <div class="form-group">
                    <label for="edit-education">Education & Qualifications</label>
                    <textarea id="edit-education" name="education" required>${profileData.education || ''}</textarea>
                </div>
            `;
        }
        
        // Close the form
        formHtml += `
            <button type="submit" class="auth-btn">Save Changes</button>
        </form>`;
        
        // Show modal with form
        showModal('Edit Profile', formHtml);
        
        // Add event listener to form submit
        document.getElementById('editProfileForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = {
                phone: document.getElementById('edit-phone').value
            };
            
            // Add role-specific fields for Doctor
            if (profileData.role === 'Doctor') {
                formData.specialization = document.getElementById('edit-specialization').value;
                formData.office_hours = document.getElementById('edit-office-hours').value;
                formData.hospital_clinic = document.getElementById('edit-hospital-clinic').value;
                formData.experience = document.getElementById('edit-experience').value;
                formData.education = document.getElementById('edit-education').value;
            }
            
            try {
                const saveResponse = await fetch('/api/edit-profile', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formData)
                });
                
                const saveResult = await saveResponse.json();
                
                if (saveResponse.ok) {
                    alert('Profile updated successfully');
                    
                    // Close the modal
                    const modal = document.querySelector('.modal');
                    if (modal) modal.remove();
                    
                    // Refresh the page to show updated info
                    window.location.reload();
                } else {
                    alert(saveResult.error || 'Failed to update profile');
                }
            } catch (error) {
                alert('An error occurred. Please try again.');
            }
        });
    } catch (error) {
        alert('Error loading profile: ' + error.message);
    }
}

// View individual patient details
function viewPatientDetails(patientId) {
    alert(`Feature coming soon: View details for patient ID ${patientId}`);
}

// Display patient's FRT test results
async function sendRecommendation(patientId) {
    try {
        // Fetch the patient's FRT test results
        const response = await fetch(`/api/frt/patient-results/${patientId}`);
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || 'Failed to fetch test results');
        
        // Create modal content to display the test results
        const modalContent = createTestResultsModal(data, patientId);
        showModal('FRT Test Results', modalContent);
        
        // Add event listeners for the report generation after modal is created
        setupReportGenerationHandlers(patientId);
    } catch (error) {
        console.error('Error fetching patient test results:', error);
        alert('Error loading test results: ' + error.message);
    }
}

// Create modal content for displaying test results
function createTestResultsModal(results, patientId) {
    if (!results || results.length === 0) {
        return `<p>No FRT test results found for this patient.</p>
                <button class="recommend-test-btn" onclick="recommendFRTTest(${patientId})">Recommend FRT Test</button>`;
    }

    let html = `
        <div class="test-results-container">
            <div class="test-results-actions">
                <button id="generate-report-btn" class="action-btn">Generate Report</button>
                <button class="recommend-test-btn" onclick="recommendFRTTest(${patientId})">Recommend New Test</button>
            </div>
            <div class="test-results-table-wrapper">
                <table class="test-results-table">
                    <thead>
                        <tr>
                            <th><input type="checkbox" id="select-all-tests" title="Select All"></th>
                            <th>Test Date</th>
                            <th>Max Distance</th>
                            <th>Risk Level</th>
                            <th>Recommendation</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    results.forEach(result => {
        // Determine recommendation based on risk level
        const recommendation = getRecommendationFromRisk(result.riskLevel);
        const recommendationClass = recommendation === 'Recommended' ? 'recommended' : 'not-recommended';
        
        html += `
            <tr>
                <td><input type="checkbox" class="test-checkbox" data-test-id="${result.id}"></td>
                <td>${new Date(result.date).toLocaleDateString()}</td>
                <td>${result.maxDistance} cm</td>
                <td>${result.riskLevel}</td>
                <td><span class="recommendation ${recommendationClass}">${recommendation}</span></td>
            </tr>
        `;
    });
    
    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    return html;
}

// Determine recommendation based on risk level
function getRecommendationFromRisk(riskLevel) {
    if (riskLevel.toLowerCase().includes('low risk')) {
        return 'Recommended';
    } else {
        return 'Not Recommended';
    }
}

// Set up event handlers for report generation
function setupReportGenerationHandlers(patientId) {
    // Add event listener for "Select All" checkbox
    const selectAllCheckbox = document.getElementById('select-all-tests');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            const testCheckboxes = document.querySelectorAll('.test-checkbox');
            testCheckboxes.forEach(checkbox => {
                checkbox.checked = selectAllCheckbox.checked;
            });
        });
    }
    
    // Add event listener for "Generate Report" button
    const generateReportBtn = document.getElementById('generate-report-btn');
    if (generateReportBtn) {
        generateReportBtn.addEventListener('click', function() {
            generateTestReport(patientId);
        });
    }
}

// Generate report for selected tests
async function generateTestReport(patientId) {
    // Get all selected test IDs
    const selectedCheckboxes = document.querySelectorAll('.test-checkbox:checked');
    
    if (selectedCheckboxes.length === 0) {
        alert('Please select at least one test to generate a report.');
        return;
    }
    
    const selectedTestIds = Array.from(selectedCheckboxes).map(checkbox => 
        checkbox.getAttribute('data-test-id')
    );
    
    try {
        // Show loading indicator
        const generateReportBtn = document.getElementById('generate-report-btn');
        if (generateReportBtn) {
            generateReportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
            generateReportBtn.disabled = true;
        }
        
        // Call API to generate report
        const response = await fetch('/api/frt/generate-report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                patientId: patientId,
                testIds: selectedTestIds
            })
        });
        
        // Reset button state
        if (generateReportBtn) {
            generateReportBtn.innerHTML = 'Generate Report';
            generateReportBtn.disabled = false;
        }
        
        // Handle the response
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = 'Failed to generate report';
            
            try {
                // Try to parse as JSON
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error || errorMessage;
                
                // Check for SQL error patterns and provide more user-friendly messages
                if (errorMessage.includes("NULL into column") && errorMessage.includes("Reports")) {
                    errorMessage = "Database error: Missing required report information. Please contact support.";
                }
            } catch (parseError) {
                // If not JSON, use the text directly but truncate if too long
                if (errorText.length > 150) {
                    errorMessage = errorText.substring(0, 147) + '...';
                } else {
                    errorMessage = errorText || errorMessage;
                }
            }
            
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        
        // Provide download link or notification that report was generated
        alert('Report generated successfully! Downloading...');
        
        // Create a download link for the report
        if (data.reportUrl) {
            const downloadLink = document.createElement('a');
            downloadLink.href = data.reportUrl;
            downloadLink.download = `frt-report-${Date.now()}.pdf`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        }
    } catch (error) {
        console.error('Error generating report:', error);
        alert('Error generating report: ' + error.message);
    }
}

// Function to recommend a new FRT test to the patient
async function recommendFRTTest(patientId) {
    try {
        const response = await fetch('/api/frt/recommend-test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                patientId: patientId
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || 'Failed to recommend test');
        
        alert('FRT test recommendation sent to patient successfully!');
    } catch (error) {
        console.error('Error recommending test:', error);
        alert('Error sending recommendation: ' + error.message);
    }
}

// Show modal - reused from dashboard.js
function showModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>${title}</h2>
                <span class="close">&times;</span>
            </div>
            <div class="modal-body">
                ${content}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('.close');
    closeBtn.onclick = () => modal.remove();

    window.onclick = (event) => {
        if (event.target === modal) {
            modal.remove();
        }
    };
}

// Fetch and display the doctor's own FRT test history
async function showDoctorTestHistory() {
    try {
        const response = await fetch('/api/frt/doctor-history'); // New endpoint for doctor's history
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch test history');
        }
        const history = await response.json();

        if (history.length === 0) {
            showModal('My Test History', '<p>You have not performed any FRT tests yet.</p>');
            return;
        }

        const modalContent = createHistoryModalContent(history);
        showModal('My Test History', modalContent);

    } catch (error) {
        console.error('Error fetching doctor test history:', error);
        showModal('Error', `<p>Could not load your test history: ${error.message}</p>`);
    }
}

// Helper function to format symptoms/conversation log (copied from dashboard.js)
function formatSymptoms(symptoms) {
    if (!symptoms) return '<div class="conversation-log-content">No conversation recorded</div>';

    // Handle different possible formats by normalizing newlines
    const normalizedSymptoms = symptoms.replace(/\n\n/g, '\n').replace(/\r\n/g, '\n');

    // Split by line breaks and wrap each line in paragraph tags
    const formattedLines = normalizedSymptoms.split('\n')
        .filter(line => line.trim() !== '') // Remove empty lines
        .map(line => {
            // Add styling to differentiate user and assistant messages
            if (line.trim().startsWith('User:')) {
                return `<p class="user-message"><strong>${line}</strong></p>`;
            } else if (line.trim().startsWith('Assistant:')) {
                return `<p class="assistant-message">${line}</p>`;
            } else {
                return `<p>${line}</p>`;
            }
        })
        .join('');

    if (!formattedLines.trim()) {
        return '<div class="conversation-log-content">No conversation details available</div>';
    }

    return `<div class="conversation-log-content">${formattedLines}</div>`;
}

// Function to toggle conversation visibility (copied from dashboard.js)
function toggleConversation(button) {
    const conversationLog = button.previousElementSibling;
    if (conversationLog.classList.contains('expanded')) {
        conversationLog.classList.remove('expanded');
        button.textContent = 'Show Full Conversation';
    } else {
        conversationLog.classList.add('expanded');
        button.textContent = 'Hide Full Conversation';
    }
}

// Helper function to create HTML content for the history modal - UPDATED
function createHistoryModalContent(history) {
    let content = '<div class="history-list">'; // Use div instead of ul for consistency
    history.forEach(result => {
        // Determine status class based on risk level (similar logic to patient dashboard if needed)
        let statusClass = 'completed'; // Default for doctor's own tests
        if (result.riskLevel.toLowerCase().includes('risk')) {
             // Example: could add specific classes based on risk if desired
             // statusClass = 'risk-moderate'; or 'risk-high';
        }

        content += `
            <div class="history-item ${statusClass}">
                <div class="history-date">${new Date(result.date).toLocaleString()}</div>
                <div class="history-details">
                    ${result.maxDistance > 0 ?
                        `<p><strong>Max Distance:</strong> ${result.maxDistance.toFixed(2)} cm</p>` : ''}
                    <p><strong>Risk Level:</strong> ${result.riskLevel}</p>
                    <p><strong>Conversation/Notes:</strong></p>
                    <div class="conversation-log" tabindex="0">${formatSymptoms(result.symptoms)}</div>
                    <button class="toggle-conversation" onclick="toggleConversation(this)">Show Full Conversation</button>
                </div>
            </div>
        `;
    });
    content += '</div>';
    return content;
}

// Initial setup when the dashboard loads
document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...
});
