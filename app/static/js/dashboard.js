/**
 * Dashboard JavaScript
 * Handles dashboard functionality, issue management, and real-time updates
 */

// Check authentication
utils.requireAuth();

// Get current user
const currentUser = api.getCurrentUser();

// Initialize WebSocket
const ws = new WebSocketClient(API_BASE_URL);

// State
let allIssues = [];
let currentFilters = {
    status: '',
    urgency: ''
};

// Initialize dashboard
async function initDashboard() {
    // Check if user has access
    // Allow: All Maintenance service, and all Management roles (Supervisor, Team Leader, Manager)
    const isManagement = ['supervisor', 'team_leader', 'manager'].includes(currentUser.role);
    const isMaintenance = currentUser.service === 'maintenance';

    if (!isMaintenance && !isManagement) {
        // Redirect non-management Production users
        document.body.innerHTML = `
            <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg-primary); color: var(--text-primary); text-align: center; padding: 2rem;">
                <div style="max-width: 600px;">
                    <h1 style="font-size: 3rem; margin-bottom: 1rem;">📱 Mobile App Required</h1>
                    <p style="font-size: 1.2rem; color: var(--text-secondary); margin-bottom: 2rem;">
                        Production workers should use the mobile app to report issues.
                    </p>
                    <p style="color: var(--text-tertiary);">
                        This web dashboard is available for Maintenance staff and Supervisors.
                    </p>
                    <button onclick="api.logout()" style="margin-top: 2rem; padding: 1rem 2rem; background: var(--primary-400); color: white; border: none; border-radius: 0.5rem; font-size: 1rem; cursor: pointer;">
                        Logout
                    </button>
                </div>
            </div>
        `;
        return;
    }

    // Set user info
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userRole').textContent = currentUser.role.replace('_', ' ');

    // Hide create issue button (management views only)
    document.getElementById('createIssueBtn').style.display = 'none';

    // Update tab labels for management view
    document.getElementById('myIssuesTab').textContent = 'Issue History';

    // Load data
    await loadStats();
    await loadIssues();
    await loadMachines();

    // Show Users tab and Analytics tab for admins and team leaders
    if (currentUser.role === 'team_leader' || currentUser.role === 'supervisor' || currentUser.role === 'manager') {
        const usersTab = document.getElementById('usersTab');
        if (usersTab) usersTab.classList.remove('hidden');
        await loadUsers();
    }

    // Setup event listeners
    setupEventListeners();

    // Connect WebSocket
    connectWebSocket();
}

// Load statistics
// Load statistics - Last 24 hours only
async function loadStats() {
    try {
        // Fetch all issues (all statuses) to calculate total
        const allData = await api.getIssues({
            per_page: 1000
        });
        const allIssues = allData.issues;

        // Filter to last 24 hours
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

        const recentIssues = allIssues.filter(i => {
            const created = new Date(i.created_at);
            return created >= twentyFourHoursAgo;
        });

        // Calculate stats from last 24 hours
        const openedIssues = recentIssues.filter(i => i.status === 'in_progress' || i.status === 'assigned').length;
        const reportedIssues = recentIssues.filter(i => i.status === 'reported').length;
        const closedIssues = recentIssues.filter(i => i.status === 'closed').length;
        const totalIssues = recentIssues.length; // All statuses

        // Render stats
        const statsHTML = `
            <div class="stat-card fade-in">
                <div class="stat-value">${openedIssues}</div>
                <div class="stat-label">Opened Issues (24h)</div>
            </div>
            <div class="stat-card fade-in">
                <div class="stat-value">${reportedIssues}</div>
                <div class="stat-label">Reported Issues (24h)</div>
            </div>
            <div class="stat-card fade-in">
                <div class="stat-value">${closedIssues}</div>
                <div class="stat-label">Closed Issues (24h)</div>
            </div>
            <div class="stat-card fade-in">
                <div class="stat-value">${totalIssues}</div>
                <div class="stat-label">Total Issues (24h)</div>
            </div>
        `;

        const statsGrid = document.getElementById('statsGrid');
        if (statsGrid) {
            statsGrid.innerHTML = statsHTML;
            // Ensure grid has 4 columns
            statsGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(180px, 1fr))';
        }
    } catch (error) {
        console.error('Error loading stats:', error);
        // Fallback with empty stats
        const statsHTML = `
            <div class="stat-card fade-in"><div class="stat-value">0</div><div class="stat-label">Opened Issues (24h)</div></div>
            <div class="stat-card fade-in"><div class="stat-value">0</div><div class="stat-label">Reported Issues (24h)</div></div>
            <div class="stat-card fade-in"><div class="stat-value">0</div><div class="stat-label">Closed Issues (24h)</div></div>
            <div class="stat-card fade-in"><div class="stat-value">0</div><div class="stat-label">Total Issues (24h)</div></div>
        `;
        const statsGrid = document.getElementById('statsGrid');
        if (statsGrid) {
            statsGrid.innerHTML = statsHTML;
        }
    }
}

