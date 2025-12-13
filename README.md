# Issues Tracker - Web Application

A Flask-based web application for managing maintenance issues and tracking machine performance.

## Features

- **User Authentication**: Secure login system with JWT tokens
- **Issue Management**: Create, track, and manage maintenance issues
- **Real-time Updates**: WebSocket support for live notifications
- **Analytics Dashboard**: KPIs and performance metrics
- **Machine Management**: Track machines and their maintenance history
- **User Management**: Admin panel for user administration
- **Export Functionality**: Export data to Excel and PDF

## Project Structure

```
issues_tracker_web/
├── app/
│   ├── api_server.py      # Main Flask application
│   ├── models.py          # Database models
│   ├── config.py          # Configuration settings
│   └── static/            # Web frontend (HTML, CSS, JS)
├── utils/
│   ├── create_user.py     # Utility to create users
│   └── populate_data.py   # Utility to populate test data
├── instance/
│   └── issues.db          # SQLite database
├── qr_codes/              # Generated QR codes for machines
├── requirements.txt       # Python dependencies
├── wsgi.py               # WSGI configuration for deployment
└── README.md             # This file
```

## Installation

### Local Development

1. **Clone or navigate to the project directory**:
   ```bash
   cd /path/to/issues_tracker_web
   ```

2. **Create a virtual environment**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Initialize the database** (if not already present):
   ```bash
   cd app
   python -c "from api_server import init_db; init_db()"
   ```

5. **Create an admin user** (optional):
   ```bash
   cd ../utils
   python create_user.py
   ```

6. **Run the application**:
   ```bash
   cd ../app
   python api_server.py
   ```

7. **Access the application**:
   Open your browser and navigate to `http://localhost:5002`

## Default Credentials

After initialization, you can create users using the `create_user.py` utility script.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions on deploying to PythonAnywhere.

## Technologies Used

- **Backend**: Flask, SQLAlchemy, Flask-SocketIO
- **Frontend**: Vanilla JavaScript, Chart.js
- **Database**: SQLite
- **Authentication**: JWT (PyJWT)
- **Real-time**: Socket.IO

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration

### Issues
- `GET /api/issues` - Get all issues
- `POST /api/issues` - Create new issue
- `GET /api/issues/<id>` - Get specific issue
- `PATCH /api/issues/<id>` - Update issue
- `DELETE /api/issues/<id>` - Delete issue

### Analytics
- `GET /api/analytics/dashboard` - Dashboard metrics
- `GET /api/analytics/by-machine` - Issues grouped by machine
- `GET /api/analytics/by-technician` - Technician performance

### Machines
- `GET /api/machines` - Get all machines
- `POST /api/machines` - Create new machine
- `PUT /api/machines/<id>` - Update machine
- `DELETE /api/machines/<id>` - Delete machine

### Users
- `GET /api/users` - Get all users (admin only)
- `POST /api/users` - Create new user (admin only)
- `PUT /api/users/<id>` - Update user (admin only)

## License

This project is proprietary software.

## Support

For issues or questions, please contact the development team.
# Issues_Tracker
