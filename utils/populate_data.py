import random
from datetime import datetime, timedelta
from api_server import app
from models import db, Issue, User, Machine

def populate_data():
    with app.app_context():
        # Ensure we have some users and machines
        reporter = User.query.filter_by(service='production').first()
        if not reporter:
            print("No production user found. Please create one first.")
            return

        machine = Machine.query.first()
        if not machine:
            print("No machine found. Please create one first.")
            return

        # Generate 50 issues
        print("Generating 50 dummy issues...")
        for i in range(50):
            # Random date within last 30 days
            days_ago = random.randint(0, 30)
            created_at = datetime.utcnow() - timedelta(days=days_ago)
            
            issue_id = f'TEST{i:03d}'
            
            issue = Issue(
                issue_id=issue_id,
                machine_id=machine.machine_id,
                description=f'Test issue {i} for pagination testing',
                urgency=random.choice(['low', 'medium', 'high']),
                status=random.choice(['reported', 'assigned', 'in_progress', 'closed']),
                reporter_id=reporter.id,
                created_at=created_at
            )
            
            db.session.add(issue)
        
        db.session.commit()
        print("Done!")

if __name__ == '__main__':
    populate_data()