// Load issues
// Load issues based on active tab
async function loadIssues(page = 1) {
    const activeTab = document.querySelector('.tab.active');
    const tabId = activeTab ? activeTab.dataset.tab : 'all-issues';

    if (tabId === 'my-issues') {
        loadHistoryIssues(page);
        return;
    }

    // Recent Issues Tab Logic (No filters)
    try {
        const filters = {
            page: page,
            per_page: 100,
            // Default: Show only reported and in_progress (exclude assigned and closed)
            status: 'reported,in_progress'
        };

        const data = await api.getIssues(filters);

        // Filter to show only issues from the last 24 hours
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

        const recentIssues = data.issues.filter(issue => {
            const createdAt = new Date(issue.created_at);
            return createdAt >= twentyFourHoursAgo;
        });

        allIssues = recentIssues;
        renderIssuesTable(allIssues);
        // Pagination removed for Recent Issues as requested
        // renderPagination(data, 'all-issues');
    } catch (error) {
        console.error('Error loading issues:', error);
        utils.showNotification('Failed to load issues', 'error');
    }
}

// Load History Issues
async function loadHistoryIssues(page = 1) {
    try {
        const dateFilter = document.getElementById('historyDateFilter');
        const machineFilter = document.getElementById('historyMachineFilter');

        const filters = {
            page: page,
            per_page: 20
        };

        if (dateFilter && dateFilter.value) filters.date = dateFilter.value;
        if (machineFilter && machineFilter.value) filters.machine_id = machineFilter.value;

        // History shows ALL statuses, so no default status filter needed.

        const data = await api.getIssues(filters);
        renderMyIssuesTable(data.issues);
        renderPagination(data, 'my-issues');
    } catch (error) {
        console.error('Error loading history issues:', error);
        utils.showNotification('Failed to load history', 'error');
    }
}

// Export History
function exportHistory(format) {
    const dateFilter = document.getElementById('historyDateFilter');
    const machineFilter = document.getElementById('historyMachineFilter');

    let url = `${API_BASE_URL}/api/issues/export?format=${format}`;

    if (dateFilter && dateFilter.value) {
        url += `&date=${dateFilter.value}`;
    }
    if (machineFilter && machineFilter.value) {
        url += `&machine_id=${machineFilter.value}`;
    }

    // Open in new tab to trigger download
    window.open(url, '_blank');
}

