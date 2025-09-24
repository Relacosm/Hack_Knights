from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore, storage
from openai import OpenAI
import json
import uuid
import os
from datetime import datetime
from werkzeug.utils import secure_filename
import tempfile
import re
import pytesseract
from PIL import Image
import fitz  # PyMuPDF
import docx
import io

app = Flask(__name__)
CORS(app)

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# Initialize Firebase
cred = credentials.Certificate('service-account-key.json')
firebase_admin.initialize_app(cred, {
    'storageBucket': 'odrproject-fc1af.appspot.com'
})

db = firestore.client()
bucket = storage.bucket()

# Initialize OpenAI client for Hugging Face
client = OpenAI(
    base_url="https://router.huggingface.co/v1",
    api_key=os.environ.get("HF_TOKEN", "")  # Fallback to hardcoded token
)

ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def upload_file_to_storage(file, folder='evidence'):
    """Upload file to Firebase Storage and return download URL"""
    try:
        filename = secure_filename(file.filename)
        unique_filename = f"{folder}/{uuid.uuid4()}_{filename}"
        
        # Create a temporary file
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            file.save(temp_file.name)
            
            # Upload to Firebase Storage
            blob = bucket.blob(unique_filename)
            blob.upload_from_filename(temp_file.name)
            blob.make_public()
            
            # Clean up temp file
            os.unlink(temp_file.name)
            
            return blob.public_url
    except Exception as e:
        print(f"Error uploading file: {e}")
        return None

def query_llama(prompt, max_length=500):
    """Query Llama 3.1 model via Hugging Face OpenAI-compatible API"""
    try:
        completion = client.chat.completions.create(
            model="meta-llama/Llama-3.1-8B-Instruct",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            max_tokens=max_length,
            temperature=0.7,
            top_p=0.95
        )
        
        return completion.choices[0].message.content.strip()
        
    except Exception as e:
        print(f"Error querying Llama model: {e}")
        return "I apologize, but there was an error processing your request."

# server.py

def analyze_dispute_with_ai(dispute_data):
    """Generate AI analysis and settlement suggestions for a dispute"""
    
    # --- NEW CODE BLOCK ---
    # First, process the list of evidence texts into a single string for the prompt.
    evidence_summary = "No evidence text provided."
    if dispute_data.get('evidence_texts'):
        # Join all the extracted text snippets into one block
        evidence_summary = "\n\n".join(dispute_data['evidence_texts'])
    # --- END OF NEW CODE BLOCK ---

    # Get the detailed analysis
    analysis_prompt = f"""
    As an experienced legal mediator, analyze this dispute professionally and concisely:

    DISPUTE DETAILS:
    - Title: {dispute_data.get('title', 'N/A')}
    - Category: {dispute_data.get('category', 'N/A')}
    - Amount: ${dispute_data.get('amount', 'N/A')}
    - Parties: {dispute_data.get('parties', {}).get('plaintiff', 'N/A')} vs {dispute_data.get('parties', {}).get('defendant', 'N/A')}
    - Description: {dispute_data.get('description', 'N/A')}
    - Evidence Text: {evidence_summary}  # <-- THIS LINE IS NEW

    Provide a structured analysis with these sections:

    LEGAL OVERVIEW:
    [Brief legal context and applicable laws/principles based on the description AND evidence]

    KEY ISSUES:
    [Main points of contention based on the description AND evidence]

    PLAINTIFF POSITION:
    [Strengths and weaknesses of plaintiff's case based on the description AND evidence]

    DEFENDANT POSITION:
    [Strengths and weaknesses of defendant's case based on the description AND evidence]

    RECOMMENDATION:
    [Overall assessment and recommended approach based on all information]

    Keep each section to 2-3 sentences maximum. Be objective and professional.
    """
    
    analysis = query_llama(analysis_prompt, max_length=600)
    
    # Generate specific settlement suggestions
    suggestions_prompt = f"""
    Based on this {dispute_data.get('category', 'general')} dispute involving ${dispute_data.get('amount', 'unknown amount')}:

    Dispute: {dispute_data.get('description', 'N/A')}
    Parties: {dispute_data.get('parties', {}).get('plaintiff', 'Party A')} vs {dispute_data.get('parties', {}).get('defendant', 'Party B')}
    Evidence Provided: {evidence_summary} # <-- THIS LINE IS NEW

    Your task is to generate 3-4 highly detailed and practical settlement suggestions. These must be specific, actionable, and fair.

    For each suggestion, provide a clear title and a detailed paragraph explaining:
    1. The core terms of the settlement (e.g., payment amounts, actions to be taken).
    2. The step-by-step process for implementation.
    3. The benefits for both the plaintiff and the defendant.

    Format each suggestion exactly like this:
    **Suggestion Title**: Detailed explanation paragraph...

    Avoid generic advice. Tailor your suggestions directly to the dispute details and evidence provided.
    """
    
    suggestions_text = query_llama(suggestions_prompt, max_length=500)
    
    # Parse suggestions into a clean list
    suggestions = []
    lines = suggestions_text.split('\n')
    
    for line in lines:
        line = line.strip()
        if re.match(r'^\d+\.', line) or line.startswith('-') or line.startswith('•') or line.startswith('**'):
            suggestion = re.sub(r'^\d+\.\s*', '', line)
            suggestion = re.sub(r'^[-•]\s*', '', suggestion)
            if suggestion and len(suggestion) > 10:
                suggestions.append(suggestion.strip())
    
    if len(suggestions) < 2:
        category = dispute_data.get('category', 'general')
        amount = dispute_data.get('amount', 0)
        suggestions = [
            f"Mediated Settlement: Both parties engage in formal mediation to reach a mutually acceptable resolution",
            f"Partial Payment: Structured payment plan for {float(amount) * 0.7 if amount else 'the disputed amount'}",
            f"Alternative Resolution: Non-monetary compensation or service-based settlement",
            f"Legal Documentation: Create formal agreement outlining resolution terms and future obligations"
        ]
    
    return analysis, suggestions

