"""
WSGI configuration for PythonAnywhere deployment
"""
import sys
import os

# Add your project directory to the sys.path
project_home = '/home/YOUR_USERNAME/issues_tracker_web'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Set the path to your app directory
app_path = os.path.join(project_home, 'app')
if app_path not in sys.path:
    sys.path.insert(0, app_path)

# Import your Flask app
from app.api_server import app as application

# For debugging (remove in production)
application.debug = False
