document.addEventListener('DOMContentLoaded', function() {
    const profileForm = document.getElementById('profileForm');
    console.log('Profile form found:', profileForm !== null);
    
    // Get CSRF token - assuming it's in a meta tag
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    
    if (profileForm) {
        console.log('Attaching submit event listener');
        
        // Test if the endpoint is reachable with CSRF token
        fetch('/api/complete-profile', {
            method: 'OPTIONS',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken || '',
                'X-Requested-With': 'XMLHttpRequest'
            }
        }).then(response => {
            console.log('Endpoint test response status:', response.status);
        }).catch(error => {
            console.error('Endpoint test error:', error);
        });
        
        // Add input validation to form fields
        const validatePhone = (phone) => {
            const phoneRegex = /^\+?[0-9]{10,15}$/;
            return phoneRegex.test(phone);
        };
        
        const validateDate = (date) => {
            return !isNaN(new Date(date).getTime());
        };
        
        // Function to sanitize input to prevent XSS
        const sanitizeInput = (input) => {
            return input.replace(/[<>&"']/g, (match) => {
                return {
                    '<': '&lt;',
                    '>': '&gt;',
                    '&': '&amp;',
                    '"': '&quot;',
                    "'": '&#39;'
                }[match];
            });
        };
        
        // Function to validate all inputs based on role
        const validateInputs = (formData, role) => {
            let errors = [];
            
            if (!validatePhone(formData.phone)) {
                errors.push("Invalid phone number format");
            }
            
            if (role === 'Patient') {
                if (!validateDate(formData.dob)) {
                    errors.push("Invalid date of birth");
                }
                
                if (!formData.emergency_contact || formData.emergency_contact.length < 2) {
                    errors.push("Emergency contact name is required");
                }
                
                if (!validatePhone(formData.emergency_phone)) {
                    errors.push("Invalid emergency contact phone number");
                }
            } else if (role === 'Doctor') {
                if (!formData.specialization || formData.specialization.length < 2) {
                    errors.push("Specialization is required");
                }
                
                if (!formData.education || formData.education.length < 2) {
                    errors.push("Education information is required");
                }
            }
            
            return errors;
        };
        
        profileForm.addEventListener('submit', function(e) {
            e.preventDefault();
            console.log('Form submitted!');
            
            // Display status message
            const statusMsg = document.getElementById('status-message');
            statusMsg.textContent = "Validating your information...";
            statusMsg.className = "status-message";
            statusMsg.style.display = "block";
            statusMsg.style.backgroundColor = "#f8f9fa";
            statusMsg.style.color = "#333";
            
            const role = document.getElementById('user-role').value;
            console.log('User role:', role);
            
            // Collect and sanitize form data
            const formData = {
                phone: sanitizeInput(document.getElementById('phone').value)
            };
            
            // Add role-specific fields
            if (role === 'Patient') {
                formData.dob = sanitizeInput(document.getElementById('dob').value);
                formData.gender = sanitizeInput(document.getElementById('gender').value);
                formData.address = sanitizeInput(document.getElementById('address').value);
                formData.emergency_contact = sanitizeInput(document.getElementById('emergency-contact').value);
                formData.emergency_phone = sanitizeInput(document.getElementById('emergency-phone').value);
                formData.medical_history = sanitizeInput(document.getElementById('medical-history').value);
            } else if (role === 'Doctor') {
                formData.specialization = sanitizeInput(document.getElementById('specialization').value);
                formData.office_hours = sanitizeInput(document.getElementById('office-hours').value);
                formData.hospital_clinic = sanitizeInput(document.getElementById('hospital-clinic').value);
                formData.experience = sanitizeInput(document.getElementById('experience').value);
                formData.education = sanitizeInput(document.getElementById('education').value);
                
                console.log('Doctor data:', formData);
            }
            
            // Validate inputs
            const validationErrors = validateInputs(formData, role);
            if (validationErrors.length > 0) {
                statusMsg.textContent = "Please correct the following errors: " + validationErrors.join(", ");
                statusMsg.className = "status-message error";
                return;
            }
            
            // Use standard fetch instead of XMLHttpRequest for simplicity
            document.querySelector('.auth-btn').textContent = 'Saving...';
            document.querySelector('.auth-btn').disabled = true;
            
            console.log('About to send fetch request');
            
            // Anti-brute force measure - add a small delay
            setTimeout(() => {
                // Add security headers and CSRF token
                fetch('/api/complete-profile', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken || '',
                        'X-Requested-With': 'XMLHttpRequest',
                        'Cache-Control': 'no-cache, no-store, must-revalidate'
                    },
                    body: JSON.stringify(formData),
                    credentials: 'same-origin' // Include cookies for session
                })
                .then(response => {
                    console.log('Response status:', response.status);
                    if (!response.ok && response.status === 403) {
                        throw new Error('Session expired. Please login again.');
                    }
                    return response.json().then(data => {
                        return { status: response.status, data: data };
                    });
                })
                .then(result => {
                    console.log('Response data:', result.data);
                    
                    if (result.status >= 200 && result.status < 300) {
                        // Success!
                        statusMsg.textContent = "Profile completed successfully! Redirecting...";
                        statusMsg.className = "status-message success";
                        
                        console.log('Success! Redirecting to dashboard...');
                        
                        // Redirect to the appropriate dashboard
                        setTimeout(() => {
                            const redirectUrl = role === 'Patient' ? '/patient-dashboard' : '/doctor-dashboard';
                            console.log('Redirecting to:', redirectUrl);
                            window.location.href = redirectUrl;
                        }, 1000);
                    } else {
                        // Error
                        document.querySelector('.auth-btn').textContent = 'Complete Profile';
                        document.querySelector('.auth-btn').disabled = false;
                        
                        const errorMsg = result.data.error || 'An error occurred while saving your profile';
                        statusMsg.textContent = errorMsg;
                        statusMsg.className = "status-message error";
                        console.error('Error saving profile:', errorMsg);
                    }
                })
                .catch(error => {
                    console.error('Fetch error:', error);
                    document.querySelector('.auth-btn').textContent = 'Complete Profile';
                    document.querySelector('.auth-btn').disabled = false;
                    
                    // Generic error message for security (don't expose details)
                    const errorMessage = error.message === 'Session expired. Please login again.' ? 
                        error.message : "An error occurred. Please try again.";
                    
                    statusMsg.textContent = errorMessage;
                    statusMsg.className = "status-message error";
                    
                    if (error.message === 'Session expired. Please login again.') {
                        setTimeout(() => {
                            window.location.href = '/login';
                        }, 2000);
                    }
                });
            }, 500); // Small delay to prevent rapid submissions
        });
    } else {
        console.error('Profile form not found!');
    }
    
    // Session timeout detection
    let sessionTimeout;
    const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
    
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
});

