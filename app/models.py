"""
Database models for Issue Tracker
"""
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
import bcrypt

db = SQLAlchemy()


class User(db.Model):
    """User model for authentication and role management"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(20), unique=True, nullable=False, index=True)
    matricule_number = db.Column(db.String(20), unique=True, nullable=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True)
    password_hash = db.Column(db.String(255), nullable=False)
    service = db.Column(db.String(20), nullable=False, default='maintenance')  # maintenance, production
    role = db.Column(db.String(20), nullable=False)  # technician, team_leader, supervisor, manager
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationships
    reported_issues = db.relationship('Issue', foreign_keys='Issue.reporter_id', backref='reporter', lazy='dynamic')
    assigned_issues = db.relationship('Issue', foreign_keys='Issue.assigned_tech_id', backref='assigned_tech', lazy='dynamic')
    notes = db.relationship('Note', backref='author', lazy='dynamic')
    
    def set_password(self, password):
        """Hash and set password"""
        self.password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    def check_password(self, password):
        """Verify password"""
        return bcrypt.checkpw(password.encode('utf-8'), self.password_hash.encode('utf-8'))
    
    def to_dict(self, include_email=False):
        """Convert to dictionary"""
        data = {
            'id': self.id,
            'user_id': self.user_id,
            'matricule_number': self.matricule_number,
            'name': self.name,
            'service': self.service,
            'role': self.role,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        if include_email:
            data['email'] = self.email
        return data
    
    def __repr__(self):
        return f'<User {self.user_id} - {self.name}>'


class Issue(db.Model):
    """Issue model for tracking maintenance requests"""
    __tablename__ = 'issues'
    
    id = db.Column(db.Integer, primary_key=True)
    issue_id = db.Column(db.String(20), unique=True, nullable=False, index=True)
    machine_id = db.Column(db.String(50), nullable=False, index=True)
    description = db.Column(db.Text, nullable=False)
    urgency = db.Column(db.String(10), nullable=False, index=True)  # low, medium, high
    status = db.Column(db.String(20), nullable=False, default='reported', index=True)  # reported, assigned, in_progress, closed
    
    # Foreign keys
    reporter_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    assigned_tech_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    accepted_at = db.Column(db.DateTime, nullable=True)
    closed_at = db.Column(db.DateTime, nullable=True)
    
    # Resolution
    resolution = db.Column(db.Text, nullable=True)
    problem_description = db.Column(db.Text, nullable=True)
    
    # Relationships
    notes = db.relationship('Note', backref='issue', lazy='dynamic', cascade='all, delete-orphan')
    
    def to_dict(self, include_notes=False):
        """Convert to dictionary"""
        data = {
            'id': self.id,
            'issue_id': self.issue_id,
            'machine_id': self.machine_id,
            'description': self.description,
            'urgency': self.urgency,
            'status': self.status,
            'reporter': self.reporter.to_dict() if self.reporter else None,
            'assigned_tech': self.assigned_tech.to_dict() if self.assigned_tech else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'accepted_at': self.accepted_at.isoformat() if self.accepted_at else None,
            'closed_at': self.closed_at.isoformat() if self.closed_at else None,
            'resolution': self.resolution,
            'problem_description': self.problem_description
        }
        
        if include_notes:
            data['notes'] = [note.to_dict() for note in self.notes.order_by(Note.created_at.asc())]
        else:
            data['notes_count'] = self.notes.count()
        
        return data
    
    def __repr__(self):
        return f'<Issue {self.issue_id} - {self.machine_id}>'


class Machine(db.Model):
    """Machine model"""
    __tablename__ = 'machines'
    
    id = db.Column(db.Integer, primary_key=True)
    machine_id = db.Column(db.String(50), unique=True, nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    location = db.Column(db.String(100), nullable=True)
    status = db.Column(db.String(20), default='active')  # active, inactive, maintenance
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'machine_id': self.machine_id,
            'name': self.name,
            'location': self.location,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<Machine {self.machine_id} - {self.name}>'


class Note(db.Model):
    """Note model for issue updates and comments"""
    __tablename__ = 'notes'
    
    id = db.Column(db.Integer, primary_key=True)
    text = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    
    # Foreign keys
    issue_id = db.Column(db.Integer, db.ForeignKey('issues.id'), nullable=False)
    author_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'text': self.text,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'author': self.author.to_dict() if self.author else None
        }
    
    def __repr__(self):
        return f'<Note {self.id} on Issue {self.issue_id}>'


def init_db(app):
    """Initialize database"""
    db.init_app(app)
    
    with app.app_context():
        # Create all tables
        db.create_all()
        
        # Check if we need to create default users
        if User.query.count() == 0:
            create_default_users()


def create_default_users():
    """Create default Admin user"""
    # Create single Admin user (Team Leader role)
    admin_user = User(
        user_id='ADMIN001',
        matricule_number='ADM001',
        name='System Administrator',
        service='maintenance',
        role='manager',
        email='admin@example.com'
    )
    admin_user.set_password('admin123')
    
    db.session.add(admin_user)
    db.session.commit()
    print("Created default Admin user: ADMIN001 / admin123")
