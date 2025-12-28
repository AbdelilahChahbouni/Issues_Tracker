"""
Flask REST API Server for Issue Tracker
Provides endpoints for authentication, issue management, and analytics
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from functools import wraps
import jwt
from datetime import datetime, timedelta
from sqlalchemy import func, case
from config import config
from models import db, User, Issue, Note, Machine, init_db
import qrcode
import io
import os
from flask import send_file

# Initialize Flask app
app = Flask(__name__, static_folder='static', static_url_path='')
app.config.from_object(config['development'])

# Initialize extensions
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Initialize database
init_db(app)


# ============================================================================
# AUTHENTICATION MIDDLEWARE
# ============================================================================

def token_required(f):
    """Decorator to protect routes with JWT authentication"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Get token from header
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(' ')[1]  # Bearer <token>
            except IndexError:
                return jsonify({'error': 'Invalid token format'}), 401
        
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
        
        try:
            # Decode token
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            current_user = User.query.filter_by(user_id=data['user_id']).first()
            
            if not current_user or not current_user.is_active:
                return jsonify({'error': 'Invalid user'}), 401
                
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated


def role_required(*roles):
    """Decorator to restrict access to specific roles or services"""
    def decorator(f):
        @wraps(f)
        def decorated(current_user, *args, **kwargs):
            # Check if user's role OR service is in the allowed list
            if current_user.role not in roles and current_user.service not in roles:
                return jsonify({'error': 'Insufficient permissions'}), 403
            return f(current_user, *args, **kwargs)
        return decorated
    return decorator


