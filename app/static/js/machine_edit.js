// Machine Edit Functions
async function openEditMachineModal(machineId) {
    try {
        const machine = await api.getMachine(machineId);

        document.getElementById('editMachineId').value = machine.machine_id;
        document.getElementById('editMachineName').value = machine.name;
        document.getElementById('editMachineLocation').value = machine.location || '';
        document.getElementById('editMachineStatus').value = machine.status;

        document.getElementById('editMachineModal').classList.add('active');
    } catch (error) {
        console.error('Error loading machine details:', error);
        utils.showNotification('Failed to load machine details', 'error');
    }
}

function closeEditMachineModal() {
    document.getElementById('editMachineModal').classList.remove('active');
    document.getElementById('editMachineForm').reset();
}

async function handleEditMachine(e) {
    e.preventDefault();

    const machineId = document.getElementById('editMachineId').value;
    const name = document.getElementById('editMachineName').value;
    const location = document.getElementById('editMachineLocation').value;
    const status = document.getElementById('editMachineStatus').value;

    try {
        await api.updateMachine(machineId, {
            name: name,
            location: location,
            status: status
        });

        utils.showNotification('Machine updated successfully', 'success');
        closeEditMachineModal();
        loadMachines();
    } catch (error) {
        console.error('Error updating machine:', error);
        utils.showNotification(error.message || 'Failed to update machine', 'error');
    }
}
