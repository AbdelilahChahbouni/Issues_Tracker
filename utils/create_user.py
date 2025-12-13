from api_server import app
from models import db, User

def create_user():
    with app.app_context():
        if not User.query.filter_by(matricule_number='PROD001').first():
            user = User(
                user_id='PROD001',
                matricule_number='PROD001',
                name='Production User',
                service='production',
                role='technician' # Assuming technician role for production
            )
            user.set_password('password')
            db.session.add(user)
            db.session.commit()
            print("User created.")
        else:
            print("User already exists.")

if __name__ == '__main__':
    create_user()
