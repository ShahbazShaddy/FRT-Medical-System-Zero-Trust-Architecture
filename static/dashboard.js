function showResults() {
    alert('Feature coming soon: View your assessment results and risk analysis');
}

async function showHistory() {
    try {
        const response = await fetch('/api/frt-history');
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error);
        
        const modalContent = createHistoryModal(data);
        showModal('Test History', modalContent);
    } catch (error) {
        alert('Error fetching history: ' + error.message);
    }
}

function showRecommendations() {
    alert('Feature coming soon: View personalized recommendations');
}

function showFAQs() {
    alert('Feature coming soon: Access help resources and FAQs');
}

function createHistoryModal(history) {
    if (history.length === 0) {
        return '<p>No test history available.</p>';
    }

    let html = `<div class="history-list">`;
    history.forEach(result => {
        let statusClass = result.riskLevel === 'Not Recommended' ? 'not-recommended' : 
                         result.riskLevel === 'Pending Test' ? 'pending' : 'completed';
        
        html += `
            <div class="history-item ${statusClass}">
                <div class="history-date">${result.date}</div>
                <div class="history-details">
                    ${result.maxDistance > 0 ? 
                        `<p><strong>Max Distance:</strong> ${result.maxDistance} cm</p>` : ''}
                    <p><strong>Status:</strong> ${result.riskLevel}</p>
                    <p><strong>Conversation:</strong></p>
                    <div class="conversation-log" tabindex="0">${formatSymptoms(result.symptoms)}</div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    return html;
}

function formatSymptoms(symptoms) {
    if (!symptoms) return 'No conversation recorded';
    
    // Split by line breaks and wrap each line in paragraph tags
    const formattedLines = symptoms.split('\n')
        .filter(line => line.trim() !== '') // Remove empty lines
        .map(line => `<p>${line}</p>`)
        .join('');
    
    return `<div class="conversation-log-content">${formattedLines || 'No conversation details available'}</div>`;
}

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
    
    // Initialize scrollable elements to ensure they work
    setTimeout(() => {
        const scrollElements = modal.querySelectorAll('.conversation-log');
        scrollElements.forEach(element => {
            element.scrollTop = 0; // Reset scroll position
        });
    }, 100);
}

async function manageDoctorAssociation() {
    try {
        // Fetch current association status
        const response = await fetch('/api/patient/doctor-association');
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error);
        
        // Create modal content based on association status
        const modalContent = createDoctorAssociationModal(data);
        showModal('My Doctor', modalContent);
        
        // Initialize event handlers for the modal
        setTimeout(() => {
            const associateForm = document.getElementById('associate-doctor-form');
            if (associateForm) {
                associateForm.addEventListener('submit', associateWithDoctor);
            }
            
            const removeBtn = document.getElementById('remove-doctor-association');
            if (removeBtn) {
                removeBtn.addEventListener('click', removeDoctorAssociation);
            }
        }, 100);
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function createDoctorAssociationModal(data) {
    if (data.hasDoctor) {
        // Show current doctor information
        return `
            <div class="doctor-info">
                <h3>Your Current Doctor</h3>
                <p><strong>Name:</strong> ${data.doctorName}</p>
                <p><strong>Email:</strong> ${data.doctorEmail}</p>
                <p><strong>Association Date:</strong> ${data.associationDate}</p>
                <div class="doctor-actions">
                    <button onclick="chatWithDoctor(${data.doctorUserId}, '${data.doctorName}')" class="btn-primary">
                        <i class="fas fa-comment-medical"></i> Chat with Doctor
                    </button>
                    <button id="remove-doctor-association" class="btn-danger">Remove Association</button>
                </div>
            </div>
        `;
    } else {
        return `
            <div class="doctor-association-form">
                <p>You are not currently associated with any doctor. Enter a Doctor ID to establish an association:</p>
                <form id="associate-doctor-form">
                    <div class="form-group">
                        <input type="text" id="doctor-id" placeholder="Enter Doctor ID" required>
                    </div>
                    <button type="submit" class="btn-primary">Verify & Associate</button>
                </form>
                <div id="association-message"></div>
            </div>
        `;
    }
}

// Add new chat functions for patient
async function chatWithDoctor(doctorId, doctorName) {
    // Close any existing modal
    const existingModal = document.querySelector('.modal');
    if (existingModal) existingModal.remove();
    
    // Create chat modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content chat-modal">
            <div class="modal-header">
                <h2>Chat with Dr. ${doctorName}</h2>
                <span class="close">&times;</span>
            </div>
            <div class="chat-container">
                <div id="chat-messages" class="chat-messages"></div>
                <div class="chat-status">
                    <span id="encryption-status" class="encryption-status">🔒 End-to-end encrypted</span>
                    <span id="typing-status" class="typing-status"></span>
                </div>
                <div class="chat-input-container">
                    <textarea id="chat-input" placeholder="Type your message here..."></textarea>
                    <button id="send-message">Send</button>
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

    // Initialize WebSocket and encryption
    await initializeChat(doctorId, doctorName);

    // Load existing messages
    loadChatHistory(doctorId);

    // Set up send button
    document.getElementById('send-message').addEventListener('click', async () => {
        const messageInput = document.getElementById('chat-input');
        const message = messageInput.value.trim();
        
        if (message) {
            console.log("Sending message to doctor...");
            // Send the encrypted message
            const success = await sendEncryptedMessage(doctorId, message);
            
            if (success) {
                // Only clear input if message was sent successfully
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
    
    // Set up typing indicator
    let typingTimer;
    document.getElementById('chat-input').addEventListener('input', () => {
        if (socket) {
            socket.emit('typing', { recipient_id: doctorId });
            
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                socket.emit('stop_typing', { recipient_id: doctorId });
            }, 2000);
        }
    });

    // Initialize encryption and chat with better error handling
    try {
        document.getElementById('encryption-status').textContent = 'Setting up secure connection...';
        await initializeChat(doctorId, doctorName);
        
        // Enable the input once encryption is ready
        document.getElementById('chat-input').disabled = false;
        document.getElementById('send-message').disabled = false;
        document.getElementById('encryption-status').textContent = '🔒 End-to-end encrypted';
        
        // Load existing messages
        loadChatHistory(doctorId);
    } catch (error) {
        console.error("Failed to initialize chat:", error);
        document.getElementById('encryption-status').textContent = '⚠️ Secure channel setup failed';
        
        // Create a retry button
        const chatContainer = document.getElementById('chat-messages');
        chatContainer.innerHTML = `
            <div class="error-message" style="text-align: center; margin-top: 20px;">
                <p>Failed to set up secure messaging</p>
                <p style="font-size: 0.9em; color: #666;">${error.message}</p>
                <button id="retry-encryption" style="margin-top: 10px; padding: 8px 16px;">
                    Retry Connection
                </button>
            </div>
        `;
        
        document.getElementById('retry-encryption').addEventListener('click', () => {
            chatWithDoctor(doctorId, doctorName);
        });
    }
}

// Load chat history from server
async function loadChatHistory(doctorId) {
    try {
        const response = await fetch(`/api/chat/${doctorId}`);
        if (!response.ok) {
            throw new Error('Failed to load chat history');
        }
        
        const messages = await response.json();
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
        const messagePromises = messages.map(async (msg) => {
            try {
                const decryptedText = await decryptMessage(msg.encryptedMessage);
                
                const messageElement = document.createElement('div');
                messageElement.className = `chat-message ${msg.isFromDoctor ? 'received' : 'sent'}`;
                
                const contentElement = document.createElement('div');
                contentElement.className = 'message-content';
                contentElement.textContent = decryptedText;
                
                const timeElement = document.createElement('div');
                timeElement.className = 'message-time';
                timeElement.textContent = new Date(msg.timestamp).toLocaleString();
                
                messageElement.appendChild(contentElement);
                messageElement.appendChild(timeElement);
                return messageElement;
            } catch (error) {
                console.error('Error decrypting message:', error);
                return null;
            }
        });
        
        // Wait for all decryption to complete, then add messages to the container
        const messageElements = await Promise.all(messagePromises);
        messageElements.filter(el => el !== null).forEach(el => {
            chatContainer.appendChild(el);
        });
        
        // Scroll to bottom of chat
        chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

// Send message to server
async function sendMessage(doctorId, message) {
    try {
        const response = await fetch('/api/chat/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                recipientId: doctorId,
                message: message
            })
        });
        
        if (response.ok) {
            // Refresh messages after sending
            loadChatHistory(doctorId);
        } else {
            console.error('Failed to send message');
        }
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

// Display messages in chat window
function displayMessages(messages) {
    const chatContainer = document.getElementById('chat-messages');
    chatContainer.innerHTML = '';
    
    if (messages.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-chat';
        emptyMessage.textContent = 'No messages yet. Start the conversation!';
        chatContainer.appendChild(emptyMessage);
        return;
    }
    
    messages.forEach(msg => {
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${msg.isFromDoctor ? 'received' : 'sent'}`;
        
        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        contentElement.textContent = msg.message;
        
        const timeElement = document.createElement('div');
        timeElement.className = 'message-time';
        timeElement.textContent = new Date(msg.timestamp).toLocaleString();
        
        messageElement.appendChild(contentElement);
        messageElement.appendChild(timeElement);
        chatContainer.appendChild(messageElement);
    });
    
    // Scroll to bottom of chat
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function associateWithDoctor(e) {
    e.preventDefault();
    const doctorId = document.getElementById('doctor-id').value.trim();
    
    if (!doctorId) {
        document.getElementById('association-message').innerHTML = 
            '<p class="error-message">Please enter a valid Doctor ID</p>';
        return;
    }
    
    try {
        const response = await fetch('/api/patient/associate-doctor', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ doctorId })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('association-message').innerHTML = 
                '<p class="success-message">Successfully associated with doctor!</p>';
            
            // Reload the modal after a short delay
            setTimeout(() => manageDoctorAssociation(), 1500);
        } else {
            document.getElementById('association-message').innerHTML = 
                `<p class="error-message">${data.error}</p>`;
        }
    } catch (error) {
        document.getElementById('association-message').innerHTML = 
            '<p class="error-message">An error occurred. Please try again.</p>';
    }
}

