# PythonAnywhere Deployment Guide

This guide will help you deploy the Issues Tracker web application to PythonAnywhere.

## Prerequisites

- A PythonAnywhere account (free or paid)
- Your project files uploaded to PythonAnywhere

## Step 1: Upload Your Project

1. **Login to PythonAnywhere** at https://www.pythonanywhere.com

2. **Open a Bash console** from the dashboard

3. **Upload your project**:
   - Option A: Use Git (recommended)
     ```bash
     git clone https://your-repo-url.git issues_tracker_web
     ```
   
   - Option B: Upload via Files tab
     - Zip your `issues_tracker_web` folder locally
     - Upload via the Files tab
     - Unzip in the Bash console:
       ```bash
       cd ~
       unzip issues_tracker_web.zip
       ```

## Step 2: Set Up Virtual Environment

```bash
cd ~/issues_tracker_web
python3.10 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Step 3: Initialize Database

```bash
cd ~/issues_tracker_web/app
python -c "from api_server import init_db; init_db()"
```

## Step 4: Create Admin User

```bash
cd ~/issues_tracker_web/utils
python create_user.py
```

Follow the prompts to create your first admin user.

## Step 5: Configure Web App

1. **Go to the Web tab** in PythonAnywhere dashboard

2. **Click "Add a new web app"**

3. **Select**:
   - Manual configuration
   - Python 3.10 (or your preferred version)

4. **Configure WSGI file**:
   - Click on the WSGI configuration file link
   - Delete all content and replace with:

```python
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
from api_server import app as application
```

   - **Important**: Replace `YOUR_USERNAME` with your actual PythonAnywhere username

5. **Set Virtual Environment**:
   - In the Web tab, find "Virtualenv" section
   - Enter: `/home/YOUR_USERNAME/issues_tracker_web/venv`
   - Replace `YOUR_USERNAME` with your actual username

6. **Configure Static Files**:
   - In the "Static files" section, add:
     - URL: `/static`
     - Directory: `/home/YOUR_USERNAME/issues_tracker_web/app/static`

## Step 6: Configure Security

1. **Update config.py**:
   - Edit `~/issues_tracker_web/app/config.py`
   - Change `SECRET_KEY` to a strong random string:
     ```python
     SECRET_KEY = 'your-very-long-random-secret-key-here'
     ```
   - You can generate one with:
     ```bash
     python -c "import secrets; print(secrets.token_hex(32))"
     ```

2. **Set Database Path**:
   - Ensure the database path in `config.py` points to:
     ```python
     SQLALCHEMY_DATABASE_URI = 'sqlite:///../instance/issues.db'
     ```

## Step 7: Reload Web App

1. **Go back to the Web tab**
2. **Click the green "Reload" button**
3. **Visit your site**: `https://YOUR_USERNAME.pythonanywhere.com`

## Step 8: Test the Application

1. **Access the login page**
2. **Login with the admin credentials** you created
3. **Test key features**:
   - Create an issue
   - View dashboard
   - Check analytics

## Troubleshooting

### Error Logs
- Check error logs in the Web tab under "Log files"
- Look for:
  - Error log
  - Server log
  - Access log

### Common Issues

**1. 500 Internal Server Error**
- Check WSGI configuration
- Verify all paths use your correct username
- Check error log for Python exceptions

**2. Static Files Not Loading**
- Verify static files path in Web tab
- Ensure path is: `/home/YOUR_USERNAME/issues_tracker_web/app/static`

**3. Database Errors**
- Ensure database was initialized
- Check file permissions on `instance/issues.db`
- Run: `chmod 644 ~/issues_tracker_web/instance/issues.db`

**4. Import Errors**
- Verify virtual environment is set correctly
- Check all dependencies are installed: `pip list`
- Reinstall if needed: `pip install -r requirements.txt`

**5. WebSocket Issues**
- PythonAnywhere free accounts don't support WebSockets
- The app will work without real-time features
- Upgrade to paid account for WebSocket support

## Environment Variables (Optional)

For production, consider using environment variables:

1. **Create a .env file** (not tracked in git):
   ```bash
   SECRET_KEY=your-secret-key
   DATABASE_URL=sqlite:///instance/issues.db
   ```

2. **Install python-dotenv**:
   ```bash
   pip install python-dotenv
   ```

3. **Update config.py** to load from environment

## Updating Your Application

When you make changes:

1. **Upload new files** or pull from git:
   ```bash
   cd ~/issues_tracker_web
   git pull origin main
   ```

2. **Update dependencies** if requirements.txt changed:
   ```bash
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Reload the web app** from the Web tab

## Custom Domain (Paid Accounts)

If you have a paid account and want to use a custom domain:

1. **Go to Web tab**
2. **Add your domain** in the "Domain" section
3. **Configure DNS** at your domain registrar:
   - Add CNAME record pointing to `YOUR_USERNAME.pythonanywhere.com`

## Security Recommendations

1. **Change default SECRET_KEY** immediately
2. **Use strong passwords** for all users
3. **Regularly backup** your database:
   ```bash
   cp ~/issues_tracker_web/instance/issues.db ~/backups/issues_$(date +%Y%m%d).db
   ```
4. **Keep dependencies updated**:
   ```bash
   pip list --outdated
   ```

## Support

- PythonAnywhere Help: https://help.pythonanywhere.com/
- PythonAnywhere Forums: https://www.pythonanywhere.com/forums/

## Notes

- Free accounts have limited CPU time and bandwidth
- WebSockets require a paid account
- Database size limits apply based on account type
- Consider upgrading for production use