def chat_with_ai_mediator(message, dispute_context):
    """Handle chat messages with AI mediator"""
    prompt = f"""
    You are an AI legal mediator. Respond professionally to this question about the dispute:

    DISPUTE CONTEXT:
    - Case: {dispute_context.get('title', 'N/A')}
    - Type: {dispute_context.get('category', 'N/A')} 
    - Parties: {dispute_context.get('parties', {}).get('plaintiff', 'N/A')} vs {dispute_context.get('parties', {}).get('defendant', 'N/A')}

    USER QUESTION: {message}

    Provide a helpful, neutral response focusing on:
    - Practical legal guidance
    - Fair resolution strategies  
    - Clear explanations
    - Next steps

    Keep response under 150 words and professional.
    """
    
    return query_llama(prompt, max_length=200)

@app.route('/api/disputes', methods=['GET'])
def get_disputes():
    """Get all disputes"""
    try:
        disputes = []
        docs = db.collection('disputes').order_by('created_at', direction=firestore.Query.DESCENDING).stream()
        
        for doc in docs:
            dispute_data = doc.to_dict()
            dispute_data['id'] = doc.id
            disputes.append(dispute_data)
        
        return jsonify(disputes), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def extract_text_from_file(file):
    """Extract text from various file types (images, pdf, docx, txt)."""
    filename = file.filename.lower()
    text = ""
    
    try:
        # Handle images
        if filename.endswith(('.png', '.jpg', '.jpeg')):
            image = Image.open(file)
            text = pytesseract.image_to_string(image)
        
        # Handle PDFs
        elif filename.endswith('.pdf'):
            # Read file into memory
            pdf_bytes = file.read()
            pdf_document = fitz.open(stream=pdf_bytes, filetype="pdf")
            for page_num in range(len(pdf_document)):
                page = pdf_document.load_page(page_num)
                # Convert page to an image (pixmap)
                pix = page.get_pixmap()
                # Convert pixmap to a PIL Image
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                # OCR the image
                text += pytesseract.image_to_string(img) + "\n\n"
        
        # Handle DOCX files
        elif filename.endswith('.docx'):
            doc = docx.Document(file)
            for para in doc.paragraphs:
                text += para.text + '\n'
        
        # Handle plain text files
        elif filename.endswith('.txt'):
            text = file.read().decode('utf-8')

        return f"--- Evidence from {file.filename} ---\n{text}"
    
    except Exception as e:
        print(f"Error extracting text from {file.filename}: {e}")
        return f"--- Could not extract text from {file.filename} ---"

