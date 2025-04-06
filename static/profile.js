document.addEventListener('DOMContentLoaded', function() {
    const profileForm = document.getElementById('profileForm');
    console.log('Profile form found:', profileForm !== null);
    
    if (profileForm) {
        console.log('Attaching submit event listener');
        
        // Test if the endpoint is reachable
        fetch('/api/complete-profile', {
            method: 'OPTIONS',
            headers: { 'Content-Type': 'application/json' }
        }).then(response => {
            console.log('Endpoint test response status:', response.status);
        }).catch(error => {
            console.error('Endpoint test error:', error);
        });
        
        profileForm.addEventListener('submit', function(e) {
            e.preventDefault();
            console.log('Form submitted!');
            
            // Display status message
            const statusMsg = document.getElementById('status-message');
            statusMsg.textContent = "Processing your request...";
            statusMsg.className = "status-message";
            statusMsg.style.display = "block";
            statusMsg.style.backgroundColor = "#f8f9fa";
            statusMsg.style.color = "#333";
            
            const role = document.getElementById('user-role').value;
            console.log('User role:', role);
            
            const formData = {
                phone: document.getElementById('phone').value
            };
            
            // Add role-specific fields
            if (role === 'Patient') {
                formData.dob = document.getElementById('dob').value;
                formData.gender = document.getElementById('gender').value;
                formData.address = document.getElementById('address').value;
                formData.emergency_contact = document.getElementById('emergency-contact').value;
                formData.emergency_phone = document.getElementById('emergency-phone').value;
                formData.medical_history = document.getElementById('medical-history').value;
            } else if (role === 'Doctor') {
                formData.specialization = document.getElementById('specialization').value;
                formData.office_hours = document.getElementById('office-hours').value;
                formData.hospital_clinic = document.getElementById('hospital-clinic').value;
                formData.experience = document.getElementById('experience').value;
                formData.education = document.getElementById('education').value;
                
                console.log('Doctor data:', formData);
            }
            
            // Use standard fetch instead of XMLHttpRequest for simplicity
            document.querySelector('.auth-btn').textContent = 'Saving...';
            document.querySelector('.auth-btn').disabled = true;
            
            console.log('About to send fetch request');
            
            // Use regular fetch - it's simpler and more reliable
            fetch('/api/complete-profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Add CSRF token if your app uses it
                    // 'X-CSRFToken': document.querySelector('input[name="csrf_token"]').value,
                },
                body: JSON.stringify(formData),
                credentials: 'same-origin' // Include cookies for session
            })
            .then(response => {
                console.log('Response status:', response.status);
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
                statusMsg.textContent = "Network error: " + error.message;
                statusMsg.className = "status-message error";
            });
        });
    } else {
        console.error('Profile form not found!');
    }
});

// Function to pre-fill form for edit profile
async function loadProfileData() {
    const editForm = document.getElementById('editProfileForm');
    if (!editForm) return;
    
    try {
        const response = await fetch('/api/profile');
        const data = await response.json();
        
        if (response.ok) {
            // Pre-fill common fields
            document.getElementById('edit-phone').value = data.phone || '';
            
            // Pre-fill role-specific fields
            if (data.role === 'Patient') {
                document.getElementById('edit-dob').value = data.dob || '';
                document.getElementById('edit-gender').value = data.gender || '';
                document.getElementById('edit-address').value = data.address || '';
                document.getElementById('edit-emergency-contact').value = data.emergency_contact || '';
                document.getElementById('edit-emergency-phone').value = data.emergency_phone || '';
                document.getElementById('edit-medical-history').value = data.medical_history || '';
            } else if (data.role === 'Doctor') {
                document.getElementById('edit-specialization').value = data.specialization || '';
                document.getElementById('edit-office-hours').value = data.office_hours || '';
                document.getElementById('edit-hospital-clinic').value = data.hospital_clinic || '';
                document.getElementById('edit-experience').value = data.experience || '';
                document.getElementById('edit-education').value = data.education || '';
            }
        } else {
            alert('Failed to load profile data');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred while loading your profile. Please try again.');
    }
}
