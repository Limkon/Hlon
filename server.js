// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 8100; // 端口已修改为 8100

const BASH_EXECUTABLE = process.env.SR_BASH_PATH || '/bin/bash';

const USER_SCRIPTS_DIR = path.join(__dirname, 'user_scripts');
const DATA_DIR = path.join(__dirname, 'data'); // 新增：数据存储目录
const SCRIPTS_DB_PATH = path.join(DATA_DIR, 'scripts_db.json');
const TASKS_DB_PATH = path.join(DATA_DIR, 'tasks_db.json');

// 确保目录存在
[USER_SCRIPTS_DIR, DATA_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

app.use(express.json());
app.use(express.static('public'));

// 内存中的数据存储，现在会从文件加载并保存到文件
let scripts = []; // { id, name, type, filePath, cronExpression (用于UI显示) }
let scheduledTasks = []; // { id, scriptId, cronExpression, cronJob (node-cron实例) }

// --- 数据持久化函数 ---
function saveScriptsToFile() {
    try {
        fs.writeFileSync(SCRIPTS_DB_PATH, JSON.stringify(scripts, null, 2), 'utf8');
        console.log('脚本数据已保存到文件。');
    } catch (error) {
        console.error('保存脚本数据到文件失败:', error);
    }
}

function saveTasksToFile() {
    try {
        // 只保存任务定义，不保存活动的 cronJob 实例
        const tasksToSave = scheduledTasks.map(task => ({
            id: task.id,
            scriptId: task.scriptId,
            cronExpression: task.cronExpression
        }));
        fs.writeFileSync(TASKS_DB_PATH, JSON.stringify(tasksToSave, null, 2), 'utf8');
        console.log('定时任务数据已保存到文件。');
    } catch (error) {
        console.error('保存定时任务数据到文件失败:', error);
    }
}

function loadScriptsFromFile() {
    try {
        if (fs.existsSync(SCRIPTS_DB_PATH)) {
            const data = fs.readFileSync(SCRIPTS_DB_PATH, 'utf8');
            scripts = JSON.parse(data);
            console.log('脚本数据已从文件加载。');
        } else {
            scripts = []; // 文件不存在，则初始化为空数组
        }
    } catch (error) {
        console.error('从文件加载脚本数据失败:', error);
        scripts = []; // 加载失败也初始化为空数组
    }
}

// --- runScript 函数 (保持不变) ---
function runScript(scriptId) {
    return new Promise((resolve, reject) => {
        const script = scripts.find(s => s.id === scriptId);
        if (!script) {
            return reject({ status: 404, message: '脚本未找到' });
        }
        const scriptPath = script.filePath;
        if (!fs.existsSync(scriptPath)) {
            return reject({ status: 404, message: '脚本文件在磁盘上未找到' });
        }
        let command;
        let args = [];
        let spawnOptions = { env: process.env };
        if (script.type === 'sh') {
            command = BASH_EXECUTABLE;
            args.push(scriptPath);
        } else if (script.type === 'js') {
            command = 'node';
            args.push(scriptPath);
        } else {
            return reject({ status: 400, message: '不支持的脚本类型' });
        }
        console.log(`正在执行: ${command} ${args.join(' ')}`);
        const child = spawn(command, args, spawnOptions);
        let output = `运行脚本: ${script.name} (ID: ${scriptId})\n类型: ${script.type}\n路径: ${scriptPath}\n---------------------\n`;
        let errorOutput = '';
        child.stdout.on('data', (data) => { output += data.toString(); });
        child.stderr.on('data', (data) => { errorOutput += data.toString(); });
        child.on('close', (code) => {
            output += `\n---------------------\n脚本执行完毕，退出码 ${code}\n`;
            if (errorOutput) { output += `\n错误信息:\n${errorOutput}`; }
            console.log(`脚本 ${script.name} (ID: ${scriptId}) 执行完毕，退出码 ${code}.`);
            resolve({ output, code });
        });
        child.on('error', (err) => {
            console.error(`启动脚本 ${script.name} (ID: ${scriptId}) 失败:`, err);
            if (err.code === 'ENOENT') {
                 reject({ status: 500, message: `启动脚本失败: 无法找到执行程序 '${command}'。` });
            } else {
                reject({ status: 500, message: `启动脚本失败: ${err.message}` });
            }
        });
    });
}
// --- /runScript 函数 ---


// --- 帮助函数：用于创建和启动单个 cron 任务 ---
function scheduleCronTask(taskDefinition) {
    const scriptToRun = scripts.find(s => s.id === taskDefinition.scriptId);
    if (!scriptToRun) {
        console.error(`无法为任务 ${taskDefinition.id} 找到脚本 ${taskDefinition.scriptId}，跳过调度。`);
        return null;
    }

    if (!cron.validate(taskDefinition.cronExpression)) {
        console.error(`任务 ${taskDefinition.id} 的 Cron 表达式 "${taskDefinition.cronExpression}" 无效，跳过调度。`);
        return null;
    }

    try {
        const cronJob = cron.schedule(taskDefinition.cronExpression, async () => {
            console.log(`定时任务 ${taskDefinition.id} (脚本 ${scriptToRun.name}, ID: ${scriptToRun.id}) 已于 ${new Date()} 触发`);
            try {
                const result = await runScript(scriptToRun.id);
                console.log(`定时任务 ${scriptToRun.name} (任务ID: ${taskDefinition.id}) 输出:\n${result.output}`);
            } catch (err) {
                console.error(`运行定时脚本 ${scriptToRun.name} (任务ID: ${taskDefinition.id}) 错误:`, err.message);
            }
        });
        console.log(`任务已调度: ${taskDefinition.id} (脚本 ${scriptToRun.name}) Cron "${taskDefinition.cronExpression}"`);
        return { ...taskDefinition, cronJob }; // 返回包含 cronJob 实例的完整任务对象
    } catch (error) {
        console.error(`为任务 ${taskDefinition.id} 创建 cron.schedule 失败:`, error);
        return null;
    }
}

function loadTasksFromFileAndSchedule() {
    try {
        if (fs.existsSync(TASKS_DB_PATH)) {
            const data = fs.readFileSync(TASKS_DB_PATH, 'utf8');
            const taskDefinitions = JSON.parse(data);
            scheduledTasks = []; // 清空内存中的任务列表
            taskDefinitions.forEach(taskDef => {
                const fullTask = scheduleCronTask(taskDef);
                if (fullTask) {
                    scheduledTasks.push(fullTask);
                }
            });
            console.log('定时任务数据已从文件加载并重新调度。');
        } else {
            scheduledTasks = [];
        }
    } catch (error) {
        console.error('从文件加载或重新调度定时任务失败:', error);
        scheduledTasks = [];
    }
}


function getScriptFilePath(scriptId, scriptType) {
    return path.join(USER_SCRIPTS_DIR, `${scriptId}.${scriptType}`);
}


// --- API Endpoints for Scripts ---
app.get('/api/scripts', (req, res) => {
    res.json(scripts.map(s => ({ id: s.id, name: s.name, type: s.type, cronExpression: s.cronExpression })));
});

app.post('/api/scripts', (req, res) => {
    const { name, type, content } = req.body;
    if (!name || !type || typeof content !== 'string') {
        return res.status(400).json({ message: '脚本名称、类型和内容为必填项。' });
    }
    if (type !== 'js' && type !== 'sh') {
        return res.status(400).json({ message: '无效的脚本类型，必须是 "js" 或 "sh"。' });
    }
    const scriptId = uuidv4();
    const filePath = getScriptFilePath(scriptId, type);
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        const newScript = { id: scriptId, name, type, filePath, cronExpression: '' };
        scripts.push(newScript);
        saveScriptsToFile(); // 保存到文件
        console.log(`脚本已创建: ${name} (ID: ${scriptId})`);
        res.status(201).json(newScript);
    } catch (error) {
        console.error('创建脚本错误:', error);
        res.status(500).json({ message: '保存脚本文件失败。', error: error.message });
    }
});