async function removeDoctorAssociation() {
    if (!confirm('Are you sure you want to remove your association with this doctor?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/patient/remove-doctor-association', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('Doctor association removed successfully');
            // Reload the modal
            manageDoctorAssociation();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        alert('An error occurred. Please try again.');
    }
}

// Function to edit profile (for patient dashboard)
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
        if (profileData.role === 'Patient') {
            formHtml += `
                <div class="form-group">
                    <label for="edit-dob">Date of Birth</label>
                    <input type="date" id="edit-dob" name="dob" value="${profileData.dob || ''}" required>
                </div>
                
                <div class="form-group">
                    <label for="edit-gender">Gender</label>
                    <select id="edit-gender" name="gender" required>
                        <option value="">Select</option>
                        <option value="Male" ${profileData.gender === 'Male' ? 'selected' : ''}>Male</option>
                        <option value="Female" ${profileData.gender === 'Female' ? 'selected' : ''}>Female</option>
                        <option value="Other" ${profileData.gender === 'Other' ? 'selected' : ''}>Other</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="edit-address">Address</label>
                    <textarea id="edit-address" name="address" required>${profileData.address || ''}</textarea>
                </div>
                
                <div class="form-group">
                    <label for="edit-emergency-contact">Emergency Contact Name</label>
                    <input type="text" id="edit-emergency-contact" name="emergency_contact" value="${profileData.emergency_contact || ''}" required>
                </div>
                
                <div class="form-group">
                    <label for="edit-emergency-phone">Emergency Contact Phone</label>
                    <input type="tel" id="edit-emergency-phone" name="emergency_phone" value="${profileData.emergency_phone || ''}" required>
                </div>
                
                <div class="form-group">
                    <label for="edit-medical-history">Medical History (Optional)</label>
                    <textarea id="edit-medical-history" name="medical_history">${profileData.medical_history || ''}</textarea>
                </div>
            `;
        } else if (profileData.role === 'Doctor') {
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
            
            // Add role-specific fields
            if (profileData.role === 'Patient') {
                formData.dob = document.getElementById('edit-dob').value;
                formData.gender = document.getElementById('edit-gender').value;
                formData.address = document.getElementById('edit-address').value;
                formData.emergency_contact = document.getElementById('edit-emergency-contact').value;
                formData.emergency_phone = document.getElementById('edit-emergency-phone').value;
                formData.medical_history = document.getElementById('edit-medical-history').value;
            } else if (profileData.role === 'Doctor') {
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

// WebSocket and encryption functions
let socket;
let userKeys;
let recipientPublicKey;
let currentChatPartner;

// Initialize WebSocket connection and crypto
async function initializeChat(doctorId, doctorName) {
    currentChatPartner = doctorId;
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
            } else {
                // Show notification for messages when chat is not open
                showMessageNotification(data);
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
        await getRecipientPublicKey(doctorId);
        
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

// Create a more robust ensureUserKeys function with better error handling
async function ensureUserKeys() {
    try {
        console.log("Checking for existing encryption keys...");
        
        // First, run a diagnostic test
        const diagResponse = await fetch('/api/encryption-keys/debug');
        const diagnostics = await diagResponse.json();
        console.log("Encryption setup diagnostics:", diagnostics);
        
        if (!diagnostics.table_exists) {
            console.error("UserEncryptionKeys table does not exist!");
            throw new Error("Encryption system is not properly set up");
        }
        
        if (diagnostics.has_keys) {
            console.log("User already has encryption keys, retrieving them...");
            // Get existing keys
            const response = await fetch('/api/encryption-keys/user');
            
            if (response.ok) {
                const data = await response.json();
                userKeys = data;
                console.log("Retrieved existing encryption keys successfully");
                
                // Validate the keys
                if (!userKeys.private_key || !userKeys.private_key.includes("BEGIN PRIVATE KEY")) {
                    console.warn("Retrieved invalid private key format, will regenerate");
                    throw new Error("Invalid key format");
                }
                
                return userKeys;
            } else {
                const errorText = await response.text();
                console.error("Error retrieving existing keys:", errorText);
                throw new Error("Failed to retrieve existing keys");
            }
        }
        
        // If we get here, we need to generate new keys
        console.log("Generating new encryption keys...");
        
        // Generate keys directly in the browser
        const browserKeys = await crypto_utils.generateKeyPair();
        console.log("Generated keys in browser:", browserKeys.publicKey.substr(0, 40) + "...");
        
        // Upload to server
        const saveResponse = await fetch('/api/encryption-keys/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                public_key: browserKeys.publicKey,
                private_key: browserKeys.privateKey
            })
        });
        
        if (saveResponse.ok) {
            const result = await saveResponse.json();
            console.log("Saved keys to server successfully");
            userKeys = browserKeys;
            return userKeys;
        } else {
            const errorData = await saveResponse.json();
            console.error("Failed to save keys to server:", errorData.error);
            
            // As a fallback, try server-side generation
            console.log("Trying server-side key generation as fallback...");
            const genResponse = await fetch('/api/encryption-keys/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (genResponse.ok) {
                const result = await genResponse.json();
                console.log("Generated keys server-side successfully");
                userKeys = result.keys;
                return userKeys;
            } else {
                const serverError = await genResponse.json();
                console.error("Server-side key generation also failed:", serverError.error);
                throw new Error("Failed to generate or save encryption keys");
            }
        }
    } catch (error) {
        console.error("Error in ensureUserKeys:", error);
        alert("Error: Failed to set up secure messaging. Please try again later.");
        throw error;
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
        return "⚠️ Could not decrypt message";
    }
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
        decryptMessage(messageData.encrypted_message)
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

function showMessageNotification(messageData) {
    // Show a browser notification if the chat isn't open
    if (Notification.permission === "granted") {
        // Decrypt the message for the notification
        decryptMessage(messageData.encrypted_message)
            .then(decryptedMessage => {
                new Notification("New Message", {
                    body: `${decryptedMessage.substring(0, 50)}...`,
                    icon: "/static/favicon.ico"
                });
            });
    }
}

// Send encrypted message to server
async function sendEncryptedMessage(doctorId, message) {
    if (!recipientPublicKey) {
        console.error("Cannot send message: Recipient public key not available");
        return false;
    }
    
    try {
        console.log("Encrypting message with recipient's public key...");
        const encryptedMessage = await crypto_utils.encrypt_message(message, recipientPublicKey);
        
        console.log("Sending encrypted message to server...");
        const response = await fetch('/api/chat/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                recipientId: doctorId,
                encryptedMessage: encryptedMessage
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Server error: ${errorData.error || response.statusText}`);
        }
        
        console.log("Message sent successfully!");
        
        // Get the timestamp from the response headers or body
        const timestamp = response.headers.get('Date') || new Date().toISOString();
        
        // Optimistically add the message to the chat
        addMessageToChat({
            sender_id: getUserId(),
            recipient_id: doctorId,
            encrypted_message: encryptedMessage,
            timestamp: timestamp
        });
        
        return true;
    } catch (error) {
        console.error('Error sending encrypted message:', error);
        return false;
    }
}

// Add this after the socket initialization in initializeChat function
socket.on('new_message', (data) => {
    console.log('Received new message via socket:', data);
    
    // Only process if it's from the current chat partner
    if (currentChatPartner && 
        ((data.sender_id == currentChatPartner && data.recipient_id == getUserId()) || 
         (data.sender_id == getUserId() && data.recipient_id == currentChatPartner))) {
        
        // Add message to chat
        try {
            if (data.encrypted_message) {
                // Decrypt and display the message
                decryptMessage(data.encrypted_message)
                    .then(decryptedText => {
                        const messageType = data.is_from_doctor ? 'received' : 'sent';
                        addDecryptedMessageToChat(decryptedText, messageType, data.timestamp);
                    })
                    .catch(error => {
                        console.error('Error decrypting socket message:', error);
                        addDecryptedMessageToChat("⚠️ Could not decrypt message", 
                            data.is_from_doctor ? 'received' : 'sent', 
                            data.timestamp);
                    });
            }
        } catch (error) {
            console.error('Error processing new message:', error);
        }
    } else {
        // Show notification for messages when chat is not open with this sender
        if (data.sender_id != getUserId()) {
            showMessageNotification(data);
        }
    }
});

// Add this helper function to display decrypted messages
function addDecryptedMessageToChat(decryptedText, messageType, timestamp) {
    const chatContainer = document.getElementById('chat-messages');
    if (!chatContainer) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = `chat-message ${messageType}`;
    
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    contentElement.textContent = decryptedText;
    
    const timeElement = document.createElement('div');
    timeElement.className = 'message-time';
    timeElement.textContent = new Date(timestamp).toLocaleString();
    
    messageElement.appendChild(contentElement);
    messageElement.appendChild(timeElement);
    chatContainer.appendChild(messageElement);
    
    // Scroll to bottom of chat
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Update the sendEncryptedMessage function to be more robust
async function sendEncryptedMessage(doctorId, message) {
    if (!recipientPublicKey) {
        console.error("Cannot send message: Recipient public key not available");
        return false;
    }
    
    try {
        console.log("Encrypting message with recipient's public key...");
        const encryptedMessage = await crypto_utils.encrypt_message(message, recipientPublicKey);
        
        console.log("Sending encrypted message to server...");
        const response = await fetch('/api/chat/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                recipientId: doctorId,
                encryptedMessage: encryptedMessage
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Server error: ${errorData.error || response.statusText}`);
        }
        
        console.log("Message sent successfully!");
        
        // Get the timestamp from the response headers or body
        const timestamp = response.headers.get('Date') || new Date().toISOString();
        
        // Optimistically add the message to the chat
        addMessageToChat({
            sender_id: getUserId(),
            recipient_id: doctorId,
            encrypted_message: encryptedMessage,
            timestamp: timestamp
        });
        
        return true;
    } catch (error) {
        console.error('Error sending encrypted message:', error);
        return false;
    }
}

// Update the chatWithDoctor function to handle encryption errors better
async function chatWithDoctor(doctorId, doctorName) {
    // Close any existing modal
    const existingModal = document.querySelector('.modal');
    if (existingModal) existingModal.remove();
    
    // Create chat modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content chat-modal">
            <div class="modal-header">
                <h2>Chat with Dr. ${doctorName}</h2>
                <span class="close">&times;</span>
            </div>
            <div class="chat-container">
                <div id="chat-messages" class="chat-messages"></div>
                <div class="chat-status">
                    <span id="encryption-status" class="encryption-status">🔒 End-to-end encrypted</span>
                    <span id="typing-status" class="typing-status"></span>
                </div>
                <div class="chat-input-container">
                    <textarea id="chat-input" placeholder="Type your message here..."></textarea>
                    <button id="send-message">Send</button>
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

    // Initialize WebSocket and encryption
    await initializeChat(doctorId, doctorName);

    // Load existing messages
    loadChatHistory(doctorId);

    // Set up send button
    document.getElementById('send-message').addEventListener('click', async () => {
        const messageInput = document.getElementById('chat-input');
        const message = messageInput.value.trim();
        
        if (message) {
            console.log("Sending message to doctor...");
            // Send the encrypted message
            const success = await sendEncryptedMessage(doctorId, message);
            
            if (success) {
                // Only clear input if message was sent successfully
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
    
    // Set up typing indicator
    let typingTimer;
    document.getElementById('chat-input').addEventListener('input', () => {
        if (socket) {
            socket.emit('typing', { recipient_id: doctorId });
            
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                socket.emit('stop_typing', { recipient_id: doctorId });
            }, 2000);
        }
    });

    // Initialize encryption and chat with better error handling
    try {
        document.getElementById('encryption-status').textContent = 'Setting up secure connection...';
        await initializeChat(doctorId, doctorName);
        
        // Enable the input once encryption is ready
        document.getElementById('chat-input').disabled = false;
        document.getElementById('send-message').disabled = false;
        document.getElementById('encryption-status').textContent = '🔒 End-to-end encrypted';
        
        // Load existing messages
        loadChatHistory(doctorId);
    } catch (error) {
        console.error("Failed to initialize chat:", error);
        document.getElementById('encryption-status').textContent = '⚠️ Secure channel setup failed';
        
        // Create a retry button
        const chatContainer = document.getElementById('chat-messages');
        chatContainer.innerHTML = `
            <div class="error-message" style="text-align: center; margin-top: 20px;">
                <p>Failed to set up secure messaging</p>
                <p style="font-size: 0.9em; color: #666;">${error.message}</p>
                <button id="retry-encryption" style="margin-top: 10px; padding: 8px 16px;">
                    Retry Connection
                </button>
            </div>
        `;
        
        document.getElementById('retry-encryption').addEventListener('click', () => {
            chatWithDoctor(doctorId, doctorName);
        });
    }
}

// Update the sendEncryptedMessage function to encrypt for both sender and recipient
async function sendEncryptedMessage(doctorId, message) {
    if (!recipientPublicKey || !userKeys) {
        console.error("Cannot send message: Public keys not available");
        return false;
    }
    
    try {
        // Encrypt message for recipient
        console.log("Encrypting message for recipient with their public key...");
        const recipientEncryptedMessage = await crypto_utils.encrypt_message(message, recipientPublicKey);
        
        // Encrypt message for sender (using sender's own public key)
        console.log("Encrypting message for sender with own public key...");
        const senderEncryptedMessage = await crypto_utils.encrypt_message(message, userKeys.public_key);
        
        console.log("Sending dual-encrypted message to server...");
        const response = await fetch('/api/chat/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                recipientId: doctorId,
                senderEncryptedMessage: senderEncryptedMessage,
                recipientEncryptedMessage: recipientEncryptedMessage
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Server error: ${errorData.error || response.statusText}`);
        }
        
        console.log("Message sent successfully!");
        
        // Get the timestamp from the response headers or body
        const timestamp = response.headers.get('Date') || new Date().toISOString();
        
        // Optimistically add the message to the chat - use the sender's encrypted version
        addMessageToChat({
            sender_id: getUserId(),
            recipient_id: doctorId,
            encrypted_message: senderEncryptedMessage, // Use sender's version
            timestamp: timestamp
        });
        
        return true;
    } catch (error) {
        console.error('Error sending encrypted message:', error);
        return false;
    }
}

// Update socket handler to work with dual encryption
socket.on('new_message', (data) => {
    console.log('Received new message via socket:', data);
    
    // Only process if it's from the current chat partner
    if (currentChatPartner && 
        ((data.sender_id == currentChatPartner && data.recipient_id == getUserId()) || 
         (data.sender_id == getUserId() && data.recipient_id == currentChatPartner))) {
        
        // Add message to chat using the appropriate encrypted version
        try {
            // Select the appropriate encrypted message version
            const encryptedMessage = data.sender_id == getUserId() 
                ? data.sender_encrypted_message   // If I'm the sender, use sender version
                : data.recipient_encrypted_message; // Otherwise use recipient version
                
            if (encryptedMessage) {
                // Decrypt and display the message
                decryptMessage(encryptedMessage)
                    .then(decryptedText => {
                        const messageType = data.sender_id == getUserId() ? 'sent' : 'received';
                        addDecryptedMessageToChat(decryptedText, messageType, data.timestamp);
                    })
                    .catch(error => {
                        console.error('Error decrypting socket message:', error);
                        addDecryptedMessageToChat("⚠️ Could not decrypt message", 
                            data.sender_id == getUserId() ? 'sent' : 'received', 
                            data.timestamp);
                    });
            }
        } catch (error) {
            console.error('Error processing new message:', error);
        }
    }
    // ...existing code...
});

// Add this helper function to display decrypted messages
function addDecryptedMessageToChat(decryptedText, messageType, timestamp) {
    const chatContainer = document.getElementById('chat-messages');
    if (!chatContainer) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = `chat-message ${messageType}`;
    
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    contentElement.textContent = decryptedText;
    
    const timeElement = document.createElement('div');
    timeElement.className = 'message-time';
    timeElement.textContent = new Date(timestamp).toLocaleString();
    
    messageElement.appendChild(contentElement);
    messageElement.appendChild(timeElement);
    chatContainer.appendChild(messageElement);
    
    // Scroll to bottom of chat
    chatContainer.scrollTop = chatContainer.scrollHeight;
}