# ============================================================================
# AUTHENTICATION ENDPOINTS
# ============================================================================

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Login endpoint - returns JWT token"""
    data = request.get_json()
    
    if not data or not data.get('matricule_number') or not data.get('password'):
        return jsonify({'error': 'Missing matricule_number or password'}), 400
    
    user = User.query.filter_by(matricule_number=data['matricule_number']).first()
    
    if not user or not user.check_password(data['password']):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    if not user.is_active:
        return jsonify({'error': 'Account is inactive'}), 401
    
    # Generate JWT token
    token = jwt.encode({
        'user_id': user.user_id,
        'role': user.role,
        'exp': datetime.utcnow() + app.config['JWT_ACCESS_TOKEN_EXPIRES']
    }, app.config['SECRET_KEY'], algorithm='HS256')
    
    return jsonify({
        'token': token,
        'user': user.to_dict(include_email=True)
    }), 200


@app.route('/api/auth/register', methods=['POST'])
def register():
    """Register new user (Public)"""
    data = request.get_json()
    
    required_fields = ['matricule_number', 'name', 'password', 'service', 'role']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400
    
    # Auto-generate user_id if not provided
    if not data.get('user_id'):
        data['user_id'] = data['matricule_number']
    
    # Check if user already exists
    if User.query.filter_by(user_id=data['user_id']).first():
        return jsonify({'error': 'User ID already exists'}), 409
        
    if User.query.filter_by(matricule_number=data['matricule_number']).first():
        return jsonify({'error': 'Matricule number already exists'}), 409
    
    if data.get('email') and User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already exists'}), 409
    
    # Validate service
    valid_services = ['maintenance', 'production']
    if data['service'] not in valid_services:
        return jsonify({'error': f'Invalid service. Must be one of: {", ".join(valid_services)}'}), 400

    # Validate role
    valid_roles = ['technician', 'team_leader', 'supervisor', 'manager']
    if data['role'] not in valid_roles:
        return jsonify({'error': f'Invalid role. Must be one of: {", ".join(valid_roles)}'}), 400
    
    # Create new user
    new_user = User(
        user_id=data['user_id'],
        matricule_number=data['matricule_number'],
        name=data['name'],
        email=data.get('email'),
        service=data['service'],
        role=data['role']
    )
    new_user.set_password(data['password'])
    
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({
        'message': 'User created successfully',
        'user': new_user.to_dict()
    }), 201


# ============================================================================
# USER ENDPOINTS
# ============================================================================

@app.route('/api/users', methods=['GET'])
@token_required
def get_users(current_user):
    """Get all users"""
    users = User.query.filter_by(is_active=True).all()
    return jsonify({
        'users': [user.to_dict() for user in users]
    }), 200


@app.route('/api/users/<user_id>', methods=['GET'])
@token_required
def get_user(current_user, user_id):
    """Get specific user"""
    user = User.query.filter_by(user_id=user_id).first()
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    return jsonify(user.to_dict(include_email=(current_user.user_id == user_id))), 200


@app.route('/api/users/me', methods=['GET'])
@token_required
def get_current_user(current_user):
    """Get current authenticated user"""
    return jsonify(current_user.to_dict(include_email=True)), 200


@app.route('/api/users/<user_id>', methods=['PUT'])
@token_required
@role_required('manager')
def update_user(current_user, user_id):
    """Update user details"""
    user = User.query.filter_by(user_id=user_id).first()
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    data = request.get_json()
    
    if 'name' in data:
        user.name = data['name']
    if 'service' in data:
        if data['service'] not in ['maintenance', 'production']:
            return jsonify({'error': 'Invalid service'}), 400
        user.service = data['service']
    if 'role' in data:
        if data['role'] not in ['technician', 'team_leader', 'supervisor', 'manager']:
            return jsonify({'error': 'Invalid role'}), 400
        user.role = data['role']
    if 'email' in data:
        # Check if email is unique if changed
        if data['email'] and data['email'] != user.email:
            if User.query.filter_by(email=data['email']).first():
                return jsonify({'error': 'Email already exists'}), 409
        user.email = data['email']
    if 'matricule_number' in data:
        # Check if matricule is unique if changed
        if data['matricule_number'] and data['matricule_number'] != user.matricule_number:
            if User.query.filter_by(matricule_number=data['matricule_number']).first():
                return jsonify({'error': 'Matricule number already exists'}), 409
        user.matricule_number = data['matricule_number']
    if 'is_active' in data:
        user.is_active = bool(data['is_active'])
        
    db.session.commit()
    
    return jsonify({
        'message': 'User updated successfully',
        'user': user.to_dict(include_email=True)
    }), 200


@app.route('/api/users/<user_id>', methods=['DELETE'])
@token_required
@role_required('manager')
def delete_user(current_user, user_id):
    """Delete user"""
    user = User.query.filter_by(user_id=user_id).first()
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # Prevent deleting yourself
    if user.id == current_user.id:
        return jsonify({'error': 'Cannot delete your own account'}), 400
        
    db.session.delete(user)
    db.session.commit()
    
    return jsonify({'message': 'User deleted successfully'}), 200


# ============================================================================
# MACHINE ENDPOINTS
# ============================================================================

@app.route('/api/machines', methods=['GET'])
@token_required
def get_machines(current_user):
    """Get all machines"""
    machines = Machine.query.all()
    return jsonify({
        'machines': [machine.to_dict() for machine in machines]
    }), 200


@app.route('/api/machines/<machine_id>', methods=['GET'])
@token_required
def get_machine(current_user, machine_id):
    """Get specific machine"""
    machine = Machine.query.filter_by(machine_id=machine_id).first()
    
    if not machine:
        return jsonify({'error': 'Machine not found'}), 404
    
    return jsonify(machine.to_dict()), 200


@app.route('/api/machines', methods=['POST'])
@token_required
@role_required('manager', 'supervisor', 'team_leader')
def create_machine(current_user):
    """Create new machine"""
    data = request.get_json()
    
    # Only name is required now
    if 'name' not in data:
        return jsonify({'error': 'Machine name is required'}), 400
    
    # Auto-generate machine_id
    # Find the highest existing machine number
    existing_machines = Machine.query.all()
    if existing_machines:
        # Extract numbers from existing machine IDs (e.g., MACH001 -> 1)
        numbers = []
        for m in existing_machines:
            try:
                # Try to extract number from machine_id
                num_str = ''.join(filter(str.isdigit, m.machine_id))
                if num_str:
                    numbers.append(int(num_str))
            except:
                pass
        next_num = max(numbers) + 1 if numbers else 1
    else:
        next_num = 1
    
    machine_id = f'MACH{next_num:03d}'
    
    # Check if it exists (just in case)
    while Machine.query.filter_by(machine_id=machine_id).first():
        next_num += 1
        machine_id = f'MACH{next_num:03d}'
    
    machine = Machine(
        machine_id=machine_id,
        name=data['name'],
        location=data.get('location'),
        status=data.get('status', 'active')
    )
    
    db.session.add(machine)
    db.session.commit()
    
    # Generate and save QR code
    try:
        qr_folder = 'qr_codes'
        if not os.path.exists(qr_folder):
            os.makedirs(qr_folder)
            
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(machine.machine_id)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")
        qr_path = os.path.join(qr_folder, f'{machine.machine_id}.png')
        img.save(qr_path)
    except Exception as e:
        print(f"Error generating QR code: {e}")
        # Don't fail the request if QR generation fails, just log it
    
    return jsonify({
        'message': 'Machine created successfully',
        'machine': machine.to_dict(),
        'qr_code_saved': True
    }), 201


@app.route('/api/machines/<machine_id>', methods=['PUT'])
@token_required
@role_required('manager', 'supervisor', 'team_leader')
def update_machine(current_user, machine_id):
    """Update machine"""
    machine = Machine.query.filter_by(machine_id=machine_id).first()
    
    if not machine:
        return jsonify({'error': 'Machine not found'}), 404
    
    data = request.get_json()
    
    if 'name' in data:
        machine.name = data['name']
    if 'location' in data:
        machine.location = data['location']
    if 'status' in data:
        machine.status = data['status']
        
    db.session.commit()
    
    return jsonify({
        'message': 'Machine updated successfully',
        'machine': machine.to_dict()
    }), 200


@app.route('/api/machines/<machine_id>', methods=['DELETE'])
@token_required
@role_required('manager')
def delete_machine(current_user, machine_id):
    """Delete machine"""
    machine = Machine.query.filter_by(machine_id=machine_id).first()
    
    if not machine:
        return jsonify({'error': 'Machine not found'}), 404
        
    db.session.delete(machine)
    db.session.commit()
    
    return jsonify({'message': 'Machine deleted successfully'}), 200


@app.route('/api/machines/<machine_id>/qrcode', methods=['GET'])
@token_required
def get_machine_qrcode(current_user, machine_id):
    """Generate and return QR code for machine"""
    machine = Machine.query.filter_by(machine_id=machine_id).first()
    
    if not machine:
        return jsonify({'error': 'Machine not found'}), 404
        
    # Generate QR code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(machine.machine_id)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    
    # Save to buffer
    img_io = io.BytesIO()
    img.save(img_io, 'PNG')
    img_io.seek(0)
    
    return send_file(img_io, mimetype='image/png')


# ============================================================================
# ISSUE ENDPOINTS
# ============================================================================

@app.route('/api/issues', methods=['GET'])
@token_required
def get_issues(current_user):
    """Get issues (filtered by role) with pagination"""
    # Query parameters
    status = request.args.get('status')
    urgency = request.args.get('urgency')
    machine_id = request.args.get('machine_id')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    
    # Base query
    query = db.session.query(Issue, Machine.name.label('machine_name')).join(Machine, Issue.machine_id == Machine.machine_id)
    
    # Role-based filtering
    if current_user.service == 'production':
        # Production users see only their issues
        query = query.filter(Issue.reporter_id == current_user.id)
    elif current_user.service == 'maintenance':
        # Maintenance users see all issues (to allow them to pick up tasks)
        pass
    # Supervisors and team leaders see all issues (no additional filter)
    
    # Apply filters
    if status:
        if ',' in status:
            status_list = status.split(',')
            query = query.filter(Issue.status.in_(status_list))
        else:
            query = query.filter(Issue.status == status)
    if urgency:
        query = query.filter(Issue.urgency == urgency)
    if machine_id:
        query = query.filter(Issue.machine_id == machine_id)
    
    # Date filtering
    date_str = request.args.get('date')
    if date_str:
        try:
            filter_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            next_day = filter_date + timedelta(days=1)
            query = query.filter(Issue.created_at >= filter_date, Issue.created_at < next_day)
        except ValueError:
            pass # Ignore invalid date format
    
    # Order by urgency (high first) and creation date
    urgency_order = case(
        (Issue.urgency == 'high', 1),
        (Issue.urgency == 'medium', 2),
        (Issue.urgency == 'low', 3),
        else_=4
    )
    
    # Pagination
    pagination = query.order_by(Issue.created_at.desc(), urgency_order).paginate(
        page=page, per_page=per_page, error_out=False
    )
    
    issues_data = []
    for issue, machine_name in pagination.items:
        issue_dict = issue.to_dict()
        issue_dict['machine_name'] = machine_name
        issues_data.append(issue_dict)

    return jsonify({
        'issues': issues_data,
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': pagination.page,
        'per_page': pagination.per_page,
        'has_next': pagination.has_next,
        'has_prev': pagination.has_prev
    }), 200


@app.route('/api/issues/<issue_id>', methods=['GET'])
@token_required
def get_issue(current_user, issue_id):
    """Get specific issue with notes"""
    issue = Issue.query.filter_by(issue_id=issue_id).first()
    
    if not issue:
        return jsonify({'error': 'Issue not found'}), 404
    
    # Check permissions
    if current_user.role == 'production' and issue.reporter_id != current_user.id:
        return jsonify({'error': 'Access denied'}), 403
    
    return jsonify(issue.to_dict(include_notes=True)), 200


@app.route('/api/issues', methods=['POST'])
@token_required
@role_required('production', 'supervisor', 'team_leader')
def create_issue(current_user):
    """Create new issue"""
    print(f"Received create_issue request from {current_user.name}")
    data = request.get_json()
    
    required_fields = ['machine_id', 'description', 'urgency']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400
    
    # Validate urgency
    if data['urgency'] not in ['low', 'medium', 'high']:
        return jsonify({'error': 'Invalid urgency level'}), 400
    
    # Generate issue ID
    # Find the highest ISS number from existing issues
    all_issues = Issue.query.all()
    iss_numbers = []
    for issue in all_issues:
        # Only consider issues that follow the ISS### format
        if issue.issue_id.startswith('ISS'):
            try:
                num_str = issue.issue_id.replace('ISS', '')
                if num_str.isdigit():
                    iss_numbers.append(int(num_str))
            except (ValueError, AttributeError):
                # Skip issues with invalid format
                pass
    
    if iss_numbers:
        next_num = max(iss_numbers) + 1
        new_issue_id = f'ISS{next_num:03d}'
    else:
        new_issue_id = 'ISS001'
    
    # Create issue
    issue = Issue(
        issue_id=new_issue_id,
        machine_id=data['machine_id'],
        description=data['description'],
        urgency=data['urgency'],
        reporter_id=current_user.id
    )
    
    db.session.add(issue)
    db.session.commit()
    
    # Emit real-time notification
    # Emit real-time notification to maintenance team
    socketio.emit('new_issue', issue.to_dict())
    
    return jsonify({
        'message': 'Issue created successfully',
        'issue': issue.to_dict()
    }), 201


@app.route('/api/issues/<issue_id>/assign', methods=['POST'])
@token_required
@role_required('maintenance', 'supervisor', 'team_leader')
def assign_issue(current_user, issue_id):
    """Assign issue to technician"""
    issue = Issue.query.filter_by(issue_id=issue_id).first()
    
    if not issue:
        return jsonify({'error': 'Issue not found'}), 404
    
    if issue.status not in ['reported', 'assigned']:
        return jsonify({'error': 'Issue cannot be assigned in current status'}), 400
    
    # Assign to current user (maintenance tech)
    issue.assigned_tech_id = current_user.id
    issue.status = 'assigned'
    issue.accepted_at = datetime.utcnow()
    
    # Add note
    note = Note(
        text='Issue accepted and assigned',
        issue_id=issue.id,
        author_id=current_user.id
    )
    db.session.add(note)
    db.session.commit()
    
    # Emit real-time notification
    socketio.emit('issue_updated', issue.to_dict(), namespace='/')
    
    return jsonify({
        'message': 'Issue assigned successfully',
        'issue': issue.to_dict(include_notes=True)
    }), 200


@app.route('/api/issues/<issue_id>/status', methods=['PATCH'])
@token_required
def update_issue_status(current_user, issue_id):
    """Update issue status"""
    issue = Issue.query.filter_by(issue_id=issue_id).first()
    
    if not issue:
        return jsonify({'error': 'Issue not found'}), 404
    
    # Check permissions
    if current_user.role == 'production':
        return jsonify({'error': 'Production users cannot update status'}), 403
    
    if current_user.role == 'maintenance' and issue.assigned_tech_id != current_user.id:
        return jsonify({'error': 'You can only update your assigned issues'}), 403
    
    data = request.get_json()
    new_status = data.get('status')
    
    valid_statuses = ['reported', 'assigned', 'in_progress', 'closed']
    if new_status not in valid_statuses:
        return jsonify({'error': f'Invalid status. Must be one of: {", ".join(valid_statuses)}'}), 400
    
    issue.status = new_status
    
    # Add automatic note
    note = Note(
        text=f'Status changed to {new_status}',
        issue_id=issue.id,
        author_id=current_user.id
    )
    db.session.add(note)
    db.session.commit()
    
    # Emit real-time notification
    socketio.emit('issue_updated', issue.to_dict(), namespace='/')
    
    return jsonify({
        'message': 'Status updated successfully',
        'issue': issue.to_dict(include_notes=True)
    }), 200


@app.route('/api/issues/<issue_id>/close', methods=['POST'])
@token_required
@role_required('maintenance', 'supervisor', 'team_leader')
def close_issue(current_user, issue_id):
    """Close issue with resolution"""
    issue = Issue.query.filter_by(issue_id=issue_id).first()
    
    if not issue:
        return jsonify({'error': 'Issue not found'}), 404
    
    if issue.status == 'closed':
        return jsonify({'error': 'Issue is already closed'}), 400
    
    # Check permissions
    if current_user.role == 'maintenance' and issue.assigned_tech_id != current_user.id:
        return jsonify({'error': 'You can only close your assigned issues'}), 403
    
    data = request.get_json()
    resolution = data.get('resolution')
    problem_description = data.get('problem_description')
    
    if not resolution:
        return jsonify({'error': 'Resolution is required'}), 400
        
    issue.status = 'closed'
    issue.closed_at = datetime.utcnow()
    issue.resolution = resolution
    if problem_description:
        issue.problem_description = problem_description
    
    # Add closing note
    note = Note(
        text=f'Issue closed. Resolution: {resolution}',
        issue_id=issue.id,
        author_id=current_user.id
    )
    db.session.add(note)
    db.session.commit()
    
    # Emit real-time notification
    socketio.emit('issue_closed', issue.to_dict(), namespace='/')
    
    return jsonify({
        'message': 'Issue closed successfully',
        'issue': issue.to_dict(include_notes=True)
    }), 200


@app.route('/api/issues/<issue_id>/notes', methods=['POST'])
@token_required
def add_note(current_user, issue_id):
    """Add note to issue"""
    issue = Issue.query.filter_by(issue_id=issue_id).first()
    
    if not issue:
        return jsonify({'error': 'Issue not found'}), 404
    
    # Check permissions
    if current_user.role == 'production' and issue.reporter_id != current_user.id:
        return jsonify({'error': 'Access denied'}), 403
    
    data = request.get_json()
    text = data.get('text')
    
    if not text:
        return jsonify({'error': 'Note text is required'}), 400
    
    note = Note(
        text=text,
        issue_id=issue.id,
        author_id=current_user.id
    )
    db.session.add(note)
    db.session.commit()
    
    # Emit real-time notification
    socketio.emit('note_added', {
        'issue_id': issue.issue_id,
        'note': note.to_dict()
    }, namespace='/')
    
    return jsonify({
        'message': 'Note added successfully',
        'note': note.to_dict()
    }), 201


@app.route('/api/issues/export', methods=['GET'])
def export_issues():
    """Export issues to Excel or PDF"""
    # Get filters
    date_str = request.args.get('date')
    machine_id = request.args.get('machine_id')
    export_format = request.args.get('format', 'excel')
    
    # Query issues with Machine name
    query = db.session.query(Issue, Machine.name.label('machine_name')).join(Machine, Issue.machine_id == Machine.machine_id)
    
    if date_str:
        try:
            filter_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            next_day = filter_date + timedelta(days=1)
            query = query.filter(Issue.created_at >= filter_date, Issue.created_at < next_day)
        except ValueError:
            pass
            
    if machine_id:
        query = query.filter(Issue.machine_id == machine_id)
        
    # Order by creation date desc
    results = query.order_by(Issue.created_at.desc()).all()
    
    # Prepare data
    data = []
    for issue, machine_name in results:
        # Calculate Reaction Time
        reaction_time = 'N/A'
        if issue.accepted_at and issue.created_at:
            diff = issue.accepted_at - issue.created_at
            hours, remainder = divmod(diff.total_seconds(), 3600)
            minutes, _ = divmod(remainder, 60)
            if hours > 0:
                reaction_time = f"{int(hours)}h {int(minutes)}m"
            else:
                reaction_time = f"{int(minutes)}m"

        # Calculate Resolution Time
        resolution_time = 'N/A'
        if issue.closed_at and issue.created_at:
            diff = issue.closed_at - issue.created_at
            hours, remainder = divmod(diff.total_seconds(), 3600)
            minutes, _ = divmod(remainder, 60)
            if hours > 0:
                resolution_time = f"{int(hours)}h {int(minutes)}m"
            else:
                resolution_time = f"{int(minutes)}m"

        data.append({
            'Issue ID': issue.issue_id,
            'Machine': machine_name, # Use name instead of ID
            'Description': issue.description,
            'Status': issue.status,
            'Urgency': issue.urgency,
            'Reporter': issue.reporter.name if issue.reporter else 'N/A',
            'Assigned To': issue.assigned_tech.name if issue.assigned_tech else 'Unassigned',
            'Created At': issue.created_at.strftime('%Y-%m-%d %H:%M') if issue.created_at else '',
            'Closed At': issue.closed_at.strftime('%Y-%m-%d %H:%M') if issue.closed_at else '',
            'Resolution': issue.resolution or '',
            'Reaction Time': reaction_time,
            'Resolution Time': resolution_time
        })
        
    if export_format == 'excel':
        import pandas as pd
        df = pd.DataFrame(data)
        
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Issues')
            
        output.seek(0)
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=f'issues_export_{datetime.now().strftime("%Y%m%d")}.xlsx'
        )
        
    elif export_format == 'pdf':
        from fpdf import FPDF
        
        class PDF(FPDF):
            def header(self):
                self.set_font('Arial', 'B', 15)
                self.set_fill_color(200, 220, 255) # Light Blue
                self.cell(0, 10, 'Issues Report', 0, 1, 'C', fill=True)
                self.ln(5)
                
            def footer(self):
                self.set_y(-15)
                self.set_font('Arial', 'I', 8)
                self.cell(0, 10, f'Page {self.page_no()}/{{nb}}', 0, 0, 'C')
                
        # Landscape for better width
        pdf = PDF(orientation='L')
        pdf.alias_nb_pages()
        pdf.add_page()
        pdf.set_font('Arial', 'B', 10)
        
        # Headers
        headers = ['ID', 'Machine', 'Status', 'Reporter', 'Assigned', 'Created', 'React Time', 'Res Time']
        widths = [20, 35, 25, 30, 30, 35, 25, 25]
        
        # Header Background
        pdf.set_fill_color(230, 230, 230) # Light Gray
        for i, header in enumerate(headers):
            pdf.cell(widths[i], 10, header, 1, 0, 'C', fill=True)
        pdf.ln()
        
        # Data
        pdf.set_font('Arial', size=9)
        fill = False # Alternating rows
        
        for item in data:
            # Helper to sanitize text
            def clean(text):
                return str(text).encode('latin-1', 'replace').decode('latin-1')
            
            # Row background
            if fill:
                pdf.set_fill_color(245, 245, 245)
            else:
                pdf.set_fill_color(255, 255, 255)
            
            pdf.cell(widths[0], 10, clean(item['Issue ID']), 1, 0, 'C', fill=fill)
            pdf.cell(widths[1], 10, clean(item['Machine']), 1, 0, 'C', fill=fill)
            pdf.cell(widths[2], 10, clean(item['Status']), 1, 0, 'C', fill=fill)
            pdf.cell(widths[3], 10, clean(item['Reporter']), 1, 0, 'C', fill=fill)
            pdf.cell(widths[4], 10, clean(item['Assigned To']), 1, 0, 'C', fill=fill)
            pdf.cell(widths[5], 10, clean(item['Created At']), 1, 0, 'C', fill=fill)
            pdf.cell(widths[6], 10, clean(item['Reaction Time']), 1, 0, 'C', fill=fill)
            pdf.cell(widths[7], 10, clean(item['Resolution Time']), 1, 1, 'C', fill=fill)
            
            # Description and Resolution row
            if item['Description'] or item['Resolution']:
                pdf.set_font('Arial', 'I', 8)
                
                # Description
                if item['Description']:
                    pdf.cell(20, 6, "", 0, 0, fill=fill) # Indent
                    pdf.cell(15, 6, "Desc:", 0, 0, 'R', fill=fill)
                    desc = clean(item['Description'])
                    # Truncate if too long to keep it clean or use multi_cell?
                    # Let's use multi_cell but we need to manage x,y carefully or just let it flow.
                    # Simple approach: Just print it.
                    pdf.cell(0, 6, desc, 0, 1, 'L', fill=fill)
                
                # Resolution
                if item['Resolution']:
                    pdf.cell(20, 6, "", 0, 0, fill=fill) # Indent
                    pdf.cell(15, 6, "Res:", 0, 0, 'R', fill=fill)
                    res = clean(item['Resolution'])
                    pdf.cell(0, 6, res, 0, 1, 'L', fill=fill)
                
                pdf.set_font('Arial', size=9)
            
            fill = not fill # Toggle fill
            
        output = io.BytesIO()
        pdf_content = pdf.output(dest='S').encode('latin-1')
        output.write(pdf_content)
        output.seek(0)
        
        return send_file(
            output,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'issues_report_{datetime.now().strftime("%Y%m%d")}.pdf'
        )
        
    return jsonify({'error': 'Invalid format'}), 400


# ============================================================================
# ANALYTICS ENDPOINTS (Web-only for Supervisors/Team Leaders)
# ============================================================================

@app.route('/api/analytics/dashboard', methods=['GET'])
@token_required
def analytics_dashboard(current_user):
    """Get dashboard analytics summary"""
    # Total issues
    total_issues = Issue.query.count()
    
    # Open issues
    open_issues = Issue.query.filter(Issue.status != 'closed').count()
    
    # High priority issues
    high_priority = Issue.query.filter_by(urgency='high', status='reported').count()
    
    # Average resolution time (in hours)
    closed_issues = Issue.query.filter(Issue.status == 'closed', Issue.closed_at.isnot(None)).all()
    if closed_issues:
        total_time = sum([
            (issue.closed_at - issue.created_at).total_seconds() / 3600
            for issue in closed_issues
        ])
        avg_resolution_time = total_time / len(closed_issues)
    else:
        avg_resolution_time = 0
    
    # Issues created today
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    issues_today = Issue.query.filter(Issue.created_at >= today_start).count()
    
    # Issues by status
    issues_by_status = db.session.query(
        Issue.status,
        func.count(Issue.id)
    ).group_by(Issue.status).all()
    
    # Issues by urgency
    issues_by_urgency = db.session.query(
        Issue.urgency,
        func.count(Issue.id)
    ).group_by(Issue.urgency).all()
    
    return jsonify({
        'summary': {
            'total_issues': total_issues,
            'open_issues': open_issues,
            'high_priority': high_priority,
            'avg_resolution_time_hours': round(avg_resolution_time, 2),
            'issues_today': issues_today
        },
        'by_status': {status: count for status, count in issues_by_status},
        'by_urgency': {urgency: count for urgency, count in issues_by_urgency}
    }), 200


@app.route('/api/analytics/by-machine', methods=['GET'])
@token_required
@role_required('supervisor', 'team_leader', 'manager', 'maintenance')
def analytics_by_machine(current_user):
    """Get issues grouped by machine"""
    issues_by_machine = db.session.query(
        Issue.machine_id,
        Machine.name,
        func.count(Issue.id).label('total'),
        func.sum(case((Issue.status == 'closed', 1), else_=0)).label('closed'),
        func.sum(case((Issue.urgency == 'high', 1), else_=0)).label('high_urgency')
    ).join(Machine, Issue.machine_id == Machine.machine_id)\
     .group_by(Issue.machine_id, Machine.name)\
     .order_by(func.count(Issue.id).desc()).all()
    
    return jsonify({
        'machines': [
            {
                'machine_id': machine_id,
                'machine_name': machine_name,
                'total_issues': total,
                'closed_issues': closed,
                'high_urgency_issues': high_urgency
            }
            for machine_id, machine_name, total, closed, high_urgency in issues_by_machine
        ]
    }), 200


@app.route('/api/analytics/by-technician', methods=['GET'])
@token_required
@role_required('supervisor', 'team_leader', 'manager', 'maintenance')
def analytics_by_technician(current_user):
    """Get performance metrics by technician"""
    # Filter by service='maintenance' to get all maintenance staff (technicians, team leaders, etc.)
    # Or specifically role='technician' if we only want technicians.
    # Let's assume we want everyone in maintenance service who might be assigned issues.
    technicians = User.query.filter_by(service='maintenance', is_active=True).all()
    
    results = []
    for tech in technicians:
        assigned_count = Issue.query.filter_by(assigned_tech_id=tech.id).count()
        closed_count = Issue.query.filter_by(assigned_tech_id=tech.id, status='closed').count()
        
        # Average resolution time for this tech
        closed_issues = Issue.query.filter_by(
            assigned_tech_id=tech.id,
            status='closed'
        ).filter(Issue.closed_at.isnot(None)).all()
        
        if closed_issues:
            total_time = sum([
                (issue.closed_at - issue.accepted_at).total_seconds() / 3600
                for issue in closed_issues
                if issue.accepted_at
            ])
            avg_time = total_time / len(closed_issues) if closed_issues else 0
        else:
            avg_time = 0
        
        results.append({
            'technician': tech.to_dict(),
            'assigned_issues': assigned_count,
            'closed_issues': closed_count,
            'avg_resolution_time_hours': round(avg_time, 2)
        })
    
    return jsonify({'technicians': results}), 200


# ============================================================================
# WEBSOCKET EVENTS
# ============================================================================

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    print('Client connected')
    emit('connected', {'message': 'Connected to Issue Tracker'})


@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    print('Client disconnected')


@socketio.on('join_room')
def handle_join_room(data):
    """Join a specific room (e.g., for role-based notifications)"""
    room = data.get('room')
    if room:
        join_room(room)
        emit('joined_room', {'room': room})


@socketio.on('leave_room')
def handle_leave_room(data):
    """Leave a specific room"""
    room = data.get('room')
    if room:
        leave_room(room)
        emit('left_room', {'room': room})


# ============================================================================
# STATIC FILE ROUTES
# ============================================================================

@app.route('/')
def index():
    """Serve the login page"""
    return app.send_static_file('index.html')


# ============================================================================
# ERROR HANDLERS
# ============================================================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return jsonify({'error': 'Internal server error'}), 500


# ============================================================================
# MAIN ENTRY POINT
# ============================================================================

if __name__ == '__main__':
    print("=" * 70)
    print("  Issue Tracker API Server")
    print("=" * 70)
    print("\n🚀 Starting server on http://localhost:5002")
    print("📡 WebSocket support enabled")
    print("📝 Default user:")
    print("   Admin: ADMIN001 (Matricule: ADM001, Password: admin123)")
    print("")
    print("======================================================================")
    
    socketio.run(app, debug=True, host='0.0.0.0', port=5002, allow_unsafe_werkzeug=True)