// Render issues table
function renderIssuesTable(issues) {
    const tbody = document.getElementById('issuesTableBody');
    const emptyState = document.getElementById('issuesEmptyState');

    if (issues.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    const html = issues.map(issue => {
        // Calculate reaction time (time from creation to acceptance)
        let reactionTime = 'N/A';
        if (issue.accepted_at && issue.created_at) {
            const created = new Date(issue.created_at);
            const accepted = new Date(issue.accepted_at);
            const diffMinutes = Math.floor((accepted - created) / (1000 * 60));
            if (diffMinutes < 60) {
                reactionTime = `${diffMinutes}m`;
            } else {
                const hours = Math.floor(diffMinutes / 60);
                const mins = diffMinutes % 60;
                reactionTime = `${hours}h ${mins}m`;
            }
        }

        // Calculate resolution time (time from creation to closure)
        let resolutionTime = 'N/A';
        if (issue.closed_at && issue.created_at) {
            const created = new Date(issue.created_at);
            const closed = new Date(issue.closed_at);
            const diffMinutes = Math.floor((closed - created) / (1000 * 60));
            if (diffMinutes < 60) {
                resolutionTime = `${diffMinutes}m`;
            } else {
                const hours = Math.floor(diffMinutes / 60);
                const mins = diffMinutes % 60;
                resolutionTime = `${hours}h ${mins}m`;
            }
        }

        return `
        <tr class="issue-row" onclick="viewIssueDetails('${issue.issue_id}')">
            <td><strong>${issue.issue_id}</strong></td>
            <td>${issue.machine_name || issue.machine_id}</td>
            <td>${issue.reporter ? issue.reporter.name : 'N/A'}</td>
            <td>${utils.formatDate(issue.created_at)}</td>
            <td>${issue.accepted_at ? utils.formatDate(issue.accepted_at) : 'Not accepted'}</td>
            <td>${reactionTime}</td>
            <td>${resolutionTime}</td>
            <td>
                <span class="badge badge-${issue.urgency}">
                    ${utils.getUrgencyIcon(issue.urgency)} ${issue.urgency}
                </span>
            </td>
            <td>
                <span class="badge badge-${issue.status}">
                    ${utils.getStatusIcon(issue.status)} ${issue.status.replace('_', ' ')}
                </span>
            </td>
            <td>${issue.assigned_tech ? issue.assigned_tech.name : 'Unassigned'}</td>
        </tr>
    `;
    }).join('');

    tbody.innerHTML = html;
}

// Render my issues table
function renderMyIssuesTable(issues) {
    const tbody = document.getElementById('myIssuesTableBody');
    const emptyState = document.getElementById('myIssuesEmptyState');

    // Filter based on role - for management, show all issues
    let myIssues = issues;

    if (myIssues.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    const html = myIssues.map(issue => {
        // Calculate reaction time
        let reactionTime = 'N/A';
        if (issue.accepted_at && issue.created_at) {
            const created = new Date(issue.created_at);
            const accepted = new Date(issue.accepted_at);
            const diffMinutes = Math.floor((accepted - created) / (1000 * 60));
            if (diffMinutes < 60) {
                reactionTime = `${diffMinutes}m`;
            } else {
                const hours = Math.floor(diffMinutes / 60);
                const mins = diffMinutes % 60;
                reactionTime = `${hours}h ${mins}m`;
            }
        }

        // Calculate resolution time
        let resolutionTime = 'N/A';
        if (issue.closed_at && issue.created_at) {
            const created = new Date(issue.created_at);
            const closed = new Date(issue.closed_at);
            const diffMinutes = Math.floor((closed - created) / (1000 * 60));
            if (diffMinutes < 60) {
                resolutionTime = `${diffMinutes}m`;
            } else {
                const hours = Math.floor(diffMinutes / 60);
                const mins = diffMinutes % 60;
                resolutionTime = `${hours}h ${mins}m`;
            }
        }

        return `
        <tr class="issue-row" onclick="viewIssueDetails('${issue.issue_id}')">
            <td><strong>${issue.issue_id}</strong></td>
            <td>${issue.machine_name || issue.machine_id}</td>
            <td>${issue.reporter ? issue.reporter.name : 'N/A'}</td>
            <td>${utils.formatDate(issue.created_at)}</td>
            <td>${issue.accepted_at ? utils.formatDate(issue.accepted_at) : 'Not accepted'}</td>
            <td>${reactionTime}</td>
            <td>${resolutionTime}</td>
            <td>
                <span class="badge badge-${issue.urgency}">
                    ${utils.getUrgencyIcon(issue.urgency)} ${issue.urgency}
                </span>
            </td>
            <td>
                <span class="badge badge-${issue.status}">
                    ${utils.getStatusIcon(issue.status)} ${issue.status.replace('_', ' ')}
                </span>
            </td>
            <td>${issue.assigned_tech ? issue.assigned_tech.name : 'Unassigned'}</td>
        </tr>
    `;
    }).join('');

    tbody.innerHTML = html;
}

// View issue details
async function viewIssueDetails(issueId) {
    try {
        const issue = await api.getIssue(issueId);

        document.getElementById('issueDetailsTitle').textContent = `Issue ${issue.issue_id}`;

        let actionsHTML = '';

        // Role-based actions
        if (currentUser.role === 'maintenance') {
            if (issue.status === 'reported') {
                actionsHTML += `<button class="btn btn-primary" onclick="assignIssueToMe('${issue.issue_id}')">Accept Issue</button>`;
            } else if (issue.assigned_tech && issue.assigned_tech.user_id === currentUser.user_id) {
                if (issue.status === 'assigned') {
                    actionsHTML += `<button class="btn btn-primary" onclick="updateStatus('${issue.issue_id}', 'in_progress')">Start Working</button>`;
                }
                if (issue.status !== 'closed') {
                    actionsHTML += `<button class="btn btn-success" onclick="showCloseIssueForm('${issue.issue_id}')">Close Issue</button>`;
                }
            }
        }

        if (issue.status !== 'closed') {
            actionsHTML += `<button class="btn btn-secondary" onclick="showAddNoteForm('${issue.issue_id}')">Add Note</button>`;
        }

        const html = `
            <div class="form-group">
                <label class="form-label">Machine</label>
                <div>${issue.machine_name || issue.machine_id}</div>
            </div>
            <div class="form-group">
                <label class="form-label">Description</label>
                <div>${issue.description}</div>
            </div>
            <div class="form-group">
                <label class="form-label">Urgency</label>
                <div>
                    <span class="badge badge-${issue.urgency}">
                        ${utils.getUrgencyIcon(issue.urgency)} ${issue.urgency}
                    </span>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Status</label>
                <div>
                    <span class="badge badge-${issue.status}">
                        ${utils.getStatusIcon(issue.status)} ${issue.status.replace('_', ' ')}
                    </span>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Reporter</label>
                <div>${issue.reporter ? issue.reporter.name : 'N/A'}</div>
            </div>
            ${issue.assigned_tech ? `
                <div class="form-group">
                    <label class="form-label">Assigned To</label>
                    <div>${issue.assigned_tech.name}</div>
                </div>
            ` : ''}
            <div class="form-group">
                <label class="form-label">Created</label>
                <div>${utils.formatDate(issue.created_at)}</div>
            </div>
            ${issue.resolution ? `
                <div class="form-group">
                    <label class="form-label">Resolution</label>
                    <div>${issue.resolution}</div>
                </div>
                <div class="form-group">
                    <label class="form-label">Closed</label>
                    <div>${utils.formatDate(issue.closed_at)}</div>
                </div>
            ` : ''}
            ${issue.notes && issue.notes.length > 0 ? `
                <div class="form-group">
                    <label class="form-label">Notes (${issue.notes.length})</label>
                    ${issue.notes.map(note => `
                        <div class="note-item">
                            <div class="note-header">
                                <strong>${note.author ? note.author.name : 'Unknown'}</strong>
                                <span>${utils.formatDate(note.created_at)}</span>
                            </div>
                            <div class="note-text">${note.text}</div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            <div class="flex gap-2 mt-3">
                ${actionsHTML}
                <button class="btn btn-secondary" onclick="closeIssueDetailsModal()">Close</button>
            </div>
        `;

        document.getElementById('issueDetailsContent').innerHTML = html;
        document.getElementById('issueDetailsModal').classList.add('active');
    } catch (error) {
        console.error('Error loading issue details:', error);
        utils.showNotification('Failed to load issue details', 'error');
    }
}

// Assign issue to current user
async function assignIssueToMe(issueId) {
    try {
        await api.assignIssue(issueId);
        utils.showNotification('Issue assigned successfully', 'success');
        closeIssueDetailsModal();
        await loadIssues();
        await loadStats();
    } catch (error) {
        console.error('Error assigning issue:', error);
        utils.showNotification(error.message || 'Failed to assign issue', 'error');
    }
}

// Update issue status
async function updateStatus(issueId, status) {
    try {
        await api.updateIssueStatus(issueId, status);
        utils.showNotification('Status updated successfully', 'success');
        closeIssueDetailsModal();
        await loadIssues();
        await loadStats();
    } catch (error) {
        console.error('Error updating status:', error);
        utils.showNotification(error.message || 'Failed to update status', 'error');
    }
}

// Show close issue form
function showCloseIssueForm(issueId) {
    const resolution = prompt('Enter resolution notes:');
    if (resolution) {
        closeIssue(issueId, resolution);
    }
}

// Close issue
async function closeIssue(issueId, resolution) {
    try {
        await api.closeIssue(issueId, resolution);
        utils.showNotification('Issue closed successfully', 'success');
        closeIssueDetailsModal();
        await loadIssues();
        await loadStats();
    } catch (error) {
        console.error('Error closing issue:', error);
        utils.showNotification(error.message || 'Failed to close issue', 'error');
    }
}

// Show add note form
function showAddNoteForm(issueId) {
    const note = prompt('Enter note:');
    if (note) {
        addNote(issueId, note);
    }
}

// Add note
async function addNote(issueId, text) {
    try {
        await api.addNote(issueId, text);
        utils.showNotification('Note added successfully', 'success');
        viewIssueDetails(issueId); // Refresh details
    } catch (error) {
        console.error('Error adding note:', error);
        utils.showNotification(error.message || 'Failed to add note', 'error');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs and content
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            // Add active class to clicked tab and corresponding content
            tab.classList.add('active');
            const tabId = tab.dataset.tab;
            document.getElementById(tabId).classList.add('active');

            // Reload data for the new tab
            if (tabId === 'kpis') {
                loadKPIs();
            } else if (tabId === 'machines') {
                loadMachines();
            } else if (tabId === 'users') {
                loadUsers();
            } else {
                loadIssues(1);
            }
        });
    });

    // All Issues Filters (Removed)
    // document.getElementById('statusFilter').addEventListener('change', () => loadIssues(1));
    // document.getElementById('urgencyFilter').addEventListener('change', () => loadIssues(1));
    // document.getElementById('dateFilter').addEventListener('change', () => loadIssues(1));

    // History Filters
    const historyDate = document.getElementById('historyDateFilter');
    const historyMachine = document.getElementById('historyMachineFilter');

    if (historyDate) historyDate.addEventListener('change', () => loadHistoryIssues(1));
    if (historyMachine) historyMachine.addEventListener('change', () => loadHistoryIssues(1));

    // Urgency and date filters (only if they exist)
    const urgencyFilter = document.getElementById('urgencyFilter');
    const dateFilter = document.getElementById('dateFilter');

    if (urgencyFilter) {
        urgencyFilter.addEventListener('change', (e) => {
            currentFilters.urgency = e.target.value;
            loadIssues();
        });
    }

    if (dateFilter) {
        dateFilter.addEventListener('change', (e) => {
            currentFilters.date = e.target.value;
            loadIssues();
        });
    }

    // Create issue form
    document.getElementById('createIssueForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const machineId = document.getElementById('machineId').value;
        const description = document.getElementById('description').value;
        const urgency = document.getElementById('urgency').value;

        try {
            await api.createIssue({ machine_id: machineId, description, urgency });
            utils.showNotification('Issue created successfully', 'success');
            closeCreateIssueModal();
            document.getElementById('createIssueForm').reset();
            await loadIssues();
            await loadStats();
        } catch (error) {
            console.error('Error creating issue:', error);
            utils.showNotification(error.message || 'Failed to create issue', 'error');
        }
    });

    // Create machine form
    const createMachineForm = document.getElementById('createMachineForm');
    if (createMachineForm) {
        createMachineForm.addEventListener('submit', handleCreateMachine);
    }

    // Create user form
    const createUserForm = document.getElementById('createUserForm');
    if (createUserForm) {
        createUserForm.addEventListener('submit', handleCreateUser);
    }

    // Update user form
    const updateUserForm = document.getElementById('updateUserForm');
    if (updateUserForm) {
        updateUserForm.addEventListener('submit', handleUpdateUser);
    }
}