app.get('/api/scripts/:id/content', (req, res) => {
    const script = scripts.find(s => s.id === req.params.id);
    if (!script) return res.status(404).json({ message: '脚本未找到' });
    try {
        const fileContent = fs.readFileSync(script.filePath, 'utf8');
        res.json({ id: script.id, name: script.name, type: script.type, content: fileContent });
    } catch (error) {
        console.error('读取脚本内容错误:', error);
        res.status(500).json({ message: '读取脚本内容失败。', error: error.message });
    }
});

app.put('/api/scripts/:id', (req, res) => {
    const scriptId = req.params.id;
    const { name, content } = req.body;
    const scriptIndex = scripts.findIndex(s => s.id === scriptId);
    if (scriptIndex === -1) return res.status(404).json({ message: '脚本未找到' });
    if (typeof content !== 'string' && !name) {
        return res.status(400).json({ message: '更新时必须提供脚本内容或名称。' });
    }
    const script = scripts[scriptIndex];
    try {
        if (typeof content === 'string') {
             fs.writeFileSync(script.filePath, content, 'utf8');
        }
        if (name) {
            script.name = name;
        }
        saveScriptsToFile(); // 保存到文件
        console.log(`脚本已更新: ${script.name} (ID: ${scriptId})`);
        res.json(script);
    } catch (error) {
        console.error('更新脚本错误:', error);
        res.status(500).json({ message: '更新脚本文件失败。', error: error.message });
    }
});

