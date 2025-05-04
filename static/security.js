/**
 * Security utilities for client-side protection
 */

// Content Security Policy setup
function setupCSP() {
    // Check if CSP is already set
    if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
        return;
    }
    
    const cspMeta = document.createElement('meta');
    cspMeta.httpEquiv = 'Content-Security-Policy';
    cspMeta.content = "default-src 'self'; script-src 'self' https://code.jquery.com https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self';";
    document.head.appendChild(cspMeta);
}

// Anti-clickjacking protection
function preventClickjacking() {
    if (window.self !== window.top) {
        // The page is being loaded in an iframe
        window.top.location = window.self.location;
    }
    
    const xFrameOptions = document.createElement('meta');
    xFrameOptions.httpEquiv = 'X-Frame-Options';
    xFrameOptions.content = 'DENY';
    document.head.appendChild(xFrameOptions);
}

// Secure cookies
function setSecureCookieAttributes() {
    // This is a client-side reminder - server-side implementation is still required
    document.cookie = "SameSite=Strict; Secure";
}

// Detect suspicious activity
function setupActivityMonitoring() {
    let rapidActionCount = 0;
    const THRESHOLD = 15;
    const RESET_INTERVAL = 5000; // 5 seconds
    
    function checkSuspiciousActivity(event) {
        rapidActionCount++;
        
        if (rapidActionCount > THRESHOLD) {
            console.warn('Suspicious activity detected');
            // Log the event or take other appropriate actions
            
            // Consider notifying the server about suspicious activity
            fetch('/api/security/report-suspicious-activity', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
                body: JSON.stringify({
                    type: 'rapid-actions',
                    count: rapidActionCount,
                    url: window.location.href
                }),
                credentials: 'same-origin'
            }).catch(err => console.error('Failed to report suspicious activity:', err));
            
            // Reset counter after reporting
            rapidActionCount = 0;
        }
    }
    
    // Reset counter periodically
    setInterval(() => {
        rapidActionCount = 0;
    }, RESET_INTERVAL);
    
    // Add listeners to various events
    ['click', 'keydown', 'mousemove'].forEach(eventType => {
        document.addEventListener(eventType, checkSuspiciousActivity, { passive: true });
    });
}

// Register security features
document.addEventListener('DOMContentLoaded', function() {
    setupCSP();
    preventClickjacking();
    setSecureCookieAttributes();
    setupActivityMonitoring();
    
    // Load DOMPurify for XSS protection if not already present
    if (typeof DOMPurify === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/dompurify/2.4.0/purify.min.js';
        script.integrity = 'sha512-/hVP0SB8xVb+wJrUsr/oVVYUcJyrwwuTbCY2XuQQj3kzgaZuIywNfS8eNMQXJILUKoFzUH6Qqb0c1qKrI7HRvQ==';
        script.crossOrigin = 'anonymous';
        script.referrerPolicy = 'no-referrer';
        document.head.appendChild(script);
    }
});

// Function to validate common input types
const Validator = {
    email: function(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(String(email).toLowerCase());
    },
    
    password: function(password) {
        // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character
        const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        return re.test(password);
    },
    
    username: function(username) {
        // 3-20 alphanumeric characters and underscores
        const re = /^[a-zA-Z0-9_]{3,20}$/;
        return re.test(username);
    },
    
    phone: function(phone) {
        // Simple international phone validation
        const re = /^\+?[0-9]{10,15}$/;
        return re.test(phone);
    },
    
    date: function(date) {
        return !isNaN(new Date(date).getTime());
    },
    
    cleanInput: function(input) {
        // Basic input sanitization
        if (typeof input !== 'string') return '';
        return input.replace(/[<>&"']/g, function(m) {
            return {
                '<': '&lt;',
                '>': '&gt;',
                '&': '&amp;',
                '"': '&quot;',
                "'": '&#39;'
            }[m];
        });
    }
};

// Export for use in other scripts
window.SecurityUtils = {
    setupCSP,
    preventClickjacking,
    setSecureCookieAttributes,
    setupActivityMonitoring,
    Validator
};
