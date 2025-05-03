import os
import time
import re
from datetime import datetime
from fpdf import FPDF
import matplotlib.pyplot as plt
import numpy as np
import requests
import json
from io import BytesIO
import base64

class MedicalReportPDF(FPDF):
    """Custom PDF class for FRT medical reports with header and footer"""
    
    def __init__(self, doctor_name, patient_name):
        super().__init__()
        self.doctor_name = doctor_name
        self.patient_name = patient_name
        self.set_auto_page_break(auto=True, margin=15)
        self.logo_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'images', 'logo.png')
        
    def header(self):
        # Logo
        if os.path.exists(self.logo_path):
            self.image(self.logo_path, 10, 8, 20)
        
        # Title and subtitle
        self.set_font('Arial', 'B', 16)
        self.set_text_color(0, 102, 204)  # Blue color
        self.cell(0, 10, 'FRT Healthcare', 0, 1, 'C')
        
        self.set_font('Arial', 'I', 10)
        self.set_text_color(100, 100, 100)  # Gray color
        self.cell(0, 5, 'Functional Reach Test Assessment Report', 0, 1, 'C')
        
        # Line break
        self.ln(5)
        
    def footer(self):
        # Position at 1.5 cm from bottom
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.set_text_color(128, 128, 128)
        # Page number
        self.cell(0, 10, f'Page {self.page_no()}/{{nb}}', 0, 0, 'C')
        # Date
        self.cell(0, 10, f'Generated on: {datetime.now().strftime("%Y-%m-%d %H:%M")}', 0, 0, 'R')

def format_date(date_value):
    """Safely format a date value to string, handling different date types"""
    try:
        if isinstance(date_value, str):
            # If it's already a string, try to parse it
            try:
                return datetime.strptime(date_value, "%Y-%m-%d %H:%M:%S").strftime("%Y-%m-%d")
            except ValueError:
                # If it doesn't match the expected format, return as is
                return date_value
        elif isinstance(date_value, datetime):
            # If it's a datetime object, format it
            return date_value.strftime("%Y-%m-%d")
        elif hasattr(date_value, 'strftime'):
            # If it has strftime method (like date objects), use it
            return date_value.strftime("%Y-%m-%d")
        else:
            # For other cases, convert to string
            return str(date_value)
    except Exception as e:
        # Fallback for any errors
        print(f"Error formatting date {date_value}: {str(e)}")
        return str(date_value)

def generate_chart(test_dates, distances):
    """Generate a chart showing FRT performance over time"""
    plt.figure(figsize=(10, 5))
    
    # Create the line chart
    plt.plot(test_dates, distances, marker='o', linestyle='-', color='#2196F3', linewidth=2, markersize=8)
    
    # Add horizontal reference lines for risk levels
    plt.axhline(y=25, color='#4CAF50', linestyle='--', alpha=0.7, label='Low Risk (≥25cm)')
    plt.axhline(y=15, color='#FFC107', linestyle='--', alpha=0.7, label='Moderate Risk (15-25cm)')
    plt.axhspan(0, 15, alpha=0.1, color='#F44336', label='High Risk (<15cm)')
    
    # Customize the chart
    plt.title('Functional Reach Test Results Over Time', fontsize=14, fontweight='bold')
    plt.xlabel('Test Date', fontsize=12)
    plt.ylabel('Maximum Reach Distance (cm)', fontsize=12)
    plt.grid(True, linestyle='--', alpha=0.7)
    plt.legend()
    
    # Rotate date labels
    plt.xticks(rotation=45)
    
    # Tight layout
    plt.tight_layout()
    
    # Save to BytesIO
    buf = BytesIO()
    plt.savefig(buf, format='png', dpi=300)
    buf.seek(0)
    plt.close()
    
    return buf

