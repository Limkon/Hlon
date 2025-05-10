// public/app.js
document.addEventListener('DOMContentLoaded', () => {
    const scriptForm = document.getElementById('scriptForm');
    const editScriptIdInput = document.getElementById('editScriptId');
    const scriptNameInput = document.getElementById('scriptName');
    const scriptTypeInput = document.getElementById('scriptType');
    const scriptContentInput = document.getElementById('scriptContent');
    const scriptFileInput = document.getElementById('scriptFile');
    const saveScriptButton = document.getElementById('saveScriptButton');
    const clearScriptFormButton = document.getElementById('clearScriptFormButton');
    const toggleEditorButton = document.getElementById('toggleEditorButton');
    
    const scriptsList = document.getElementById('scriptsList');
    const taskForm = document.getElementById('taskForm');
    const taskScriptIdSelect = document.getElementById('taskScriptId');
    const cronExpressionInput = document.getElementById('cronExpression');
    const tasksList = document.getElementById('tasksList');
    const scriptOutput = document.getElementById('scriptOutput');

    const API_BASE_URL = '';

    if (toggleEditorButton && scriptContentInput) {
        toggleEditorButton.addEventListener('click', () => {
            scriptContentInput.classList.toggle('expanded');
            if (scriptContentInput.classList.contains('expanded')) {
                toggleEditorButton.textContent = '收起代码编辑框';
            } else {
                toggleEditorButton.textContent = '展开代码编辑框';
            }
        });
    }

    async function fetchScripts() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/scripts`);
            const scripts = await response.json();
            renderScripts(scripts);
            populateTaskScriptSelect(scripts);
        } catch (error) {
            console.error('获取脚本列表错误:', error);
            scriptOutput.textContent = `获取脚本列表错误: ${error.message}`;
        }
    }

    function renderScripts(scripts) {
        scriptsList.innerHTML = '';
        scripts.forEach(script => {
            const li = document.createElement('li');
            const cronInfo = script.cronExpression ? ` [已调度: ${script.cronExpression}]` : '';
            li.innerHTML = `
                <span>${script.name} (${script.type})${cronInfo}</span>
                <div>
                    <button class="run" data-id="${script.id}">运行</button>
                    <button data-id="${script.id}" class="edit-script">编辑</button>
                    <button class="delete" data-id="${script.id}">删除</button>
                </div>
            `;
            scriptsList.appendChild(li);
        });
    }
    
    function populateTaskScriptSelect(scripts) {
        taskScriptIdSelect.innerHTML = '<option value="">-- 选择脚本 --</option>';
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
        const file = scriptFileInput.files[0];

        if (!type) {
            alert("请选择脚本类型。");
            return;
        }
        if (!file && !content.trim()) {
            alert("请输入脚本内容或选择一个脚本文件上传。");
            return;
        }

        const formData = new FormData();
        formData.append('name', name);
        formData.append('type', type);

        if (file) {
            formData.append('scriptFile', file);
        } else {
            formData.append('content', content);
        }

        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_BASE_URL}/api/scripts/${id}` : `${API_BASE_URL}/api/scripts`;

        try {
            const response = await fetch(url, { method: method, body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || `HTTP错误！状态: ${response.status}`);
            scriptOutput.textContent = id ? `脚本已更新: ${result.name}` : `脚本已添加: ${result.name}`;
            resetScriptForm();
            fetchScripts();
        } catch (error) {
            console.error('保存脚本错误:', error);
            scriptOutput.textContent = `保存脚本错误: ${error.message}`;
        }
    });

    function resetScriptForm() {
        editScriptIdInput.value = '';
        scriptNameInput.value = '';
        scriptTypeInput.value = '';
        scriptContentInput.value = '';
        scriptFileInput.value = '';
        saveScriptButton.textContent = '添加/更新脚本';
        clearScriptFormButton.classList.add('hidden');
        if (scriptContentInput.classList.contains('expanded')) {
            scriptContentInput.classList.remove('expanded');
        }
        if (toggleEditorButton) {
             toggleEditorButton.textContent = '展开代码编辑框';
        }
    }

    clearScriptFormButton.addEventListener('click', resetScriptForm);

    scriptsList.addEventListener('click', async (e) => {
        const target = e.target;
        const scriptId = target.dataset.id;

        if (target.classList.contains('run')) {
            scriptOutput.textContent = `正在运行脚本 ${scriptId}...`;
            try {
                const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/run`, { method: 'POST' });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message || `HTTP错误！状态: ${response.status}`);
                scriptOutput.textContent = result.output || '未收到输出。';
            } catch (error) { scriptOutput.textContent = `运行脚本错误: ${error.message}`; }
        } else if (target.classList.contains('delete')) {
            if (confirm('您确定要删除此脚本及其关联的定时任务吗？')) {
                try {
                    const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}`, { method: 'DELETE' });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.message || `HTTP错误！状态: ${response.status}`);
                    scriptOutput.textContent = result.message;
                    fetchScripts(); fetchTasks();
                } catch (error) { scriptOutput.textContent = `删除脚本错误: ${error.message}`; }
            }
        } else if (target.classList.contains('edit-script')) {
            try {
                const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/content`);
                const script = await response.json();
                if (!response.ok) throw new Error(script.message || `HTTP错误！状态: ${response.status}`);
                editScriptIdInput.value = script.id;
                scriptNameInput.value = script.name;
                scriptTypeInput.value = script.type;
                scriptContentInput.value = script.content;
                scriptFileInput.value = '';
                saveScriptButton.textContent = '更新脚本';
                clearScriptFormButton.classList.remove('hidden');
                if (!scriptContentInput.classList.contains('expanded') && toggleEditorButton) {
                     scriptContentInput.classList.add('expanded');
                     toggleEditorButton.textContent = '收起代码编辑框';
                }
                window.scrollTo(0,0);
            } catch (error) { scriptOutput.textContent = `获取脚本内容错误: ${error.message}`; }
        }
    });
    
    async function fetchTasks() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/tasks`);
            const tasks = await response.json();
            renderTasks(tasks);
        } catch (error) { scriptOutput.textContent = `获取定时任务列表错误: ${error.message}`; }
    }
    function renderTasks(tasks) {
        tasksList.innerHTML = '';
        tasks.forEach(task => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>脚本: "${task.scriptName}" (ID: ${task.scriptId}) - Cron: ${task.cronExpression}</span>
                <button class="delete" data-id="${task.id}">删除任务</button>
            `;
            tasksList.appendChild(li);
        });
    }
    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const scriptId = taskScriptIdSelect.value;
        const cron = cronExpressionInput.value;
        if (!scriptId) { alert("请选择一个脚本。"); return; }
        try {
            const response = await fetch(`${API_BASE_URL}/api/tasks`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scriptId, cronExpression: cron })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || `HTTP错误！状态: ${response.status}`);
            scriptOutput.textContent = `已为脚本 ${result.scriptName} 调度任务。`;
            cronExpressionInput.value = ''; taskScriptIdSelect.value = '';
            fetchTasks(); fetchScripts();
        } catch (error) { scriptOutput.textContent = `调度任务错误: ${error.message}`; }
    });
    tasksList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete')) {
            const taskId = e.target.dataset.id;
            if (confirm('您确定要删除此定时任务吗？')) {
                try {
                    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, { method: 'DELETE' });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.message || `HTTP错误！状态: ${response.status}`);
                    scriptOutput.textContent = result.message;
                    fetchTasks(); fetchScripts();
                } catch (error) { scriptOutput.textContent = `删除任务错误: ${error.message}`; }
            }
        }
    });

    fetchScripts();
    fetchTasks();
});
