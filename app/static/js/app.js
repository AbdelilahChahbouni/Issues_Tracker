/**
 * Issue Tracker - Frontend Application
 * API Client and Utilities
 */

// API Configuration
const API_BASE_URL = 'http://localhost:5002';

// API Client
class APIClient {
    constructor(baseURL) {
        this.baseURL = baseURL;
    }

    getToken() {
        return localStorage.getItem('token');
    }

    getHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };

        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return headers;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            ...options,
            headers: this.getHeaders()
        };

        try {
            const response = await fetch(url, config);

            // Get response as text first
            const text = await response.text();

            // Try to parse as JSON
            let data;
            try {
                data = text ? JSON.parse(text) : {};
            } catch (parseError) {
                console.error('JSON Parse Error:', parseError);
                console.error('Response text:', text);
                throw new Error(`Server returned invalid JSON: ${text.substring(0, 100)}`);
            }

            if (!response.ok) {
                if (response.status === 401) {
                    // Token expired or invalid
                    this.logout();
                    throw new Error('Session expired. Please login again.');
                }
                throw new Error(data.error || `Request failed with status ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Authentication
    async login(matriculeNumber, password) {
        return this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ matricule_number: matriculeNumber, password: password })
        });
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    }

    getCurrentUser() {
        const userStr = localStorage.getItem('user');
        return userStr ? JSON.parse(userStr) : null;
    }

    // Users
    async getUsers() {
        return this.request('/api/users');
    }

    async getUser(userId) {
        return this.request(`/api/users/${userId}`);
    }

    async getCurrentUserProfile() {
        return this.request('/api/users/me');
    }

    // Machines
    async getMachines() {
        return this.request('/api/machines');
    }

    async getMachine(machineId) {
        return this.request(`/api/machines/${machineId}`);
    }

    async createMachine(machineData) {
        return this.request('/api/machines', {
            method: 'POST',
            body: JSON.stringify(machineData)
        });
    }

    async updateMachine(machineId, machineData) {
        return this.request(`/api/machines/${machineId}`, {
            method: 'PUT',
            body: JSON.stringify(machineData)
        });
    }

    async deleteMachine(machineId) {
        return this.request(`/api/machines/${machineId}`, {
            method: 'DELETE'
        });
    }

    // Issues
    async getIssues(filters = {}) {
        const params = new URLSearchParams(filters);
        return this.request(`/api/issues?${params}`);
    }

    async getIssue(issueId) {
        return this.request(`/api/issues/${issueId}`);
    }

    async createIssue(issueData) {
        return this.request('/api/issues', {
            method: 'POST',
            body: JSON.stringify(issueData)
        });
    }

    async assignIssue(issueId) {
        return this.request(`/api/issues/${issueId}/assign`, {
            method: 'POST'
        });
    }

    async updateIssueStatus(issueId, status) {
        return this.request(`/api/issues/${issueId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        });
    }

    async closeIssue(issueId, resolution) {
        return this.request(`/api/issues/${issueId}/close`, {
            method: 'POST',
            body: JSON.stringify({ resolution })
        });
    }

    async addNote(issueId, text) {
        return this.request(`/api/issues/${issueId}/notes`, {
            method: 'POST',
            body: JSON.stringify({ text })
        });
    }

    // Analytics (Supervisor/Team Leader only)
    async getAnalyticsDashboard() {
        return this.request('/api/analytics/dashboard');
    }

    async getAnalyticsByMachine() {
        return this.request('/api/analytics/by-machine');
    }

    async getAnalyticsByTechnician() {
        return this.request('/api/analytics/by-technician');
    }
}

// Initialize API client
const api = new APIClient(API_BASE_URL);

// WebSocket Connection
class WebSocketClient {
    constructor(url) {
        this.url = url;
        this.socket = null;
        this.listeners = {};
    }

