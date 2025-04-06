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
                    <button onclick="sendRecommendation(${patient.userId})">Send Recommendation</button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    return html;
}

// Global variables for encryption
let socket;
let userKeys;
let recipientPublicKey;
let currentChatPartner;

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

    // Set up send button with encryption
    document.getElementById('send-message').addEventListener('click', async () => {
        const messageInput = document.getElementById('chat-input');
        const message = messageInput.value.trim();
        
        if (message && recipientPublicKey) {
            const success = await sendEncryptedMessage(patientId, message);
            
            if (success) {
                messageInput.value = '';
                
                // Add the sent message to the chat (optimistic UI update)
                const chatContainer = document.getElementById('chat-messages');
                const messageElement = document.createElement('div');
                messageElement.className = 'chat-message sent';
                
                const contentElement = document.createElement('div');
                contentElement.className = 'message-content';
                contentElement.textContent = message;
                
                const timeElement = document.createElement('div');
                timeElement.className = 'message-time';
                timeElement.textContent = new Date().toLocaleString();
                
                messageElement.appendChild(contentElement);
                messageElement.appendChild(timeElement);
                chatContainer.appendChild(messageElement);
                
                // Scroll to bottom of chat
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
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
        });
        
        socket.on('new_message', (data) => {
            // Only process messages if chat is open and it's from our chat partner
            if (currentChatPartner && 
                ((data.sender_id === currentChatPartner && data.recipient_id === getUserId()) || 
                (data.sender_id === getUserId() && data.recipient_id === currentChatPartner))) {
                addMessageToChat(data);
            }
        });
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

// Add these encryption related functions
async function sendEncryptedMessage(patientId, message) {
    if (!userKeys || !recipientPublicKey) {
        alert("Error: Cannot send message. Encryption keys not available.");
        return false;
    }
    
    try {
        console.log("Encrypting message for recipient...");
        const recipientEncryptedMessage = await crypto_utils.encrypt_message(message, recipientPublicKey);
        
        console.log("Encrypting message for sender (self)...");
        const senderEncryptedMessage = await crypto_utils.encrypt_message(message, userKeys.public_key);
        
        console.log("Sending dual-encrypted message...");
        const response = await fetch('/api/chat/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                recipientId: patientId,
                senderEncryptedMessage: senderEncryptedMessage,
                recipientEncryptedMessage: recipientEncryptedMessage
            })
        });
        
        if (!response.ok) {
            throw new Error(`Server returned error: ${response.status}`);
        }
        
        console.log("Message sent successfully!");
        
        // Get the timestamp from the response headers or body
        const timestamp = response.headers.get('Date') || new Date().toISOString();
        
        // Optimistically add the message to the chat - use sender's version for own display
        addMessageToChat({
            sender_id: getUserId(),
            recipient_id: patientId,
            encrypted_message: senderEncryptedMessage,
            timestamp: timestamp
        });
        
        return true;
    } catch (error) {
        console.error('Error sending encrypted message:', error);
        alert("Error: Failed to send message. Please try again.");
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

function createMessageElement(text, type, timestamp) {
    const messageElement = document.createElement('div');
    messageElement.className = `chat-message ${type}`;
    
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    contentElement.textContent = text;
    
    const timeElement = document.createElement('div');
    timeElement.className = 'message-time';
    timeElement.textContent = new Date(timestamp).toLocaleString();
    
    messageElement.appendChild(contentElement);
    messageElement.appendChild(timeElement);
    return messageElement;
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
        contentElement.textContent = messageData.encrypted_message; // Use the original message content

        const timeElement = document.createElement('div');
        timeElement.className = 'message-time';
        timeElement.textContent = new Date(messageData.timestamp).toLocaleString();

        messageElement.appendChild(contentElement);
        messageElement.appendChild(timeElement);
        chatContainer.appendChild(messageElement);

        // Scroll to bottom of chat
        chatContainer.scrollTop = chatContainer.scrollHeight;
    } else {
        // Decrypt the message if it's from the recipient
        crypto_utils.decrypt_message(messageData.encrypted_message, userKeys.private_key)
            .then(decryptedMessage => {
                const messageElement = document.createElement('div');
                messageElement.className = 'chat-message received';

                const contentElement = document.createElement('div');
                contentElement.className = 'message-content';
                contentElement.textContent = decryptedMessage;

                const timeElement = document.createElement('div');
                timeElement.className = 'message-time';
                timeElement.textContent = new Date(messageData.timestamp).toLocaleString();

                messageElement.appendChild(contentElement);
                messageElement.appendChild(timeElement);
                chatContainer.appendChild(messageElement);

                // Scroll to bottom of chat
                chatContainer.scrollTop = chatContainer.scrollHeight;
            })
            .catch(error => {
                console.error('Error decrypting message:', error);
                const messageElement = document.createElement('div');
                messageElement.className = 'chat-message received';

                const contentElement = document.createElement('div');
                contentElement.className = 'message-content';
                contentElement.textContent = "⚠️ Could not decrypt message";

                const timeElement = document.createElement('div');
                timeElement.className = 'message-time';
                timeElement.textContent = new Date(messageData.timestamp).toLocaleString();

                messageElement.appendChild(contentElement);
                messageElement.appendChild(timeElement);
                chatContainer.appendChild(messageElement);
            });
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

// Display recommendation form
function showRecommendationForm() {
    alert('Feature coming soon: Send recommendations to patients');
}

// Display analytics
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
                formData.hospital_clinic = document.getElementId('edit-hospital-clinic').value;
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

// Send recommendation to patient
function sendRecommendation(patientId) {
    alert(`Feature coming soon: Send recommendation to patient ID ${patientId}`);
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

// Update the socket event listener for new messages in initializeChat
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