app.delete('/api/scripts/:id', (req, res) => {
    const scriptId = req.params.id;
    const scriptIndex = scripts.findIndex(s => s.id === scriptId);
    if (scriptIndex === -1) return res.status(404).json({ message: '脚本未找到' });

    // 删除与此脚本关联的定时任务
    const tasksForThisScript = scheduledTasks.filter(t => t.scriptId === scriptId);
    tasksForThisScript.forEach(task => {
        if (task.cronJob) task.cronJob.stop();
    });
    scheduledTasks = scheduledTasks.filter(t => t.scriptId !== scriptId);
    saveTasksToFile(); // 保存任务列表更改

    const script = scripts[scriptIndex];
    try {
        if (fs.existsSync(script.filePath)) {
            fs.unlinkSync(script.filePath); // 删除实际脚本文件
        }
        scripts.splice(scriptIndex, 1);
        saveScriptsToFile(); // 保存脚本列表更改
        console.log(`脚本已删除: ${script.name} (ID: ${scriptId})`);
        res.status(200).json({ message: '脚本及其关联的定时任务已成功删除' });
    } catch (error) {
        console.error('删除脚本文件错误:', error);
        scripts.splice(scriptIndex, 1); // 即使文件删除失败，也从列表中移除
        saveScriptsToFile();
        res.status(500).json({ message: '删除脚本文件失败，但已从列表中移除。', error: error.message });
    }
});

app.post('/api/scripts/:id/run', async (req, res) => {
    const scriptId = req.params.id;
    try {
        const result = await runScript(scriptId);
        res.json({ message: '脚本执行完毕。', output: result.output, exitCode: result.code });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// --- API Endpoints for Scheduled Tasks ---
app.get('/api/tasks', (req, res) => {
    res.json(scheduledTasks.map(task => ({
        id: task.id,
        scriptId: task.scriptId,
        scriptName: scripts.find(s => s.id === task.scriptId)?.name || 'N/A',
        cronExpression: task.cronExpression
    })));
});

app.post('/api/tasks', (req, res) => {
    const { scriptId, cronExpression } = req.body;
    if (!scriptId || !cronExpression) {
        return res.status(400).json({ message: '脚本ID和Cron表达式为必填项。' });
    }
    const script = scripts.find(s => s.id === scriptId);
    if (!script) return res.status(404).json({ message: '未找到要调度的脚本。' });
    if (!cron.validate(cronExpression)) {
        return res.status(400).json({ message: '无效的Cron表达式。' });
    }

    const taskDefinition = { id: uuidv4(), scriptId, cronExpression };
    const fullTask = scheduleCronTask(taskDefinition); // 使用辅助函数创建和调度

    if (fullTask) {
        scheduledTasks.push(fullTask);
        // 更新脚本对象上的 cronExpression (用于UI显示)
        const scriptIndex = scripts.findIndex(s => s.id === scriptId);
        if (scriptIndex !== -1) {
            scripts[scriptIndex].cronExpression = cronExpression;
            saveScriptsToFile();
        }
        saveTasksToFile();
        res.status(201).json({ id: fullTask.id, scriptId, scriptName: script.name, cronExpression });
    } else {
        res.status(500).json({ message: "创建或调度定时任务失败。" });
    }
});

app.delete('/api/tasks/:id', (req, res) => {
    const taskId = req.params.id;
    const taskIndex = scheduledTasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return res.status(404).json({ message: '定时任务未找到' });

    const task = scheduledTasks[taskIndex];
    if (task.cronJob) {
        task.cronJob.stop(); // 停止 cron job
    }
    
    // 清除关联脚本上的 cronExpression (用于UI显示)
    const scriptAssociated = scripts.find(s => s.id === task.scriptId);
    if (scriptAssociated) {
        // 如果没有其他任务调度此脚本，则清除 cronExpression
        const otherTasksForScript = scheduledTasks.some(t => t.scriptId === task.scriptId && t.id !== taskId);
        if (!otherTasksForScript) {
            scriptAssociated.cronExpression = '';
            saveScriptsToFile();
        }
    }

    scheduledTasks.splice(taskIndex, 1);
    saveTasksToFile(); // 保存更改后的任务列表
    console.log(`定时任务已删除: ${taskId}`);
    res.status(200).json({ message: '定时任务已成功删除' });
});

// --- Server Start ---
function startServer() {
    loadScriptsFromFile();
    loadTasksFromFileAndSchedule(); // 加载并重新调度任务

    app.listen(port, () => {
        console.log(`简易脚本运行器正在监听 http://localhost:${port}`); // 端口已修改
        console.log(`将使用 Bash 执行器: ${BASH_EXECUTABLE}`);
        console.warn("数据将保存在JSON文件中。简单的错误处理和并发控制。");
    });
}

startServer();
