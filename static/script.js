// Get CSRF token
const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

// Session timeout variables
let sessionTimeout;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Function to reset session timeout
function resetSessionTimeout() {
    clearTimeout(sessionTimeout);
    sessionTimeout = setTimeout(() => {
        alert('Your session is about to expire. Please save your work and refresh the page.');
        
        // Redirect to login after alert is dismissed
        window.location.href = '/login';
    }, SESSION_TIMEOUT_MS);
}

// Reset timeout on user activity
['click', 'keypress', 'scroll', 'mousemove'].forEach(event => {
    document.addEventListener(event, resetSessionTimeout);
});

// Initialize session timeout
resetSessionTimeout();

// Add this function at the beginning
async function resetConversation() {
    try {
        await fetch('/reset-conversation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken || '',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin'
        });
    } catch (error) {
        console.error('Error resetting conversation:', error);
    }
}

// Sanitize text to prevent XSS
function sanitizeText(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Function to send the message
function sendMessage() {
    var user_input = document.getElementById('input').value;
    
    if (user_input.trim() !== "") {
        // Validate input length to prevent attacks
        if (user_input.length > 500) {
            displayBotMessage("Message too long. Please limit your message to 500 characters.");
            return;
        }
        
        // Create payload with new_conversation flag if this is the first message
        const payload = {
            question: user_input,
            new_conversation: !window.chatStarted
        };
        
        // Set chat started flag
        if (!window.chatStarted) {
            window.chatStarted = true;
        }
        
        displayUserMessage(user_input);
        document.getElementById('input').value = ''; // Clear the input field

        // Add button disable to prevent multiple submissions
        const sendButton = document.getElementById('button');
        sendButton.disabled = true;
        sendButton.textContent = 'Sending...';

        // Fetch chatbot's response with CSRF protection
        fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken || '',
                'X-Requested-With': 'XMLHttpRequest',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            },
            body: JSON.stringify(payload),
            credentials: 'same-origin'
        }).then(response => {
            if (response.status === 403) {
                throw new Error('Session expired');
            }
            return response.json();
        })
        .then(data => {
            displayBotMessage(data.answer);

            // Check if FRT is recommended
            if (data.frt_recommended === 1) {
                // Save recommendation to history before displaying buttons
                saveRecommendation(data.chat_history || []);
                displayFRTButtons();
            }

            // Store chat history
            window.chatHistory = data.chat_history;
            
            // Re-enable button
            sendButton.disabled = false;
            sendButton.textContent = 'Send';
        })
        .catch(error => {
            console.error('Error:', error);
            if (error.message === 'Session expired') {
                displayBotMessage("Your session has expired. Please refresh the page to continue.");
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            } else {
                displayBotMessage("Sorry, there was an error processing your request. Please try again.");
            }
            
            // Re-enable button
            sendButton.disabled = false;
            sendButton.textContent = 'Send';
        });
    }
}

// Function to display the FRT buttons
function displayFRTButtons() {
    let buttonContainer = document.getElementById("button-container");
    buttonContainer.innerHTML = ''; // Clear previous buttons if any

    let uploadButton = document.createElement("button");
    uploadButton.textContent = "Upload";
    uploadButton.onclick = function() {
        $('#file-input').click();
    };

    let liveFRTButton = document.createElement("button");
    liveFRTButton.textContent = "Live FRT";
    liveFRTButton.onclick = function() {
        liveFRTButton.disabled = true;
        liveFRTButton.textContent = "Processing...";
        
        $.ajax({
            url: '/api/frt/live',  
            method: 'GET',
            headers: {
                'X-CSRF-Token': csrfToken || '',
                'X-Requested-With': 'XMLHttpRequest'
            },
            success: function(response) {
                displayBotMessage('Live FRT result: ' + sanitizeText(response.result));
                saveFRTResult(response.result, window.chatHistory || '');
                liveFRTButton.disabled = false;
                liveFRTButton.textContent = "Live FRT";
            },
            error: function(error) {
                console.error('Error:', error);
                const errorMsg = error.status === 403 ? 
                    'Session expired. Please refresh the page.' : 
                    'Error performing Live FRT: ' + (error.responseJSON?.error || 'Unknown error');
                    
                displayBotMessage(errorMsg);
                
                if (error.status === 403) {
                    setTimeout(() => {
                        window.location.href = '/login';
                    }, 2000);
                }
                
                liveFRTButton.disabled = false;
                liveFRTButton.textContent = "Live FRT";
            }
        });
    };

    buttonContainer.appendChild(uploadButton);
    buttonContainer.appendChild(liveFRTButton);
}

// Function to display the user's message
function displayUserMessage(message) {
    let chat = document.getElementById("chat");
    let userMessage = document.createElement("div");
    userMessage.classList.add("message");
    userMessage.classList.add("user");
    let userAvatar = document.createElement("div");
    userAvatar.classList.add("avatar");
    let userText = document.createElement("div");
    userText.classList.add("text");
    userText.textContent = message; // Use textContent instead of innerHTML for security
    userMessage.appendChild(userAvatar);
    userMessage.appendChild(userText);
    chat.appendChild(userMessage);
    chat.scrollTop = chat.scrollHeight;
}

