// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer'); // 引入 multer

const app = express();
const port = 8100;

const BASH_EXECUTABLE = process.env.SR_BASH_PATH || '/bin/bash';
const PYTHON_EXECUTABLE = process.env.SR_PYTHON_PATH || 'python3'; // 新增：Python 执行路径 (python 或 python3)

const USER_SCRIPTS_DIR = path.join(__dirname, 'user_scripts');
const UPLOADS_TMP_DIR = path.join(USER_SCRIPTS_DIR, 'tmp_uploads'); // 新增：临时上传目录
const DATA_DIR = path.join(__dirname, 'data');
const SCRIPTS_DB_PATH = path.join(DATA_DIR, 'scripts_db.json');
const TASKS_DB_PATH = path.join(DATA_DIR, 'tasks_db.json');

// 确保目录存在
[USER_SCRIPTS_DIR, UPLOADS_TMP_DIR, DATA_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Multer 配置：将上传的文件保存在临时目录
const upload = multer({ dest: UPLOADS_TMP_DIR });

app.use(express.json()); // 用于解析 application/json
// express.urlencoded 用于解析表单数据，但 multer 会处理 multipart/form-data
app.use(express.urlencoded({ extended: true })); 
app.use(express.static('public'));

let scripts = [];
let scheduledTasks = [];

// --- 数据持久化函数 (与之前版本相同) ---
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
        const tasksToSave = scheduledTasks.map(task => ({
            id: task.id, scriptId: task.scriptId, cronExpression: task.cronExpression
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
        } else { scripts = []; }
    } catch (error) {
        console.error('从文件加载脚本数据失败:', error);
        scripts = [];
    }
}
// --- /数据持久化函数 ---

function getScriptFilePath(scriptId, scriptType) {
    // 文件扩展名直接使用 scriptType (js, sh, py)
    return path.join(USER_SCRIPTS_DIR, `${scriptId}.${scriptType}`);
}

function runScript(scriptId) {
    return new Promise((resolve, reject) => {
        const script = scripts.find(s => s.id === scriptId);
        if (!script) return reject({ status: 404, message: '脚本未找到' });
        const scriptPath = script.filePath;
        if (!fs.existsSync(scriptPath)) return reject({ status: 404, message: '脚本文件在磁盘上未找到' });

        let command;
        let args = [];
        let spawnOptions = { env: process.env };

        if (script.type === 'sh') {
            command = BASH_EXECUTABLE;
            args.push(scriptPath);
        } else if (script.type === 'js') {
            command = 'node';
            args.push(scriptPath);
        } else if (script.type === 'py') { // 新增对 python 的支持
            command = PYTHON_EXECUTABLE;
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
                 reject({ status: 500, message: `启动脚本失败: 无法找到执行程序 '${command}'。请检查 ${script.type === 'sh' ? 'BASH_EXECUTABLE' : (script.type === 'py' ? 'PYTHON_EXECUTABLE' : 'node')} 配置或确保命令在 PATH 中。` });
            } else {
                reject({ status: 500, message: `启动脚本失败: ${err.message}` });
            }
        });
    });
}

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
        return { ...taskDefinition, cronJob };
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
            scheduledTasks = [];
            taskDefinitions.forEach(taskDef => {
                const fullTask = scheduleCronTask(taskDef);
                if (fullTask) scheduledTasks.push(fullTask);
            });
            console.log('定时任务数据已从文件加载并重新调度。');
        } else { scheduledTasks = []; }
    } catch (error) {
        console.error('从文件加载或重新调度定时任务失败:', error);
        scheduledTasks = [];
    }
}

// --- API Endpoints for Scripts ---
app.get('/api/scripts', (req, res) => {
    res.json(scripts.map(s => ({ id: s.id, name: s.name, type: s.type, cronExpression: s.cronExpression })));
});

// 修改 POST /api/scripts 以处理文件上传和手动内容输入
app.post('/api/scripts', upload.single('scriptFile'), (req, res) => {
    const { name: formName, type, content: manualContent } = req.body;
    const uploadedFile = req.file;

    if (!type) {
        if (uploadedFile) fs.unlinkSync(uploadedFile.path); // 清理临时文件
        return res.status(400).json({ message: '脚本类型为必填项。' });
    }
    if (!['js', 'sh', 'py'].includes(type)) {
        if (uploadedFile) fs.unlinkSync(uploadedFile.path);
        return res.status(400).json({ message: '无效的脚本类型，必须是 "js", "sh" 或 "py"。' });
    }

    const name = formName || (uploadedFile ? uploadedFile.originalname : '未命名脚本');
    
    if (!uploadedFile && typeof manualContent !== 'string') {
        return res.status(400).json({ message: '脚本内容或上传文件为必填项。' });
    }
    // 如果同时提供了文件和手动内容，优先使用文件内容 (或者您可以定义其他逻辑)
    // 这里我们假设如果 req.file 存在，就用它，否则用 manualContent

    const scriptId = uuidv4();
    const filePath = getScriptFilePath(scriptId, type);

    try {
        if (uploadedFile) {
            fs.renameSync(uploadedFile.path, filePath); // 将临时文件移动到最终位置
            console.log(`上传的脚本文件已保存: ${filePath}`);
        } else {
            fs.writeFileSync(filePath, manualContent, 'utf8');
            console.log(`手动输入的脚本内容已保存: ${filePath}`);
        }

        const newScript = { id: scriptId, name, type, filePath, cronExpression: '' };
        scripts.push(newScript);
        saveScriptsToFile();
        console.log(`脚本已创建: ${name} (ID: ${scriptId}, 类型: ${type})`);
        res.status(201).json(newScript);

    } catch (error) {
        console.error('创建脚本错误:', error);
        if (uploadedFile && fs.existsSync(uploadedFile.path)) { // 如果出错且临时文件还在，尝试删除
            try { fs.unlinkSync(uploadedFile.path); } catch (e) { console.error("清理临时上传文件失败:", e); }
        }
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
        res.status(500).json({ message: '读取脚本内容失败。', error: error.message });
    }
});

