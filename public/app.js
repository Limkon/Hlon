// public/app.js
document.addEventListener('DOMContentLoaded', () => {
    const scriptForm = document.getElementById('scriptForm');
    const editScriptIdInput = document.getElementById('editScriptId');
    const scriptNameInput = document.getElementById('scriptName');
    const scriptTypeInput = document.getElementById('scriptType');
    const scriptContentInput = document.getElementById('scriptContent');
    const saveScriptButton = document.getElementById('saveScriptButton');
    const clearScriptFormButton = document.getElementById('clearScriptFormButton');
    
    const scriptsList = document.getElementById('scriptsList');
    const taskForm = document.getElementById('taskForm');
    const taskScriptIdSelect = document.getElementById('taskScriptId');
    const cronExpressionInput = document.getElementById('cronExpression');
    const tasksList = document.getElementById('tasksList');
    const scriptOutput = document.getElementById('scriptOutput');

    const API_BASE_URL = ''; // Assuming same origin

    // --- Script Management ---

    async function fetchScripts() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/scripts`);
            const scripts = await response.json();
            renderScripts(scripts);
            populateTaskScriptSelect(scripts);
        } catch (error) {
            console.error('Error fetching scripts:', error);
            scriptOutput.textContent = `Error fetching scripts: ${error.message}`;
        }
    }

    function renderScripts(scripts) {
        scriptsList.innerHTML = '';
        scripts.forEach(script => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${script.name} (${script.type}) ${script.cronExpression ? `[Scheduled: ${script.cronExpression}]` : ''}</span>
                <div>
                    <button class="run" data-id="${script.id}">Run</button>
                    <button data-id="${script.id}" class="edit-script">Edit</button>
                    <button class="delete" data-id="${script.id}">Delete</button>
                </div>
            `;
            scriptsList.appendChild(li);
        });
    }
    
    function populateTaskScriptSelect(scripts) {
        taskScriptIdSelect.innerHTML = '<option value="">-- Select Script --</option>';
        scripts.forEach(script => {
            const option = document.createElement('option');
            option.value = script.id;
            option.textContent = `${script.name} (${script.type})`;
            taskScriptIdSelect.appendChild(option);
        });
    }

    scriptForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = editScriptIdInput.value;
        const name = scriptNameInput.value;
        const type = scriptTypeInput.value;
        const content = scriptContentInput.value;

        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_BASE_URL}/api/scripts/${id}` : `${API_BASE_URL}/api/scripts`;

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, type, content })
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || `HTTP error! status: ${response.status}`);
            }
            scriptOutput.textContent = id ? `Script updated: ${result.name}` : `Script added: ${result.name}`;
            resetScriptForm();
            fetchScripts();
        } catch (error) {
            console.error('Error saving script:', error);
            scriptOutput.textContent = `Error saving script: ${error.message}`;
        }
    });

    function resetScriptForm() {
        editScriptIdInput.value = '';
        scriptNameInput.value = '';
        // scriptTypeInput.value = 'js'; // Keep type or reset
        scriptContentInput.value = '';
        saveScriptButton.textContent = 'Add Script';
        clearScriptFormButton.classList.add('hidden');
    }

    clearScriptFormButton.addEventListener('click', resetScriptForm);

    scriptsList.addEventListener('click', async (e) => {
        const target = e.target;
        const scriptId = target.dataset.id;

        if (target.classList.contains('run')) {
            scriptOutput.textContent = `Running script ${scriptId}...`;
            try {
                const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/run`, { method: 'POST' });
                const result = await response.json();
                 if (!response.ok) {
                    throw new Error(result.message || `HTTP error! status: ${response.status}`);
                }
                scriptOutput.textContent = result.output || 'No output received.';
            } catch (error) {
                console.error('Error running script:', error);
                scriptOutput.textContent = `Error running script: ${error.message}`;
            }
        } else if (target.classList.contains('delete')) {
            if (confirm('Are you sure you want to delete this script and its scheduled tasks?')) {
                try {
                    const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}`, { method: 'DELETE' });
                    const result = await response.json();
                    if (!response.ok) {
                        throw new Error(result.message || `HTTP error! status: ${response.status}`);
                    }
                    scriptOutput.textContent = result.message;
                    fetchScripts();
                    fetchTasks(); // Refresh tasks as associated tasks might be deleted
                } catch (error) {
                    console.error('Error deleting script:', error);
                    scriptOutput.textContent = `Error deleting script: ${error.message}`;
                }
            }
        } else if (target.classList.contains('edit-script')) {
            try {
                const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/content`);
                const script = await response.json();
                if (!response.ok) {
                    throw new Error(script.message || `HTTP error! status: ${response.status}`);
                }
                editScriptIdInput.value = script.id;
                scriptNameInput.value = script.name;
                scriptTypeInput.value = script.type;
                scriptContentInput.value = script.content;
                saveScriptButton.textContent = 'Update Script';
                clearScriptFormButton.classList.remove('hidden');
                window.scrollTo(0,0); // Scroll to top to see the form
            } catch (error) {
                console.error('Error fetching script content for edit:', error);
                scriptOutput.textContent = `Error fetching script content: ${error.message}`;
            }
        }
    });


    // --- Task Management ---

    async function fetchTasks() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/tasks`);
            const tasks = await response.json();
            renderTasks(tasks);
        } catch (error) {
            console.error('Error fetching tasks:', error);
            scriptOutput.textContent = `Error fetching tasks: ${error.message}`;
        }
    }

    function renderTasks(tasks) {
        tasksList.innerHTML = '';
        tasks.forEach(task => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>Script: "${task.scriptName}" (ID: ${task.scriptId}) - Cron: ${task.cronExpression}</span>
                <button class="delete" data-id="${task.id}">Delete Task</button>
            `;
            tasksList.appendChild(li);
        });
    }

    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const scriptId = taskScriptIdSelect.value;
        const cron = cronExpressionInput.value;
        if (!scriptId) {
            alert("Please select a script.");
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/api/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scriptId, cronExpression: cron })
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || `HTTP error! status: ${response.status}`);
            }
            scriptOutput.textContent = `Task scheduled for script ${result.scriptName}.`;
            cronExpressionInput.value = '';
            taskScriptIdSelect.value = '';
            fetchTasks();
            fetchScripts(); // Refresh scripts to show updated cron info
        } catch (error) {
            console.error('Error scheduling task:', error);
            scriptOutput.textContent = `Error scheduling task: ${error.message}`;
        }
    });

    tasksList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete')) {
            const taskId = e.target.dataset.id;
            if (confirm('Are you sure you want to delete this scheduled task?')) {
                try {
                    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, { method: 'DELETE' });
                    const result = await response.json();
                    if (!response.ok) {
                        throw new Error(result.message || `HTTP error! status: ${response.status}`);
                    }
                    scriptOutput.textContent = result.message;
                    fetchTasks();
                    fetchScripts(); // Refresh scripts to show updated cron info
                } catch (error) {
                    console.error('Error deleting task:', error);
                    scriptOutput.textContent = `Error deleting task: ${error.message}`;
                }
            }
        }
    });

    // Initial data load
    fetchScripts();
    fetchTasks();
});