    connect() {
        this.socket = io(this.url);

        this.socket.on('connect', () => {
            console.log('WebSocket connected');
        });

        this.socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
        });

        // Listen for events
        this.socket.on('new_issue', (data) => {
            this.trigger('new_issue', data);
        });

        this.socket.on('issue_updated', (data) => {
            this.trigger('issue_updated', data);
        });

        this.socket.on('issue_closed', (data) => {
            this.trigger('issue_closed', data);
        });

        this.socket.on('note_added', (data) => {
            this.trigger('note_added', data);
        });
    }

    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    trigger(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

// Utility Functions
const utils = {
    formatDate(isoString) {
        if (!isoString) return 'N/A';
        const date = new Date(isoString);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    formatRelativeTime(isoString) {
        if (!isoString) return 'N/A';
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} min ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        return this.formatDate(isoString);
    },

    getUrgencyIcon(urgency) {
        const icons = {
            low: '🟢',
            medium: '🟡',
            high: '🔴'
        };
        return icons[urgency] || '⚪';
    },

    getStatusIcon(status) {
        const icons = {
            reported: '📝',
            assigned: '👤',
            in_progress: '⚙️',
            closed: '✅'
        };
        return icons[status] || '📋';
    },

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            background: var(--glass-bg);
            backdrop-filter: blur(20px);
            border: 1px solid var(--glass-border);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-lg);
            z-index: 9999;
            animation: slideIn 0.3s ease-out;
        `;

        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    },

    requireAuth() {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = 'index.html';
            return false;
        }
        return true;
    },

    hasRole(...roles) {
        const user = api.getCurrentUser();
        return user && roles.includes(user.role);
    },

    // Theme Management
    initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeIcon(savedTheme);
    },

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.updateThemeIcon(newTheme);
    },

    updateThemeIcon(theme) {
        const toggleBtn = document.getElementById('themeToggle');
        if (toggleBtn) {
            toggleBtn.innerHTML = theme === 'light' ? '🌙' : '☀️';
            toggleBtn.title = theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode';
        }
    }
};

// Add notification animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
// Pagination State
let currentPage = 1;
let itemsPerPage = 10;
let totalPages = 1;

// Initialize Dashboard
async function initDashboard() {
    if (!utils.requireAuth()) return;

    // Check role for Users link
    const user = api.getCurrentUser();
    if (user && (user.role === 'team_leader' || user.role === 'supervisor' || user.role === 'manager')) {
        const usersLink = document.getElementById('nav-users');
        if (usersLink) {
            usersLink.style.display = 'block';
        } else {
            console.warn('Users link element not found');
        }
    }

    // Initialize WebSocket
    const ws = new WebSocketClient(API_BASE_URL);
    ws.connect();

    // Load initial data
    await loadAnalytics();
    await loadIssues();

    // Setup WebSocket listeners
    ws.on('new_issue', () => {
        utils.showNotification('New issue reported!', 'warning');
        loadIssues(currentPage);
        loadAnalytics();
    });

    ws.on('issue_updated', () => {
        utils.showNotification('Issue updated', 'info');
        loadIssues(currentPage);
        loadAnalytics();
    });

    ws.on('issue_closed', () => {
        utils.showNotification('Issue closed', 'success');
        loadIssues(currentPage);
        loadAnalytics();
    });
}

// Load Issues with Pagination
async function loadIssues(page = 1) {
    try {
        const statusFilter = document.getElementById('status-filter').value;
        const filters = {
            page: page,
            per_page: itemsPerPage
        };

        if (statusFilter) {
            filters.status = statusFilter;
        }

        const data = await api.getIssues(filters);

        // Update pagination state
        currentPage = data.current_page;
        totalPages = data.pages;

        renderIssues(data.issues);
        renderPagination();

    } catch (error) {
        console.error('Error loading issues:', error);
        utils.showNotification('Failed to load issues', 'error');
    }
}

// Render Issues Table
function renderIssues(issues) {
    const tbody = document.getElementById('issues-list') || document.getElementById('issuesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (issues.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">No issues found</td></tr>';
        return;
    }

    issues.forEach(issue => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${issue.issue_id}</td>
            <td>${issue.machine_id}</td>
            <td>${issue.description.substring(0, 50)}${issue.description.length > 50 ? '...' : ''}</td>
            <td><span class="badge bg-${getUrgencyColor(issue.urgency)}">${issue.urgency}</span></td>
            <td><span class="badge bg-${getStatusColor(issue.status)}">${issue.status}</span></td>
            <td>${issue.assigned_tech ? issue.assigned_tech.name : '-'}</td>
            <td>${utils.formatRelativeTime(issue.created_at)}</td>
            <td>
                <button class="btn btn-sm btn-info" onclick="viewIssue('${issue.issue_id}')">View</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Render Pagination Controls
function renderPagination() {
    const paginationContainer = document.getElementById('pagination-controls');
    if (!paginationContainer) return;

    let html = '';

    // Previous Button
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="loadIssues(${currentPage - 1}); return false;">Previous</a>
        </li>
    `;

    // Page Numbers
    for (let i = 1; i <= totalPages; i++) {
        html += `
            <li class="page-item ${currentPage === i ? 'active' : ''}">
                <a class="page-link" href="#" onclick="loadIssues(${i}); return false;">${i}</a>
            </li>
        `;
    }

    // Next Button
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="loadIssues(${currentPage + 1}); return false;">Next</a>
        </li>
    `;

    paginationContainer.innerHTML = html;
}

// Helper functions for colors
function getUrgencyColor(urgency) {
    const colors = {
        low: 'success',
        medium: 'warning',
        high: 'danger'
    };
    return colors[urgency] || 'secondary';
}

function getStatusColor(status) {
    const colors = {
        reported: 'danger',
        assigned: 'info',
        in_progress: 'primary',
        closed: 'success'
    };
    return colors[status] || 'secondary';
}

// Check Auth on Page Load
function checkAuth() {
    if (!utils.requireAuth()) return;

    const user = api.getCurrentUser();
    if (user) {
        const userDisplay = document.getElementById('user-display');
        if (userDisplay) {
            userDisplay.textContent = `${user.name} (${user.role})`;
        }

        // Show/Hide Users link based on role
        if (user.role === 'team_leader' || user.role === 'supervisor') {
            const usersLink = document.getElementById('nav-users');
            if (usersLink) usersLink.style.display = 'block';
        }
    }

    // Setup logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => api.logout());
    }
}

// Fetch wrapper with auth
async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };

    const response = await fetch(url, {
        ...options,
        headers
    });

    if (response.status === 401) {
        api.logout();
        throw new Error('Unauthorized');
    }

    return response;
}