app.put('/api/scripts/:id', upload.single('scriptFile'), (req, res) => { // 允许更新时也上传文件替换内容
    const scriptId = req.params.id;
    const { name: formName, content: manualContent, type: formType } = req.body; // type 理论上不应在更新时改变，因为文件名和执行方式会变
    const uploadedFile = req.file;

    const scriptIndex = scripts.findIndex(s => s.id === scriptId);
    if (scriptIndex === -1) {
        if (uploadedFile) fs.unlinkSync(uploadedFile.path);
        return res.status(404).json({ message: '脚本未找到' });
    }

    const script = scripts[scriptIndex];

    // 通常不建议在更新时改变脚本类型，因为它会改变文件扩展名和执行方式。
    // 如果允许，需要删除旧文件，用新类型创建新文件。为简单起见，这里不允许更改类型。
    if (formType && formType !== script.type) {
        if (uploadedFile) fs.unlinkSync(uploadedFile.path);
        return res.status(400).json({ message: `不允许修改脚本类型。当前类型: ${script.type}` });
    }

    try {
        if (uploadedFile) {
            fs.renameSync(uploadedFile.path, script.filePath); // 替换现有文件
            console.log(`脚本文件已通过上传更新: ${script.filePath}`);
        } else if (typeof manualContent === 'string') {
            fs.writeFileSync(script.filePath, manualContent, 'utf8');
            console.log(`脚本内容已通过手动输入更新: ${script.filePath}`);
        }

        if (formName) {
            script.name = formName;
        }
        
        saveScriptsToFile();
        console.log(`脚本已更新: ${script.name} (ID: ${scriptId})`);
        res.json(script);
    } catch (error) {
        console.error('更新脚本错误:', error);
        if (uploadedFile && fs.existsSync(uploadedFile.path)) {
            try { fs.unlinkSync(uploadedFile.path); } catch (e) { console.error("清理临时上传文件失败:", e); }
        }
        res.status(500).json({ message: '更新脚本文件失败。', error: error.message });
    }
});


app.delete('/api/scripts/:id', (req, res) => {
    const scriptId = req.params.id;
    const scriptIndex = scripts.findIndex(s => s.id === scriptId);
    if (scriptIndex === -1) return res.status(404).json({ message: '脚本未找到' });
    const tasksForThisScript = scheduledTasks.filter(t => t.scriptId === scriptId);
    tasksForThisScript.forEach(task => {
        if (task.cronJob) task.cronJob.stop();
    });
    scheduledTasks = scheduledTasks.filter(t => t.scriptId !== scriptId);
    saveTasksToFile();
    const script = scripts[scriptIndex];
    try {
        if (fs.existsSync(script.filePath)) fs.unlinkSync(script.filePath);
        scripts.splice(scriptIndex, 1);
        saveScriptsToFile();
        console.log(`脚本已删除: ${script.name} (ID: ${scriptId})`);
        res.status(200).json({ message: '脚本及其关联的定时任务已成功删除' });
    } catch (error) {
        console.error('删除脚本文件错误:', error);
        scripts.splice(scriptIndex, 1);
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

// --- API Endpoints for Scheduled Tasks (与之前版本相同，确保 saveTasksToFile 和 saveScriptsToFile 被正确调用) ---
app.get('/api/tasks', (req, res) => {
    res.json(scheduledTasks.map(task => ({
        id: task.id, scriptId: task.scriptId,
        scriptName: scripts.find(s => s.id === task.scriptId)?.name || 'N/A',
        cronExpression: task.cronExpression
    })));
});
app.post('/api/tasks', (req, res) => {
    const { scriptId, cronExpression } = req.body;
    if (!scriptId || !cronExpression) return res.status(400).json({ message: '脚本ID和Cron表达式为必填项。' });
    const script = scripts.find(s => s.id === scriptId);
    if (!script) return res.status(404).json({ message: '未找到要调度的脚本。' });
    if (!cron.validate(cronExpression)) return res.status(400).json({ message: '无效的Cron表达式。' });
    const taskDefinition = { id: uuidv4(), scriptId, cronExpression };
    const fullTask = scheduleCronTask(taskDefinition);
    if (fullTask) {
        scheduledTasks.push(fullTask);
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
    if (task.cronJob) task.cronJob.stop();
    const scriptAssociated = scripts.find(s => s.id === task.scriptId);
    if (scriptAssociated) {
        const otherTasksForScript = scheduledTasks.some(t => t.scriptId === task.scriptId && t.id !== taskId);
        if (!otherTasksForScript) {
            scriptAssociated.cronExpression = '';
            saveScriptsToFile();
        }
    }
    scheduledTasks.splice(taskIndex, 1);
    saveTasksToFile();
    console.log(`定时任务已删除: ${taskId}`);
    res.status(200).json({ message: '定时任务已成功删除' });
});

// --- Server Start ---
function startServer() {
    loadScriptsFromFile();
    loadTasksFromFileAndSchedule();
    app.listen(port, () => {
        console.log(`简易脚本运行器正在监听 http://localhost:${port}`);
        console.log(`将使用 Bash 执行器: ${BASH_EXECUTABLE}`);
        console.log(`将使用 Python 执行器: ${PYTHON_EXECUTABLE}`); // 新增
        console.warn("数据将保存在JSON文件中。简单的错误处理和并发控制。");
    });
}
startServer();
