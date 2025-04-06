// Add this function at the beginning
async function resetConversation() {
    try {
        await fetch('/reset-conversation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
    } catch (error) {
        console.error('Error resetting conversation:', error);
    }
}

// Function to send the message
function sendMessage() {
    var user_input = document.getElementById('input').value;
    
    if (user_input.trim() !== "") {
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

        // Fetch chatbot's response
        fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }).then(response => response.json())
          .then(data => {
              displayBotMessage(data.answer);

              // Check if FRT is recommended
              if (data.frt_recommended === 1) {
                  displayFRTButtons();
              }

              // Store chat history
              window.chatHistory = data.chat_history;
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
        $.ajax({
            url: '/live_frt',
            method: 'GET',
            success: function(response) {
                displayBotMessage('Live FRT result: ' + response.result);
            },
            error: function(error) {
                console.error('Error:', error);
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
    userText.innerHTML = message;
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
    botText.innerHTML = message;
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
    var formData = new FormData();
    formData.append('video', file);

    $.ajax({
        url: '/upload',
        method: 'POST',
        data: formData,
        contentType: false,
        processData: false,
        success: function(response) {
            displayBotMessage('Upload successful! Video result: ' + response.result);
            saveFRTResult(response.result, memory.chatHistory || '');
        },
        error: function(error) {
            console.error('Error:', error);
        }
    });
});

// Update the saveFRTResult function to use the full conversation history
async function saveFRTResult(result, symptoms) {
    try {
        // Get the full conversation history from window.chatHistory
        let conversationText = '';
        if (window.chatHistory && window.chatHistory.length > 0) {
            conversationText = window.chatHistory.map(msg => 
                `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
            ).join('\n\n');
        }
        
        const response = await fetch('/save-frt-result', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                maxDistance: parseFloat(result.match(/\d+(\.\d+)?/)[0] || 0),
                riskLevel: result,
                symptoms: conversationText || 'No conversation recorded'
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to save result');
        }
    } catch (error) {
        console.error('Error saving FRT result:', error);
    }
}

// Add this at the end of the file
window.chatStarted = false;
window.chatHistory = [];
