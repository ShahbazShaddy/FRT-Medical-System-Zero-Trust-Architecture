// Handle login form submission
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            email: document.getElementById('email').value,
            password: document.getElementById('password').value
        };

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });
            const data = await response.json();
            
            if (response.ok) {
                const userData = data.user;
                
                // Check if profile is completed
                if (!userData.profileCompleted) {
                    window.location.href = '/complete-profile';
                } else {
                    // Redirect to appropriate dashboard
                    if (userData.role === 'Patient') {
                        window.location.href = '/patient-dashboard';
                    } else if (userData.role === 'Doctor') {
                        window.location.href = '/doctor-dashboard';
                    } else {
                        window.location.href = '/login';
                        alert('Unknown user role');
                    }
                }
            } else {
                alert(data.error);
            }
        } catch (error) {
            alert('An error occurred. Please try again.');
        }
    });
}

// Handle signup form and dynamic elements
const signupForm = document.getElementById('signupForm');
if (signupForm) {
    // Role toggle functionality
    const roleRadios = document.querySelectorAll('input[name="role"]');
    const patientFields = document.getElementById('patient-fields');
    const doctorFields = document.getElementById('doctor-fields');
    
    roleRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'Patient') {
                patientFields.style.display = 'block';
                doctorFields.style.display = 'none';
                document.getElementById('signup-button').textContent = 'Continue';
            } else {
                patientFields.style.display = 'none';
                doctorFields.style.display = 'block';
                document.getElementById('signup-button').textContent = 'Continue';
            }
        });
    });
    
    // Doctor association checkbox
    const hasDoctorCheckbox = document.getElementById('has-doctor');
    const doctorIdGroup = document.getElementById('doctor-id-group');
    
    if (hasDoctorCheckbox) {
        hasDoctorCheckbox.addEventListener('change', function() {
            doctorIdGroup.style.display = this.checked ? 'block' : 'none';
        });
    }
    
    // PMDC verification
    const verifyPmdcButton = document.getElementById('verify-pmdc');
    const pmdcField = document.getElementById('pmdc-no');
    const pmdcStatus = document.getElementById('pmdc-verification-status');
    let isPmdcVerified = false;
    
    if (verifyPmdcButton) {
        verifyPmdcButton.addEventListener('click', function() {
            const pmdcNo = pmdcField.value.trim();
            
            if (!pmdcNo) {
                pmdcStatus.textContent = 'Please enter a PMDC Registration Number';
                pmdcStatus.className = 'not-verified';
                return;
            }
            
            // For now, simulate verification (all numbers are considered valid)
            isPmdcVerified = true;
            pmdcStatus.textContent = 'Verified successfully';
            pmdcStatus.className = 'verified';
            
            // In a real application, you would call an API endpoint
            // fetch('/auth/verify-pmdc', {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify({ pmdc_no: pmdcNo })
            // }).then(...)
        });
    }
    
    // Email verification flow
    let isEmailVerified = false;
    let isOtpSent = false;
    
    signupForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const role = document.querySelector('input[name="role"]:checked').value;
        
        // If doctor, check PMDC verification
        if (role === 'Doctor' && !isPmdcVerified) {
            alert('Please verify your PMDC Registration Number first.');
            return;
        }
        
        // If email not yet verified and OTP not sent
        if (!isEmailVerified && !isOtpSent) {
            try {
                const response = await fetch('/auth/send-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    // Show OTP verification fields
                    document.getElementById('email-verification').style.display = 'block';
                    document.getElementById('signup-button').style.display = 'none';
                    isOtpSent = true;
                } else {
                    alert(data.error);
                }
            } catch (error) {
                alert('An error occurred. Please try again.');
            }
            return;
        }
        
        // If OTP is verified, proceed with signup
        if (isEmailVerified) {
            const formData = {
                full_name: document.getElementById('full_name').value,
                email: document.getElementById('email').value,
                password: document.getElementById('password').value,
                role: role
            };
            
            // Add role-specific fields
            if (role === 'Patient') {
                const hasDoctor = document.getElementById('has-doctor').checked;
                formData.has_doctor = hasDoctor;
                
                if (hasDoctor) {
                    formData.doctor_id = document.getElementById('doctor-id').value;
                }
            } else {
                formData.pmdc_no = document.getElementById('pmdc-no').value;
            }
            
            try {
                statusMsg = document.createElement('div');
                statusMsg.textContent = "Creating your account...";
                statusMsg.className = "status-message";
                statusMsg.style.display = "block";
                statusMsg.style.backgroundColor = "#f8f9fa";
                statusMsg.style.color = "#333";
                document.getElementById('email-verification').appendChild(statusMsg);
                
                console.log('Sending signup request with data:', JSON.stringify(formData));
                
                const response = await fetch('/auth/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                
                console.log('Response status:', response.status);
                const data = await response.json();
                console.log('Response data:', data);
                
                if (response.ok) {
                    statusMsg.textContent = "Account created successfully! Redirecting to login...";
                    statusMsg.className = "status-message success";
                    setTimeout(() => {
                        window.location.href = '/login';
                    }, 1500);
                } else {
                    console.error('Signup error:', data.error);
                    statusMsg.textContent = data.error || "An error occurred. Please try again.";
                    statusMsg.className = "status-message error";
                }
            } catch (error) {
                console.error('Fetch error:', error);
                if (statusMsg) {
                    statusMsg.textContent = "Network error: " + error.message;
                    statusMsg.className = "status-message error";
                } else {
                    alert('A network error occurred. Please try again.');
                }
            }
        }
    });
    
    // OTP verification
    const verifyOtpButton = document.getElementById('verify-otp');
    if (verifyOtpButton) {
        verifyOtpButton.addEventListener('click', async function() {
            const otp = document.getElementById('otp').value.trim();
            const email = document.getElementById('email').value;
            
            if (!otp) {
                alert('Please enter the verification code');
                return;
            }
            
            try {
                const response = await fetch('/auth/verify-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email, otp: otp })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    isEmailVerified = true;
                    document.getElementById('email-verification').innerHTML = '<p class="verified">Email verified successfully!</p>';
                    document.getElementById('signup-button').style.display = 'block';
                    document.getElementById('signup-button').textContent = 'Sign Up';
                } else {
                    alert(data.error);
                }
            } catch (error) {
                alert('An error occurred. Please try again.');
            }
        });
    }
    
    // Resend OTP
    const resendOtpButton = document.getElementById('resend-otp');
    if (resendOtpButton) {
        resendOtpButton.addEventListener('click', async function() {
            const email = document.getElementById('email').value;
            
            try {
                const response = await fetch('/auth/send-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    alert('Verification code resent to your email');
                } else {
                    alert(data.error);
                }
            } catch (error) {
                alert('An error occurred. Please try again.');
            }
        });
    }
}