// Function to pre-fill form for edit profile
async function loadProfileData() {
    const editForm = document.getElementById('editProfileForm');
    if (!editForm) return;
    
    // Get CSRF token
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    
    try {
        const response = await fetch('/api/profile', {
            headers: {
                'X-CSRF-Token': csrfToken || '',
                'X-Requested-With': 'XMLHttpRequest',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            },
            credentials: 'same-origin'
        });
        
        if (response.status === 403) {
            alert('Your session has expired. Please login again.');
            window.location.href = '/login';
            return;
        }
        
        const data = await response.json();
        
        if (response.ok) {
            // Sanitizing function to prevent XSS
            const sanitizeOutput = (value) => {
                if (!value) return '';
                return String(value)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            };
            
            // Pre-fill common fields with sanitized data
            document.getElementById('edit-phone').value = sanitizeOutput(data.phone || '');
            
            // Pre-fill role-specific fields
            if (data.role === 'Patient') {
                document.getElementById('edit-dob').value = sanitizeOutput(data.dob || '');
                document.getElementById('edit-gender').value = sanitizeOutput(data.gender || '');
                document.getElementById('edit-address').value = sanitizeOutput(data.address || '');
                document.getElementById('edit-emergency-contact').value = sanitizeOutput(data.emergency_contact || '');
                document.getElementById('edit-emergency-phone').value = sanitizeOutput(data.emergency_phone || '');
                document.getElementById('edit-medical-history').value = sanitizeOutput(data.medical_history || '');
            } else if (data.role === 'Doctor') {
                document.getElementById('edit-specialization').value = sanitizeOutput(data.specialization || '');
                document.getElementById('edit-office-hours').value = sanitizeOutput(data.office_hours || '');
                document.getElementById('edit-hospital-clinic').value = sanitizeOutput(data.hospital_clinic || '');
                document.getElementById('edit-experience').value = sanitizeOutput(data.experience || '');
                document.getElementById('edit-education').value = sanitizeOutput(data.education || '');
            }
        } else {
            console.error('Failed to load profile data:', data.error || 'Unknown error');
            alert('Failed to load profile data. Please try again.');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred while loading your profile. Please try again.');
    }
}
