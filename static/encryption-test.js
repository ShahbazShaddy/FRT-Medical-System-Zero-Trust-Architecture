/**
 * Utility script to test encryption key generation and storage
 */

// Function to test key generation in the browser
async function testBrowserKeyGeneration() {
    try {
        console.log("Testing browser key generation...");
        const startTime = performance.now();
        
        const keys = await crypto_utils.generateKeyPair();
        
        const endTime = performance.now();
        console.log(`Key generation took ${(endTime - startTime).toFixed(2)}ms`);
        
        console.log("Public key:", keys.publicKey.substring(0, 40) + "...");
        console.log("Private key:", keys.privateKey.substring(0, 40) + "...");
        
        document.getElementById('browser-key-status').textContent = "Success! Keys generated in browser.";
        document.getElementById('browser-key-status').style.color = "green";
        
        // Store keys in the output area
        document.getElementById('public-key-output').value = keys.publicKey;
        document.getElementById('private-key-output').value = keys.privateKey;
        
        return keys;
    } catch (error) {
        console.error("Browser key generation failed:", error);
        document.getElementById('browser-key-status').textContent = "Failed: " + error.message;
        document.getElementById('browser-key-status').style.color = "red";
        throw error;
    }
}

// Function to test server-side key generation
async function testServerKeyGeneration() {
    try {
        console.log("Testing server-side key generation...");
        const startTime = performance.now();
        
        const response = await fetch('/api/encryption-keys/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const endTime = performance.now();
        console.log(`Server request took ${(endTime - startTime).toFixed(2)}ms`);
        
        if (response.ok) {
            const data = await response.json();
            console.log("Server generated keys successfully");
            console.log("Public key:", data.keys.public_key.substring(0, 40) + "...");
            console.log("Private key:", data.keys.private_key.substring(0, 40) + "...");
            
            document.getElementById('server-key-status').textContent = "Success! Keys generated on server.";
            document.getElementById('server-key-status').style.color = "green";
            
            // Store keys in the output area
            document.getElementById('public-key-output').value = data.keys.public_key;
            document.getElementById('private-key-output').value = data.keys.private_key;
            
            return data.keys;
        } else {
            const errorData = await response.json();
            console.error("Server key generation failed:", errorData);
            document.getElementById('server-key-status').textContent = "Failed: " + errorData.error;
            document.getElementById('server-key-status').style.color = "red";
            throw new Error(errorData.error);
        }
    } catch (error) {
        console.error("Server key generation request failed:", error);
        document.getElementById('server-key-status').textContent = "Failed: " + error.message;
        document.getElementById('server-key-status').style.color = "red";
        throw error;
    }
}

// Function to check if user already has keys
async function checkExistingKeys() {
    try {
        console.log("Checking for existing encryption keys...");
        
        const response = await fetch('/api/encryption-keys/user');
        
        if (response.ok) {
            const data = await response.json();
            console.log("Found existing keys");
            console.log("Public key:", data.public_key.substring(0, 40) + "...");
            console.log("Private key:", data.private_key.substring(0, 40) + "...");
            
            document.getElementById('existing-key-status').textContent = "Found existing keys in database.";
            document.getElementById('existing-key-status').style.color = "green";
            
            // Store keys in the output area
            document.getElementById('public-key-output').value = data.public_key;
            document.getElementById('private-key-output').value = data.private_key;
            
            return data;
        } else if (response.status === 404) {
            console.log("No existing keys found");
            document.getElementById('existing-key-status').textContent = "No existing keys found.";
            document.getElementById('existing-key-status').style.color = "orange";
            return null;
        } else {
            const errorData = await response.json();
            console.error("Error checking existing keys:", errorData);
            document.getElementById('existing-key-status').textContent = "Error: " + errorData.error;
            document.getElementById('existing-key-status').style.color = "red";
            throw new Error(errorData.error);
        }
    } catch (error) {
        console.error("Error checking existing keys:", error);
        document.getElementById('existing-key-status').textContent = "Error: " + error.message;
        document.getElementById('existing-key-status').style.color = "red";
        throw error;
    }
}

// Function to run diagnostics
async function runDiagnostics() {
    try {
        console.log("Running encryption diagnostics...");
        
        const response = await fetch('/api/encryption-keys/debug');
        
        if (response.ok) {
            const data = await response.json();
            console.log("Diagnostics result:", data);
            
            const diagOutput = document.getElementById('diagnostics-output');
            diagOutput.value = JSON.stringify(data, null, 2);
            
            document.getElementById('diagnostics-status').textContent = "Diagnostics completed successfully.";
            document.getElementById('diagnostics-status').style.color = "green";
            
            return data;
        } else {
            const errorData = await response.json();
            console.error("Diagnostics failed:", errorData);
            document.getElementById('diagnostics-status').textContent = "Failed: " + errorData.error;
            document.getElementById('diagnostics-status').style.color = "red";
            throw new Error(errorData.error);
        }
    } catch (error) {
        console.error("Error running diagnostics:", error);
        document.getElementById('diagnostics-status').textContent = "Error: " + error.message;
        document.getElementById('diagnostics-status').style.color = "red";
        throw error;
    }
}

// Add event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add event listeners to buttons
    document.getElementById('check-existing-keys').addEventListener('click', checkExistingKeys);
    document.getElementById('generate-browser-keys').addEventListener('click', testBrowserKeyGeneration);
    document.getElementById('generate-server-keys').addEventListener('click', testServerKeyGeneration);
    document.getElementById('run-diagnostics').addEventListener('click', runDiagnostics);
    
    // Run diagnostics automatically
    runDiagnostics().catch(console.error);
});