def process_markdown_for_pdf(pdf, text):
    """
    Process markdown text and apply proper formatting directly using FPDF methods.
    """
    if not text:
        return
    
    # Split the text into paragraphs
    paragraphs = text.split('\n\n')
    
    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if not paragraph:
            pdf.ln(4)  # Empty line
            continue
            
        # Check if it's a heading
        heading_match = re.match(r'^(#{1,3})\s+(.+)$', paragraph)
        if heading_match:
            level = len(heading_match.group(1))
            heading_text = heading_match.group(2).strip()
            
            # Set appropriate font size based on heading level
            if level == 1:
                pdf.set_font('Arial', 'B', 14)
            elif level == 2:
                pdf.set_font('Arial', 'B', 12)
            else:
                pdf.set_font('Arial', 'B', 11)
                
            pdf.set_text_color(44, 62, 80)  # Dark blue for headings
            pdf.multi_cell(0, 6, heading_text, 0, 1, 'L')
            pdf.ln(2)
            
            # Reset font
            pdf.set_font('Arial', '', 10)
            pdf.set_text_color(0, 0, 0)
            continue
            
        # Check if it's a bullet point list
        if paragraph.startswith('- ') or paragraph.startswith('* '):
            lines = paragraph.split('\n')
            for line in lines:
                if line.startswith('- ') or line.startswith('* '):
                    bullet_text = line[2:].strip()
                    pdf.set_x(pdf.get_x() + 5)  # Indent
                    pdf.cell(5, 5, '•', 0, 0, 'R')
                    pdf.multi_cell(0, 5, bullet_text, 0, 1)
            continue
            
        # Check if it's a numbered list
        numbered_list = True
        lines = paragraph.split('\n')
        for line in lines:
            if not re.match(r'^\d+\.\s+', line):
                numbered_list = False
                break
                
        if numbered_list:
            for line in lines:
                match = re.match(r'^(\d+)\.\s+(.+)$', line)
                if match:
                    number = match.group(1)
                    item_text = match.group(2).strip()
                    pdf.set_x(pdf.get_x() + 5)  # Indent
                    pdf.cell(8, 5, f"{number}.", 0, 0, 'R')
                    pdf.multi_cell(0, 5, item_text, 0, 1)
            continue
        
        # Process inline formatting (bold and italic)
        # We'll do this by splitting the paragraph into segments
        segments = []
        current_pos = 0
        
        # Process bold text (**text**)
        bold_pattern = re.compile(r'\*\*(.*?)\*\*')
        for match in bold_pattern.finditer(paragraph):
            # Add text before the match
            if match.start() > current_pos:
                segments.append(('regular', paragraph[current_pos:match.start()]))
            
            # Add the bold text
            segments.append(('bold', match.group(1)))
            
            current_pos = match.end()
        
        # Add any remaining text
        if current_pos < len(paragraph):
            segments.append(('regular', paragraph[current_pos:]))
        
        # If no segments with formatting were found, treat as regular paragraph
        if not segments:
            segments = [('regular', paragraph)]
        
        # Print segments with appropriate formatting
        x_position = pdf.get_x()
        line_height = 5
        
        for style, text in segments:
            if style == 'bold':
                pdf.set_font('Arial', 'B', 10)
            else:
                pdf.set_font('Arial', '', 10)
            
            pdf.multi_cell(0, line_height, text, 0, 1)
        
        pdf.ln(2)  # Space after paragraph

# Replace the old parse_markdown function
def parse_markdown(text):
    """
    This function is no longer used directly, but kept for backward compatibility.
    Use process_markdown_for_pdf instead for proper formatting.
    """
    return text