@app.route('/api/disputes', methods=['POST'])
def create_dispute():
    """Create a new dispute"""
    try:
        title = request.form.get('title')
        description = request.form.get('description')
        category = request.form.get('category')
        amount = request.form.get('amount')
        parties = json.loads(request.form.get('parties', '{}'))
        
        if not all([title, description, category, parties.get('plaintiff'), parties.get('defendant')]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # --- THIS IS THE MODIFIED PART ---
        # Instead of uploading and getting URLs, we extract text
        evidence_texts = []
        for key in request.files:
            if key.startswith('evidence_'):
                file = request.files[key]
                if file and allowed_file(file.filename):
                    extracted_text = extract_text_from_file(file)
                    if extracted_text:
                        evidence_texts.append(extracted_text)
        
        # Create dispute document with the extracted text
        dispute_data = {
            'title': title,
            'description': description,
            'category': category,
            'amount': float(amount) if amount else None,
            'parties': parties,
            # Store the list of extracted texts instead of URLs
            'evidence_texts': evidence_texts,
            'status': 'submitted',
            'created_at': datetime.now(),
            'updated_at': datetime.now()
        }
        
        # Save to Firestore (this part remains the same)
        doc_ref = db.collection('disputes').add(dispute_data)
        dispute_id = doc_ref[1].id
        
        dispute_data['id'] = dispute_id
        return jsonify(dispute_data), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/disputes/<dispute_id>', methods=['GET'])
def get_dispute(dispute_id):
    """Get a specific dispute"""
    try:
        doc = db.collection('disputes').document(dispute_id).get()
        
        if not doc.exists:
            return jsonify({'error': 'Dispute not found'}), 404
        
        dispute_data = doc.to_dict()
        dispute_data['id'] = doc.id
        
        return jsonify(dispute_data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/disputes/<dispute_id>/mediate', methods=['POST'])
def request_mediation(dispute_id):
    """Request AI mediation for a dispute"""
    try:
        # Get dispute data
        doc = db.collection('disputes').document(dispute_id).get()
        
        if not doc.exists:
            return jsonify({'error': 'Dispute not found'}), 404
        
        dispute_data = doc.to_dict()
        
        # Generate AI analysis and suggestions
        analysis, suggestions = analyze_dispute_with_ai(dispute_data)
        
        # Update dispute with AI analysis
        update_data = {
            'ai_analysis': analysis,
            'settlement_suggestions': suggestions,
            'status': 'mediated',
            'updated_at': datetime.now()
        }
        
        db.collection('disputes').document(dispute_id).update(update_data)
        
        return jsonify({
            'analysis': analysis,
            'settlement_suggestions': suggestions  # Make sure this matches frontend expectation
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/disputes/<dispute_id>/chat', methods=['POST'])
def chat_with_mediator(dispute_id):
    """Chat with AI mediator about a specific dispute"""
    try:
        data = request.get_json()
        message = data.get('message', '')
        
        if not message:
            return jsonify({'error': 'Message is required'}), 400
        
        # Get dispute context
        doc = db.collection('disputes').document(dispute_id).get()
        
        if not doc.exists:
            return jsonify({'error': 'Dispute not found'}), 404
        
        dispute_data = doc.to_dict()
        
        # Generate AI response
        response = chat_with_ai_mediator(message, dispute_data)
        
        # Save chat message to Firestore (optional)
        chat_data = {
            'dispute_id': dispute_id,
            'user_message': message,
            'ai_response': response,
            'timestamp': datetime.now()
        }
        db.collection('chat_messages').add(chat_data)
        
        return jsonify({'response': response}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/disputes/<dispute_id>/status', methods=['PUT'])
def update_dispute_status(dispute_id):
    """Update dispute status"""
    try:
        data = request.get_json()
        new_status = data.get('status')
        
        valid_statuses = ['submitted', 'under_review', 'mediated', 'resolved']
        
        if new_status not in valid_statuses:
            return jsonify({'error': 'Invalid status'}), 400
        
        # Update dispute status
        update_data = {
            'status': new_status,
            'updated_at': datetime.now()
        }
        
        db.collection('disputes').document(dispute_id).update(update_data)
        
        return jsonify({'message': 'Status updated successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/disputes/<dispute_id>/chat/history', methods=['GET'])
def get_chat_history(dispute_id):
    """Get chat history for a dispute"""
    try:
        messages = []
        docs = db.collection('chat_messages').where('dispute_id', '==', dispute_id).order_by('timestamp').stream()
        
        for doc in docs:
            message_data = doc.to_dict()
            messages.append({
                'user_message': message_data.get('user_message'),
                'ai_response': message_data.get('ai_response'),
                'timestamp': message_data.get('timestamp')
            })
        
        return jsonify(messages), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()}), 200

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)