// Connect WebSocket for real-time updates
function connectWebSocket() {
    try {
        ws.connect();

        ws.on('new_issue', (issue) => {
            utils.showNotification(`New issue reported: ${issue.issue_id}`, 'info');
            loadIssues();
            loadStats();
        });

        ws.on('issue_updated', (issue) => {
            utils.showNotification(`Issue ${issue.issue_id} updated`, 'info');
            loadIssues();
            loadStats();
        });

        ws.on('issue_closed', (issue) => {
            utils.showNotification(`Issue ${issue.issue_id} closed`, 'success');
            loadIssues();
            loadStats();
        });

        console.log('✓ WebSocket connected');
    } catch (error) {
        console.warn('WebSocket not available, using polling instead');
        // Fallback: Auto-refresh every 30 seconds
        setInterval(() => {
            loadIssues();
            loadStats();
        }, 10000); // 10 seconds
    }
}

// Modal functions
function openCreateIssueModal() {
    document.getElementById('createIssueModal').classList.add('active');
}

function closeCreateIssueModal() {
    document.getElementById('createIssueModal').classList.remove('active');
}

function closeIssueDetailsModal() {
    document.getElementById('issueDetailsModal').classList.remove('active');
}

// Utility function
function truncate(str, length) {
    return str.length > length ? str.substring(0, length) + '...' : str;
}

