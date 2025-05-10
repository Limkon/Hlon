// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid'); // For generating unique IDs

const app = express();
const port = 3000;

const USER_SCRIPTS_DIR = path.join(__dirname, 'user_scripts');
if (!fs.existsSync(USER_SCRIPTS_DIR)) {
    fs.mkdirSync(USER_SCRIPTS_DIR, { recursive: true });
}

app.use(express.json());
app.use(express.static('public'));

let scripts = [];
let scheduledTasks = [];

function getScriptFilePath(scriptId, scriptType) {
    return path.join(USER_SCRIPTS_DIR, `${scriptId}.${scriptType}`);
}

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

        if (script.type === 'sh') {
            command = 'sh';
            args.push(scriptPath);
        } else if (script.type === 'js') {
            command = 'node';
            args.push(scriptPath);
        } else {
            return reject({ status: 400, message: '不支持的脚本类型' });
        }

        console.log(`正在执行: ${command} ${args.join(' ')}`);
        const child = spawn(command, args);
        let output = `运行脚本: ${script.name} (ID: ${scriptId})\n类型: ${script.type}\n路径: ${scriptPath}\n---------------------\n`;
        let errorOutput = '';

        child.stdout.on('data', (data) => {
            output += data.toString();
        });

        child.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        child.on('close', (code) => {
            output += `\n---------------------\n脚本执行完毕，退出码 ${code}\n`;
            if (errorOutput) {
                output += `\n错误信息:\n${errorOutput}`;
            }
            console.log(`脚本 ${script.name} (ID: ${scriptId}) 执行完毕，退出码 ${code}.`);
            resolve({ output, code });
        });

        child.on('error', (err) => {
            console.error(`启动脚本 ${script.name} (ID: ${scriptId}) 失败:`, err);
            reject({ status: 500, message: `启动脚本失败: ${err.message}` });
        });
    });
}

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
        console.log(`脚本已创建: ${name} (ID: ${scriptId})`);
        res.status(201).json(newScript);
    } catch (error) {
        console.error('创建脚本错误:', error);
        res.status(500).json({ message: '保存脚本文件失败。', error: error.message });
    }
});

app.get('/api/scripts/:id/content', (req, res) => {
    const script = scripts.find(s => s.id === req.params.id);
    if (!script) {
        return res.status(404).json({ message: '脚本未找到' });
    }
    try {
        const content = fs.readFileSync(script.filePath, 'utf8');
        res.json({ id: script.id, name: script.name, type: script.type, content });
    } catch (error) {
        console.error('读取脚本内容错误:', error);
        res.status(500).json({ message: '读取脚本内容失败。', error: error.message });
    }
});

app.put('/api/scripts/:id', (req, res) => {
    const scriptId = req.params.id;
    const { name, content } = req.body;

    const scriptIndex = scripts.findIndex(s => s.id === scriptId);
    if (scriptIndex === -1) {
        return res.status(404).json({ message: '脚本未找到' });
    }

    if (typeof content !== 'string' && !name) {
        return res.status(400).json({ message: '更新时必须提供脚本内容或名称。' });
    }
    
    const script = scripts[scriptIndex];

    try {
        if (typeof content === 'string') {
             fs.writeFileSync(script.filePath, content, 'utf8');
             script.contentHash = uuidv4();
        }
        if (name) {
            script.name = name;
        }
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
    if (scriptIndex === -1) {
        return res.status(404).json({ message: '脚本未找到' });
    }

    const tasksToDelete = scheduledTasks.filter(t => t.scriptId === scriptId);
    tasksToDelete.forEach(task => {
        if (task.cronJob) task.cronJob.stop();
    });
    scheduledTasks = scheduledTasks.filter(t => t.scriptId !== scriptId);

    const script = scripts[scriptIndex];
    try {
        if (fs.existsSync(script.filePath)) {
            fs.unlinkSync(script.filePath);
        }
        scripts.splice(scriptIndex, 1);
        console.log(`脚本已删除: ${script.name} (ID: ${scriptId})`);
        res.status(200).json({ message: '脚本及其关联的定时任务已成功删除' });
    } catch (error) {
        console.error('删除脚本文件错误:', error);
        scripts.splice(scriptIndex, 1);
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
    if (!script) {
        return res.status(404).json({ message: '未找到要调度的脚本。' });
    }

    if (!cron.validate(cronExpression)) {
        return res.status(400).json({ message: '无效的Cron表达式。' });
    }

    const taskId = uuidv4();
    try {
        const cronJob = cron.schedule(cronExpression, async () => {
            console.log(`定时任务 ${taskId} (脚本 ${script.name}, ID: ${scriptId}) 已于 ${new Date()} 触发`);
            try {
                const result = await runScript(scriptId);
                console.log(`定时任务 ${script.name} (任务ID: ${taskId}) 输出:\n${result.output}`);
            } catch (err) {
                console.error(`运行定时脚本 ${script.name} (任务ID: ${taskId}) 错误:`, err.message);
            }
        });

        const newTask = { id: taskId, scriptId, cronExpression, cronJob };
        scheduledTasks.push(newTask);
        script.cronExpression = cronExpression;
        console.log(`任务已创建: ${taskId} (脚本 ${script.name}) Cron表达式 "${cronExpression}"`);
        res.status(201).json({ id: taskId, scriptId, scriptName: script.name, cronExpression });
    } catch (error) {
        console.error("创建定时任务失败:", error);
        res.status(500).json({ message: "创建定时任务失败。", error: error.message });
    }
});

app.delete('/api/tasks/:id', (req, res) => {
    const taskId = req.params.id;
    const taskIndex = scheduledTasks.findIndex(t => t.id === taskId);

    if (taskIndex === -1) {
        return res.status(404).json({ message: '定时任务未找到' });
    }

    const task = scheduledTasks[taskIndex];
    if (task.cronJob) {
        task.cronJob.stop();
    }

    const script = scripts.find(s => s.id === task.scriptId);
    if(script) script.cronExpression = '';

    scheduledTasks.splice(taskIndex, 1);
    console.log(`定时任务已删除: ${taskId}`);
    res.status(200).json({ message: '定时任务已成功删除' });
});

app.listen(port, () => {
    console.log(`简易脚本运行器正在监听 http://localhost:${port}`);
    console.warn("警告: 这是一个简化演示。数据存储在内存中，服务器重启后会丢失。未实现任何安全措施。");
});