async def get_groq_analysis(patient_data, test_results):
    """Use Groq to generate analytical insights about the patient's FRT results"""
    GROQ_API_KEY = os.environ.get('GROQ_API_KEY')
    if not GROQ_API_KEY:
        return "AI-powered analysis unavailable. Please set GROQ_API_KEY environment variable."
    
    # Format the data for the prompt
    results_text = ""
    for i, result in enumerate(test_results):
        # Sanitize inputs before adding to the prompt
        max_distance = str(result.get('maxDistance', 'N/A')).replace('"', '').replace("'", "")
        risk_level = str(result.get('riskLevel', 'N/A')).replace('"', '').replace("'", "")
        date = format_date(result.get('date', 'N/A'))
        
        results_text += f"Test {i+1} ({date}): Distance: {max_distance}cm, Risk Level: {risk_level}\n"
    
    # Sanitize patient data before using in prompt
    full_name = str(patient_data.get('fullName', 'Not provided')).replace('"', '').replace("'", "")
    age = str(patient_data.get('age', 'Not provided')).replace('"', '').replace("'", "")
    gender = str(patient_data.get('gender', 'Not provided')).replace('"', '').replace("'", "")
    medical_history = str(patient_data.get('medicalHistory', 'Not provided')).replace('"', '').replace("'", "")
    
    # Create the prompt for Groq
    prompt = f"""You are a medical report writing assistant. Please analyze these Functional Reach Test results for a patient:

Patient Information:
Name: {full_name}
Age: {age}
Gender: {gender}
Medical History: {medical_history}

FRT Test Results:
{results_text}

Please provide:
1. A summary of the overall trend in the patient's functional reach test performance
2. Clinical implications of these results (fall risk assessment)
3. Specific recommendations for treatment or further assessment
4. Suggested exercises or interventions appropriate for the patient's level

Keep your analysis professional, concise, and medically appropriate. Format in paragraphs with clear headings.
"""

    # Call Groq API
    try:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GROQ_API_KEY}"
        }
        
        payload = {
            "model": "llama3-8b-8192",  # Using LLama3-8B model (or another suitable Groq model)
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,  # Lower temperature for more focused outputs
            "max_tokens": 2000
        }
        
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", 
                               headers=headers, 
                               json=payload)
        
        if response.status_code == 200:
            result = response.json()
            analysis = result["choices"][0]["message"]["content"]
            return analysis
        else:
            return f"Error generating report analysis: {response.text}"
    
    except Exception as e:
        return f"Failed to generate AI analysis: {str(e)}"