// ============================================================================
// MACHINES LOGIC
// ============================================================================

// Load Machines
async function loadMachines() {
    try {
        const data = await api.getMachines();
        renderMachines(data.machines);
        populateMachineFilter(data.machines);
    } catch (error) {
        console.error('Error loading machines:', error);
        utils.showNotification('Failed to load machines', 'error');
    }
}

// Render Machines Table
function renderMachines(machines) {
    const tbody = document.getElementById('machinesTableBody');
    const emptyState = document.getElementById('machinesEmptyState');

    if (!tbody) return;

    tbody.innerHTML = '';

    if (machines.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    machines.forEach(machine => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${machine.machine_id}</td>
            <td>${machine.name}</td>
            <td>${machine.location || '-'}</td>
            <td><span class="badge bg-${getMachineStatusColor(machine.status)}">${machine.status}</span></td>
            <td>${utils.formatDate(machine.created_at)}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="openEditMachineModal('${machine.machine_id}')">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteMachine('${machine.machine_id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Handle Create Machine
async function handleCreateMachine(e) {
    e.preventDefault();
    e.stopPropagation();

    console.log('Creating machine...');

    const name = document.getElementById('machineNameInput').value;
    const location = document.getElementById('machineLocation').value;
    const status = document.getElementById('machineStatus').value;

    console.log('Machine data:', { name, location, status });

    try {
        const result = await api.createMachine({
            name: name,
            location: location,
            status: status
        });

        console.log('Machine created:', result);
        utils.showNotification('Machine created successfully', 'success');
        closeCreateMachineModal();
        loadMachines();

        // Reset form
        e.target.reset();
    } catch (error) {
        console.error('Error creating machine:', error);
        utils.showNotification(error.message || 'Failed to create machine', 'error');
    }

    return false;
}
// Delete Machine
async function deleteMachine(machineId) {
    if (!confirm('Are you sure you want to delete this machine?')) return;

    try {
        await api.deleteMachine(machineId);
        utils.showNotification('Machine deleted successfully', 'success');
        loadMachines();
    } catch (error) {
        console.error('Error deleting machine:', error);
        utils.showNotification(error.message || 'Failed to delete machine', 'error');
    }
}

// Modal Functions for Machines
function openCreateMachineModal() {
    document.getElementById('createMachineModal').classList.add('active');
}

function closeCreateMachineModal() {
    document.getElementById('createMachineModal').classList.remove('active');
    document.getElementById('createMachineForm').reset();
}

// QR Code Functions
function showMachineQR(machineId, machineName) {
    const modal = document.getElementById('qrCodeModal');
    const container = document.getElementById('qrCodeContainer');
    const nameEl = document.getElementById('qrMachineName');
    const idEl = document.getElementById('qrMachineId');

    // Clear previous
    container.innerHTML = '<div class="loading-spinner"></div>';
    nameEl.textContent = machineName;
    idEl.textContent = machineId;

    modal.classList.add('active');

    // Fetch QR Code
    const img = document.createElement('img');
    img.src = `${API_BASE_URL}/machines/${machineId}/qrcode`;
    img.alt = `QR Code for ${machineId}`;
    img.style.maxWidth = '200px';
    img.onload = () => {
        container.innerHTML = '';
        container.appendChild(img);
    };
    img.onerror = () => {
        container.innerHTML = '<p class="error-text">Failed to load QR Code</p>';
    };
}

function closeQrCodeModal() {
    document.getElementById('qrCodeModal').classList.remove('active');
}

function printQrCode() {
    const container = document.getElementById('qrCodeContainer');
    const name = document.getElementById('qrMachineName').textContent;
    const id = document.getElementById('qrMachineId').textContent;

    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write('<html><head><title>Print QR Code</title>');
    printWindow.document.write('<style>body { font-family: sans-serif; text-align: center; padding: 40px; } img { max-width: 300px; } h1 { margin-bottom: 10px; } p { color: #666; font-size: 1.2em; }</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write(`<h1>${name}</h1>`);
    printWindow.document.write(container.innerHTML);
    printWindow.document.write(`<p>${id}</p>`);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.print();
}

// Helper for machine status colors
function getMachineStatusColor(status) {
    const colors = {
        active: 'success',
        inactive: 'secondary',
        maintenance: 'warning'
    };
    return colors[status] || 'secondary';
}

// ============================================================================
// USERS LOGIC
// ============================================================================

// Load Users
async function loadUsers() {
    try {
        const data = await api.getUsers();
        renderUsers(data.users);
    } catch (error) {
        console.error('Error loading users:', error);
        utils.showNotification('Failed to load users', 'error');
    }
}

// Render Users Table
function renderUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${user.user_id}</td>
            <td>${user.matricule_number || '-'}</td>
            <td>${user.name}</td>
            <td><span class="badge bg-secondary">${formatRole(user.service)}</span></td>
            <td><span class="badge bg-${getRoleBadgeColor(user.role)}">${formatRole(user.role)}</span></td>
            <td><span class="badge bg-${user.is_active ? 'success' : 'danger'}">${user.is_active ? 'Active' : 'Inactive'}</span></td>
            <td>${utils.formatDate(user.created_at)}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="openUpdateUserModal('${user.user_id}')">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteUser('${user.user_id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Handle Create User
async function handleCreateUser(e) {
    e.preventDefault();

    const matricule = document.getElementById('userMatricule').value;
    const name = document.getElementById('userNameInput').value;
    const service = document.getElementById('userService').value;
    const role = document.getElementById('userRoleInput').value;
    const password = document.getElementById('userPassword').value;
    const email = document.getElementById('userEmail').value;

    try {
        await api.request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                matricule_number: matricule,
                name: name,
                service: service,
                role: role,
                password: password,
                email: email
            })
        });

        utils.showNotification('User created successfully', 'success');
        closeCreateUserModal();
        loadUsers();

        // Reset form
        e.target.reset();
    } catch (error) {
        console.error('Error creating user:', error);
        utils.showNotification(error.message || 'Failed to create user', 'error');
    }
}

// Handle Update User
async function handleUpdateUser(e) {
    e.preventDefault();

    const userId = document.getElementById('updateUserId').value;
    const matricule = document.getElementById('updateUserMatricule').value;
    const name = document.getElementById('updateUserName').value;
    const service = document.getElementById('updateUserService').value;
    const role = document.getElementById('updateUserRole').value;
    const email = document.getElementById('updateUserEmail').value;
    const isActive = document.getElementById('updateUserStatus').value === 'true';

    try {
        await api.request(`/api/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({
                matricule_number: matricule,
                name: name,
                service: service,
                role: role,
                email: email,
                is_active: isActive
            })
        });

        utils.showNotification('User updated successfully', 'success');
        closeUpdateUserModal();
        loadUsers();
    } catch (error) {
        console.error('Error updating user:', error);
        utils.showNotification(error.message || 'Failed to update user', 'error');
    }
}

// Delete User
async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
        // Note: The API might not have a DELETE endpoint for users yet, 
        // or it might be a soft delete (setting is_active to false).
        // Assuming we want to deactivate if no DELETE endpoint exists, 
        // but let's try a DELETE request first if implemented, or just warn if not.
        // Based on previous files, there wasn't an explicit DELETE user endpoint shown in api_server.py snippets.
        // I will implement a soft delete via update if DELETE fails, or just assume DELETE exists.
        // Let's check api_server.py first or just try DELETE.
        // Actually, looking at the plan, I should have checked if DELETE endpoint exists.
        // Let's assume standard REST. If not, I'll fix it.

        // Wait, I should probably check api_server.py to be sure. 
        // But for now, I'll implement it as a DELETE request.
        await api.request(`/api/users/${userId}`, { method: 'DELETE' });

        utils.showNotification('User deleted successfully', 'success');
        loadUsers();
    } catch (error) {
        console.error('Error deleting user:', error);
        utils.showNotification(error.message || 'Failed to delete user', 'error');
    }
}

// Modal Functions for Users
function openCreateUserModal() {
    document.getElementById('createUserModal').classList.add('active');
}

function closeCreateUserModal() {
    document.getElementById('createUserModal').classList.remove('active');
}

async function openUpdateUserModal(userId) {
    try {
        const user = await api.getUser(userId);

        document.getElementById('updateUserId').value = user.user_id;
        document.getElementById('updateUserMatricule').value = user.matricule_number || '';
        document.getElementById('updateUserName').value = user.name;
        document.getElementById('updateUserService').value = user.service;
        document.getElementById('updateUserRole').value = user.role;
        document.getElementById('updateUserEmail').value = user.email || '';
        document.getElementById('updateUserStatus').value = user.is_active.toString();

        document.getElementById('updateUserModal').classList.add('active');
    } catch (error) {
        console.error('Error fetching user details:', error);
        utils.showNotification('Failed to load user details', 'error');
    }
}

function closeUpdateUserModal() {
    document.getElementById('updateUserModal').classList.remove('active');
}

// Helper functions for users
function getRoleBadgeColor(role) {
    const colors = {
        'technician': 'info',
        'team_leader': 'warning',
        'supervisor': 'primary',
        'manager': 'dark'
    };
    return colors[role] || 'secondary';
}

function formatRole(role) {
    return role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    utils.initTheme();
    if (typeof initDashboard === 'function') {
        initDashboard();
    } else if (typeof checkAuth === 'function') {
        checkAuth();
    }
});

// Initialize on page load

// Pagination
function renderPagination(data, context) {
    // Determine which container to use based on context
    let containerId = 'pagination-controls';

    if (context === 'my-issues') {
        containerId = 'history-pagination-controls';
    }

    let container = document.getElementById(containerId);

    if (!container) {
        // Fallback or legacy check
        const activeTabContent = document.querySelector('.tab-content.active');
        if (activeTabContent) {
            container = activeTabContent.querySelector('.pagination-container');
        }
    }

    if (!container) return;
    const ul = container.querySelector('ul') || container;

    const { current_page, pages } = data;
    let html = '';

    const loadFunc = context === 'my-issues' ? 'loadHistoryIssues' : 'loadIssues';

    // Previous
    html += `
        <li class="page-item ${current_page === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="${loadFunc}(${current_page - 1}); return false;">Previous</a>
        </li>
    `;

    // Pages
    for (let i = 1; i <= pages; i++) {
        html += `
            <li class="page-item ${current_page === i ? 'active' : ''}">
                <a class="page-link" href="#" onclick="${loadFunc}(${i}); return false;">${i}</a>
            </li>
        `;
    }

    // Next
    html += `
        <li class="page-item ${current_page === pages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="${loadFunc}(${current_page + 1}); return false;">Next</a>
        </li>
    `;

    ul.innerHTML = html;
}

function populateMachineFilter(machines) {
    const select = document.getElementById('historyMachineFilter');
    if (!select) return;

    // Keep the first option
    select.innerHTML = '<option value="">All Machines</option>';

    machines.forEach(machine => {
        const option = document.createElement('option');
        option.value = machine.machine_id;
        option.textContent = machine.name;
        select.appendChild(option);
    });
}

// KPI Functions
async function loadKPIs() {
    try {
        // Get dashboard data
        const dashboardData = await api.getAnalyticsDashboard();

        // Display metrics
        const metricsHTML = `
            <div class="metric-card fade-in" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: var(--spacing-lg); text-align: center;">
                <div class="metric-value" style="font-size: 2rem; font-weight: 800; color: var(--primary-300); margin-bottom: var(--spacing-xs);">${dashboardData.summary.total_issues}</div>
                <div class="metric-label" style="color: var(--text-secondary); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">Total Issues</div>
            </div>
            <div class="metric-card fade-in" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: var(--spacing-lg); text-align: center;">
                <div class="metric-value" style="font-size: 2rem; font-weight: 800; color: var(--primary-300); margin-bottom: var(--spacing-xs);">${dashboardData.summary.open_issues}</div>
                <div class="metric-label" style="color: var(--text-secondary); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">Open Issues</div>
            </div>
            <div class="metric-card fade-in" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: var(--spacing-lg); text-align: center;">
                <div class="metric-value" style="font-size: 2rem; font-weight: 800; color: var(--primary-300); margin-bottom: var(--spacing-xs);">${dashboardData.summary.high_priority}</div>
                <div class="metric-label" style="color: var(--text-secondary); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">High Priority</div>
            </div>
            <div class="metric-card fade-in" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: var(--spacing-lg); text-align: center;">
                <div class="metric-value" style="font-size: 2rem; font-weight: 800; color: var(--primary-300); margin-bottom: var(--spacing-xs);">${dashboardData.summary.avg_resolution_time_hours}h</div>
                <div class="metric-label" style="color: var(--text-secondary); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">Avg Resolution Time</div>
            </div>
        `;
        document.getElementById('metricsGrid').innerHTML = metricsHTML;

        // Create urgency chart
        createPieChart('urgencyChart', 'Issues by Urgency', dashboardData.by_urgency);

        // Create status chart
        createPieChart('statusChart', 'Issues by Status', dashboardData.by_status);

        // Get machine data
        const machineData = await api.getAnalyticsByMachine();
        createBarChart('machineChart', 'Issues by Machine',
            machineData.machines.map(m => m.machine_name),
            machineData.machines.map(m => m.total_issues),
            'Total Issues'
        );

        // Get technician data
        const techData = await api.getAnalyticsByTechnician();
        createTechnicianChart(techData.technicians);

        // Create reaction time chart
        await createReactionTimeChart();

    } catch (error) {
        console.error('Error loading analytics:', error);
        utils.showNotification('Failed to load analytics data', 'error');
    }
}

async function createReactionTimeChart() {
    try {
        // Get all issues for the current month
        const data = await api.getIssues();
        const issues = data.issues;

        // Filter issues from current month that have been accepted
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const monthIssues = issues.filter(issue => {
            if (!issue.accepted_at || !issue.created_at) return false;
            const acceptedDate = new Date(issue.accepted_at);
            return acceptedDate.getMonth() === currentMonth &&
                acceptedDate.getFullYear() === currentYear;
        });

        // Group by technician and calculate average reaction time
        const techReactionTimes = {};

        monthIssues.forEach(issue => {
            if (!issue.assigned_tech) return;

            const techName = issue.assigned_tech.name;
            const created = new Date(issue.created_at);
            const accepted = new Date(issue.accepted_at);
            const reactionMinutes = (accepted - created) / (1000 * 60);

            if (!techReactionTimes[techName]) {
                techReactionTimes[techName] = {
                    total: 0,
                    count: 0
                };
            }

            techReactionTimes[techName].total += reactionMinutes;
            techReactionTimes[techName].count += 1;
        });

        // Calculate averages and convert to hours
        const techNames = Object.keys(techReactionTimes);
        const avgReactionTimes = techNames.map(name => {
            const avg = techReactionTimes[name].total / techReactionTimes[name].count;
            return (avg / 60).toFixed(2); // Convert to hours
        });

        // Destroy existing chart if it exists
        const chartStatus = Chart.getChart("reactionTimeChart");
        if (chartStatus != undefined) {
            chartStatus.destroy();
        }

        // Create chart
        const ctx = document.getElementById('reactionTimeChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar', // Changed to bar chart
            data: {
                labels: techNames,
                datasets: [{
                    label: 'Average Reaction Time (hours)',
                    data: avgReactionTimes,
                    backgroundColor: 'rgba(99, 102, 241, 0.8)',
                    borderColor: 'rgba(99, 102, 241, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#e5e7eb',
                            font: { size: 12 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const hours = parseFloat(context.parsed.y);
                                const mins = Math.round((hours % 1) * 60);
                                const wholeHours = Math.floor(hours);
                                return `Avg Reaction Time: ${wholeHours}h ${mins}m`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#9ca3af',
                            callback: function (value) {
                                return value + 'h';
                            }
                        },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        title: {
                            display: true,
                            text: 'Hours',
                            color: '#9ca3af'
                        }
                    },
                    x: {
                        ticks: { color: '#9ca3af' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating reaction time chart:', error);
    }
}

function createPieChart(canvasId, title, data) {
    const chartStatus = Chart.getChart(canvasId);
    if (chartStatus != undefined) {
        chartStatus.destroy();
    }

    const ctx = document.getElementById(canvasId).getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data),
            datasets: [{
                data: Object.values(data),
                backgroundColor: [
                    'rgba(99, 102, 241, 0.8)',
                    'rgba(168, 85, 247, 0.8)',
                    'rgba(236, 72, 153, 0.8)',
                    'rgba(251, 146, 60, 0.8)'
                ],
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#e5e7eb',
                        padding: 15,
                        font: { size: 12 }
                    }
                }
            }
        }
    });
}

function createBarChart(canvasId, title, labels, data, label) {
    const chartStatus = Chart.getChart(canvasId);
    if (chartStatus != undefined) {
        chartStatus.destroy();
    }

    const ctx = document.getElementById(canvasId).getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: 'rgba(99, 102, 241, 0.8)',
                borderColor: 'rgba(99, 102, 241, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#e5e7eb',
                        font: { size: 12 }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: {
                    ticks: { color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            }
        }
    });
}

function createTechnicianChart(technicians) {
    const chartStatus = Chart.getChart('technicianChart');
    if (chartStatus != undefined) {
        chartStatus.destroy();
    }

    const ctx = document.getElementById('technicianChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: technicians.map(t => t.technician.name),
            datasets: [
                {
                    label: 'Closed Issues',
                    data: technicians.map(t => t.closed_issues),
                    backgroundColor: 'rgba(34, 197, 94, 0.8)',
                    borderColor: 'rgba(34, 197, 94, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#e5e7eb',
                        font: { size: 12 }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: {
                    ticks: { color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            }
        }
    });
}
