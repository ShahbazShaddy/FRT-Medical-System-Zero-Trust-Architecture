import os
from dotenv import load_dotenv
from langchain.chains import LLMChain
from langchain_core.prompts import (
    ChatPromptTemplate,
    HumanMessagePromptTemplate,
    MessagesPlaceholder,
)
from langchain_core.messages import SystemMessage
from langchain.chains.conversation.memory import ConversationBufferWindowMemory
from langchain_groq import ChatGroq

# Load environment variables from .env file
load_dotenv()

# Get Groq API key from environment variable
groq_api_key = os.environ.get("GROQ_API_KEY")
model = 'llama3-8b-8192'

# Initialize Groq Langchain chat object
groq_chat = ChatGroq(
    groq_api_key=groq_api_key, 
    model_name=model
)

# System prompt for FRT (Functional Rating Test)
system_prompt = '''You are tasked with performing the FRT (Functional Rating Test). Follow these steps to gather and validate information from the user:

Personal Details:
Ask for the following details one by one:
What is your name?
What is your age?
What is your gender?
What is your weight (kg)?
What is your marital status?

Presenting Complaints:
Ask each question one by one. If the user answers "yes," ask for the duration in days.
Do you have memory problems, particularly remembering recent events? If yes, mention the duration.
Do you have increasing confusion? If yes, mention the duration.
Do you have reduced concentration? If yes, mention the duration.
Do you have behavior changes? If yes, mention the duration.
Do you have withdrawal? If yes, mention the duration.
Do you have loss of ability to do everyday tasks? If yes, mention the duration.

History of Presenting Illness:
Ask the following questions one by one:
What is the onset of your symptoms? (Sudden or Gradual)
What factors aggravate the above symptoms?
What factors relieve the symptoms?
Any other associated factors? (e.g., diarrhea, constipation, digestion problems)

Evaluation Scale:
Validate the duration of symptoms against the following criteria:
Memory problems: more than 2 days
Increasing confusion: more than 5 days
Reduced concentration: more than 6 days
Behavior changes: more than 7 days
Withdrawal: more than 8 days
Loss of ability to do everyday tasks: more than 10 days

Conclusion:
If any of the symptoms meet or exceed the specified duration, respond with: "Proceed with the FRT."
If none of the symptoms meet the criteria, respond with: "There is no need to do the FRT."'''

# Number of previous messages the chatbot will remember
conversational_memory_length = 20
memory = ConversationBufferWindowMemory(k=conversational_memory_length, memory_key="chat_history", return_messages=True)

# Dictionary to store chat histories by user
chat_histories = {}
# Dictionary to store conversation states
conversation_states = {}

def create_conversation_chain():
    """
    Creates a conversation chain with the configured LLM, prompt template, and memory.
    """
    # Construct a chat prompt template using various components
    prompt = ChatPromptTemplate.from_messages(
        [
            SystemMessage(content=system_prompt),
            MessagesPlaceholder(variable_name="chat_history"),
            HumanMessagePromptTemplate.from_template("{human_input}")
        ]
    )

    # Create a conversation chain
    conversation = LLMChain(
        llm=groq_chat,
        prompt=prompt,
        verbose=False,
        memory=memory,
    )
    
    return conversation

def process_chat(user_id, user_question, new_conversation=False):
    """
    Process a chat message from a user.
    
    Args:
        user_id: The ID of the user sending the message
        user_question: The message from the user
        new_conversation: Whether this is a new conversation
        
    Returns:
        Dict containing the answer, FRT recommendation, and chat history
    """
    if user_id not in chat_histories or new_conversation:
        chat_histories[user_id] = []
        # Clear memory for new conversations
        memory.clear()
    
    # Add user message to history
    chat_histories[user_id].append({"role": "user", "content": user_question})
    
    # Create conversation chain
    conversation = create_conversation_chain()

    # Get response from the model
    response = conversation.predict(human_input=user_question)
    
    # Add assistant response to history
    chat_histories[user_id].append({"role": "assistant", "content": response})
    
    # Check if the response contains a definitive FRT recommendation
    frt_recommended = 0
    if "Proceed with the FRT".lower() in response.lower():
        frt_recommended = 1
    
    return {
        "answer": response,
        "frt_recommended": frt_recommended,
        "chat_history": chat_histories[user_id]
    }

def get_formatted_conversation(user_id):
    """
    Returns the conversation history in a formatted string.
    
    Args:
        user_id: The ID of the user
        
    Returns:
        String containing the formatted conversation
    """
    if user_id not in chat_histories:
        return ""
        
    formatted_conversation = ""
    for msg in chat_histories[user_id]:
        role = "User" if msg["role"] == "user" else "Assistant"
        formatted_conversation += f"{role}: {msg['content']}\n\n"
    
    return formatted_conversation

def reset_conversation(user_id):
    """
    Reset the conversation for a specific user.
    
    Args:
        user_id: The ID of the user
    """
    if user_id in chat_histories:
        chat_histories[user_id] = []
    if user_id in conversation_states:
        conversation_states[user_id] = {
            'is_new_conversation': True,
            'conversation_saved': False
        }
    memory.clear()