def create_medical_report(doctor_data, patient_data, test_results, analysis_text):
    """Create a beautifully formatted PDF medical report"""
    # Initialize PDF with patient and doctor info
    pdf = MedicalReportPDF(doctor_data.get('fullName', 'Unknown Doctor'), 
                          patient_data.get('fullName', 'Unknown Patient'))
    pdf.add_page()
    pdf.alias_nb_pages()  # For page numbering
    
    # Report Title
    pdf.set_font('Arial', 'B', 16)
    pdf.set_text_color(44, 62, 80)  # Dark blue
    pdf.cell(0, 10, 'Functional Reach Test Report', 0, 1, 'C')
    pdf.ln(5)
    
    # Information boxes
    # Patient Information
    pdf.set_fill_color(240, 248, 255)  # Light blue background
    pdf.set_text_color(0, 0, 0)
    
    # Doctor information box
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 8, 'Healthcare Provider Information', 0, 1, 'L')
    pdf.set_font('Arial', '', 10)
    pdf.multi_cell(0, 6, 
                  f"Doctor: {doctor_data.get('fullName', 'N/A')}\n"
                  f"Specialization: {doctor_data.get('specialization', 'N/A')}\n"
                  f"Clinic: {doctor_data.get('hospital_clinic', 'N/A')}", 1, 'L', True)
    pdf.ln(5)
    
    # Patient information box
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 8, 'Patient Information', 0, 1, 'L')
    pdf.set_font('Arial', '', 10)
    pdf.multi_cell(0, 6, 
                  f"Name: {patient_data.get('fullName', 'N/A')}\n"
                  f"Age: {patient_data.get('age', 'N/A')}\n"
                  f"Gender: {patient_data.get('gender', 'N/A')}\n"
                  f"Medical History: {patient_data.get('medicalHistory', 'N/A')}", 1, 'L', True)
    pdf.ln(5)
    
    # Add assessment summary
    pdf.set_font('Arial', 'B', 14)
    pdf.set_text_color(44, 62, 80)
    pdf.cell(0, 10, 'Assessment Summary', 0, 1, 'L')
    
    # Add summary table
    pdf.set_font('Arial', 'B', 10)
    
    # Table header with blue background
    pdf.set_fill_color(41, 128, 185)  # Blue header
    pdf.set_text_color(255, 255, 255)  # White text
    pdf.cell(50, 8, 'Test Date', 1, 0, 'C', True)
    pdf.cell(50, 8, 'Max Distance (cm)', 1, 0, 'C', True)
    pdf.cell(70, 8, 'Risk Assessment', 1, 1, 'C', True)
    
    # Table content
    pdf.set_font('Arial', '', 10)
    pdf.set_text_color(0, 0, 0)  # Black text
    
    # Alternate row colors for better readability
    row_color = True
    
    # Extract data for chart
    test_dates = []
    distances = []
    
    # Process date strings to datetime objects for sorting
    processed_results = []
    for result in test_results:
        try:
            # Format the date string and convert to datetime for sorting
            test_date_str = format_date(result['date'])
            # Add processed result
            processed_result = result.copy()
            processed_result['formatted_date'] = test_date_str
            processed_results.append(processed_result)
        except Exception as e:
            print(f"Error processing date for result: {str(e)}")
            # Still include the result with original date
            processed_result = result.copy()
            processed_result['formatted_date'] = str(result['date'])
            processed_results.append(processed_result)
    
    # Sort results by date (oldest first)
    sorted_results = sorted(processed_results, key=lambda x: x['formatted_date'])
    
    for result in sorted_results:
        # Add data for chart
        try:
            date_for_chart = datetime.strptime(result['formatted_date'], '%Y-%m-%d')
        except ValueError:
            # If date parsing fails, use current date as fallback
            date_for_chart = datetime.now()
            
        test_dates.append(date_for_chart)
        distances.append(float(result['maxDistance']))
        
        # Get formatted date for display
        formatted_date = result['formatted_date']
        
        # Set alternating row colors
        if row_color:
            pdf.set_fill_color(240, 248, 255)  # Light blue
        else:
            pdf.set_fill_color(255, 255, 255)  # White
        
        # Set risk level color
        risk_level = result['riskLevel']
        risk_text = risk_level
        
        pdf.cell(50, 6, formatted_date, 1, 0, 'C', True)
        pdf.cell(50, 6, f"{result['maxDistance']} cm", 1, 0, 'C', True)
        pdf.cell(70, 6, risk_text, 1, 1, 'C', True)
        
        row_color = not row_color
    
    pdf.ln(5)
    
    # Generate and add chart if we have multiple data points
    if len(test_dates) > 1:
        pdf.set_font('Arial', 'B', 14)
        pdf.set_text_color(44, 62, 80)
        pdf.cell(0, 10, 'Performance Trend', 0, 1, 'L')
        
        chart_data = generate_chart(test_dates, distances)
        chart_image = BytesIO(chart_data.read())
        
        # Add the chart to the PDF
        pdf.image(chart_image, x=15, y=None, w=180)
        pdf.ln(95)  # Make space for the chart
    
    # Add AI analysis if available
    if analysis_text:
        # Start a new page for analysis if we're running low on space
        if pdf.get_y() > 180:
            pdf.add_page()
        
        pdf.set_font('Arial', 'B', 14)
        pdf.set_text_color(44, 62, 80)
        pdf.cell(0, 10, 'Clinical Analysis & Recommendations', 0, 1, 'L')
        
        pdf.set_font('Arial', '', 10)
        pdf.set_text_color(0, 0, 0)
        
        # Process markdown formatting in the analysis text
        process_markdown_for_pdf(pdf, analysis_text)
    
    # Add disclaimer
    pdf.ln(10)
    pdf.set_font('Arial', 'I', 8)
    pdf.set_text_color(128, 128, 128)
    pdf.multi_cell(0, 4, "DISCLAIMER: This report is based on Functional Reach Test results and is meant to support clinical decision-making. It should be interpreted by qualified healthcare professionals in the context of a comprehensive patient assessment.")
    
    # Generate filename with timestamp and patient ID
    timestamp = int(time.time())
    filename = f"frt_report_{patient_data.get('userId', 'unknown')}_{timestamp}.pdf"
    output_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'generated_reports')
    
    # Create directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Save the PDF
    filepath = os.path.join(output_dir, filename)
    pdf.output(filepath)
    
    # Create a descriptive report name
    report_name = f"FRT Assessment Report - {patient_data.get('fullName', 'Patient')} - {datetime.now().strftime('%Y-%m-%d')}"
    
    # Create comma-separated list of test IDs
    included_test_ids = ','.join([str(result['id']) for result in test_results])
    
    return {
        'filename': filename,
        'filepath': filepath,
        'url': f"/api/frt/reports/download/{filename}",
        'reportName': report_name,
        'includedTestIds': included_test_ids
    }