// Function to display the bot's message
function displayBotMessage(message) {
    let chat = document.getElementById("chat");
    let botMessage = document.createElement("div");
    botMessage.classList.add("message");
    botMessage.classList.add("bot");
    let botAvatar = document.createElement("div");
    botAvatar.classList.add("avatar");
    let botText = document.createElement("div");
    botText.classList.add("text");
    
    // Safely render HTML content from the bot
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = DOMPurify.sanitize(message); // Using DOMPurify library for sanitization
    botText.innerHTML = tempDiv.innerHTML;
    
    botMessage.appendChild(botAvatar);
    botMessage.appendChild(botText);
    chat.appendChild(botMessage);
    chat.scrollTop = chat.scrollHeight;
}

// Add a click event listener to the button
document.getElementById("button").addEventListener("click", sendMessage);

// Add a keypress event listener to the input field
document.getElementById("input").addEventListener("keypress", function(event) {
  if (event.keyCode === 13) {
      sendMessage();
  }
});

// Handle video file input change event
$('#file-input').change(function() {
    var file = $('#file-input')[0].files[0];
    
    // Validate file
    if (!file) {
        displayBotMessage('Please select a valid file.');
        return;
    }
    
    // Validate file type
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
    if (!allowedTypes.includes(file.type)) {
        displayBotMessage('Invalid file type. Please upload a video file (MP4, MOV, or WebM).');
        return;
    }
    
    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        displayBotMessage('File too large. Maximum file size is 10MB.');
        return;
    }
    
    var formData = new FormData();
    formData.append('video', file);
    formData.append('csrf_token', csrfToken || '');

    displayBotMessage('Uploading and processing your video...');
    
    $.ajax({
        url: '/api/frt/upload',
        method: 'POST',
        data: formData,
        contentType: false,
        processData: false,
        headers: {
            'X-CSRF-Token': csrfToken || '',
            'X-Requested-With': 'XMLHttpRequest'
        },
        success: function(response) {
            displayBotMessage('Upload successful! Video result: ' + sanitizeText(response.result));
            saveFRTResult(response.result, window.chatHistory || '');
        },
        error: function(error) {
            console.error('Error:', error);
            
            const errorMsg = error.status === 403 ? 
                'Session expired. Please refresh the page.' : 
                'Error uploading video: ' + (error.responseJSON?.error || 'Please try again with a different file.');
                
            displayBotMessage(errorMsg);
            
            if (error.status === 403) {
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            }
        }
    });
});

// Add new function to save FRT recommendation to history
async function saveRecommendation(chatHistory) {
    try {
        // Get the full conversation history
        let conversationText = '';
        if (chatHistory && chatHistory.length > 0) {
            conversationText = chatHistory.map(msg => 
                `${msg.role === 'user' ? 'User' : 'Assistant'}: ${sanitizeText(msg.content)}`
            ).join('\n\n');
        }
        
        const response = await fetch('/api/frt/save-result', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken || '',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
                maxDistance: 0, // No distance measured yet
                riskLevel: 'Recommended', // Status is "Recommended"
                symptoms: conversationText || 'No conversation recorded'
            }),
            credentials: 'same-origin'
        });
        
        if (response.status === 403) {
            throw new Error('Session expired');
        }
        
        if (!response.ok) {
            throw new Error('Failed to save recommendation');
        }
        
        console.log('FRT recommendation saved to history');
    } catch (error) {
        console.error('Error saving FRT recommendation:', error);
        if (error.message === 'Session expired') {
            displayBotMessage("Your session has expired. Please refresh the page to continue.");
            setTimeout(() => {
                window.location.href = '/login';
            }, 2000);
        }
    }
}

// Update the saveFRTResult function to use the full conversation history
async function saveFRTResult(result, symptoms) {
    try {
        // Get the full conversation history from window.chatHistory
        let conversationText = '';
        if (window.chatHistory && window.chatHistory.length > 0) {
            conversationText = window.chatHistory.map(msg => 
                `${msg.role === 'user' ? 'User' : 'Assistant'}: ${sanitizeText(msg.content)}`
            ).join('\n\n');
        }
        
        const response = await fetch('/api/frt/save-result', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken || '',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
                maxDistance: parseFloat((result.match(/\d+(\.\d+)?/) || [0])[0] || 0),
                riskLevel: sanitizeText(result),
                symptoms: conversationText || 'No conversation recorded'
            }),
            credentials: 'same-origin'
        });
        
        if (response.status === 403) {
            throw new Error('Session expired');
        }
        
        if (!response.ok) {
            throw new Error('Failed to save result');
        }
    } catch (error) {
        console.error('Error saving FRT result:', error);
        if (error.message === 'Session expired') {
            displayBotMessage("Your session has expired. Please refresh the page to continue.");
            setTimeout(() => {
                window.location.href = '/login';
            }, 2000);
        }
    }
}

// Rate limiting for message sending
let messageCount = 0;
const MAX_MESSAGES = 15;
const MESSAGE_RESET_INTERVAL = 60000; // 1 minute

setInterval(() => {
    messageCount = 0;
}, MESSAGE_RESET_INTERVAL);

// Override the original sendMessage function with rate limiting
const originalSendMessage = sendMessage;
window.sendMessage = function() {
    if (messageCount >= MAX_MESSAGES) {
        displayBotMessage("You're sending messages too quickly. Please wait a minute before trying again.");
        return;
    }
    messageCount++;
    originalSendMessage();
};

// Add this at the end of the file
window.chatStarted = false;
window.chatHistory = [];

// Add event listener for unload to help prevent session hijacking
window.addEventListener('beforeunload', function() {
    // Make a best-effort attempt to invalidate the session when leaving
    navigator.sendBeacon('/api/session/touch', '');
});
