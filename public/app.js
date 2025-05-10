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

    const API_BASE_URL = '';

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
                throw new Error(result.message || `HTTP错误！状态: ${response.status}`);
            }
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
        scriptContentInput.value = '';
        saveScriptButton.textContent = '添加脚本'; // 保持按钮文本一致性
        clearScriptFormButton.classList.add('hidden');
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
                 if (!response.ok) {
                    throw new Error(result.message || `HTTP错误！状态: ${response.status}`);
                }
                scriptOutput.textContent = result.output || '未收到输出。';
            } catch (error) {
                console.error('运行脚本错误:', error);
                scriptOutput.textContent = `运行脚本错误: ${error.message}`;
            }
        } else if (target.classList.contains('delete')) {
            if (confirm('您确定要删除此脚本及其关联的定时任务吗？')) {
                try {
                    const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}`, { method: 'DELETE' });
                    const result = await response.json();
                    if (!response.ok) {
                        throw new Error(result.message || `HTTP错误！状态: ${response.status}`);
                    }
                    scriptOutput.textContent = result.message; // 显示服务器返回的中文消息
                    fetchScripts();
                    fetchTasks();
                } catch (error) {
                    console.error('删除脚本错误:', error);
                    scriptOutput.textContent = `删除脚本错误: ${error.message}`;
                }
            }
        } else if (target.classList.contains('edit-script')) {
            try {
                const response = await fetch(`${API_BASE_URL}/api/scripts/${scriptId}/content`);
                const script = await response.json();
                if (!response.ok) {
                    throw new Error(script.message || `HTTP错误！状态: ${response.status}`);
                }
                editScriptIdInput.value = script.id;
                scriptNameInput.value = script.name;
                scriptTypeInput.value = script.type;
                scriptContentInput.value = script.content;
                saveScriptButton.textContent = '更新脚本'; // 更新按钮文本
                clearScriptFormButton.classList.remove('hidden');
                window.scrollTo(0,0);
            } catch (error) {
                console.error('获取脚本内容以编辑时出错:', error);
                scriptOutput.textContent = `获取脚本内容错误: ${error.message}`;
            }
        }
    });

    async function fetchTasks() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/tasks`);
            const tasks = await response.json();
            renderTasks(tasks);
        } catch (error)
        {
            console.error('获取定时任务列表错误:', error);
            scriptOutput.textContent = `获取定时任务列表错误: ${error.message}`;
        }
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
        if (!scriptId) {
            alert("请选择一个脚本。");
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
                throw new Error(result.message || `HTTP错误！状态: ${response.status}`);
            }
            scriptOutput.textContent = `已为脚本 ${result.scriptName} 调度任务。`;
            cronExpressionInput.value = '';
            taskScriptIdSelect.value = '';
            fetchTasks();
            fetchScripts(); // 刷新脚本列表以显示可能更新的 cron 表达式信息
        } catch (error) {
            console.error('调度任务错误:', error);
            scriptOutput.textContent = `调度任务错误: ${error.message}`;
        }
    });

    tasksList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete')) {
            const taskId = e.target.dataset.id;
            if (confirm('您确定要删除此定时任务吗？')) {
                try {
                    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, { method: 'DELETE' });
                    const result = await response.json();
                    if (!response.ok) {
                        throw new Error(result.message || `HTTP错误！状态: ${response.status}`);
                    }
                    scriptOutput.textContent = result.message; // 显示服务器返回的中文消息
                    fetchTasks();
                    fetchScripts(); // 刷新脚本列表
                } catch (error) {
                    console.error('删除任务错误:', error);
                    scriptOutput.textContent = `删除任务错误: ${error.message}`;
                }
            }
        }
    });

    // 初始加载数据
    fetchScripts();
    fetchTasks();
});
