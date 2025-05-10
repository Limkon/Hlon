// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid'); // For generating unique IDs

const app = express();
const port = 8100;

const USER_SCRIPTS_DIR = path.join(__dirname, 'user_scripts');
if (!fs.existsSync(USER_SCRIPTS_DIR)) {
    fs.mkdirSync(USER_SCRIPTS_DIR, { recursive: true });
}

app.use(express.json()); // For parsing application/json
app.use(express.static('public')); // Serve static files from 'public' directory

// In-memory storage (WARNING: Data lost on server restart)
let scripts = []; // { id, name, type: 'js' | 'sh', cronExpression: '', filePath, contentHash (optional) }
let scheduledTasks = []; // { id, scriptId, cronExpression, cronJob (node-cron instance) }

// --- Helper Functions ---
function getScriptFilePath(scriptId, scriptType) {
    return path.join(USER_SCRIPTS_DIR, `${scriptId}.${scriptType}`);
}

function runScript(scriptId) {
    return new Promise((resolve, reject) => {
        const script = scripts.find(s => s.id === scriptId);
        if (!script) {
            return reject({ status: 404, message: 'Script not found' });
        }

        const scriptPath = script.filePath;
        if (!fs.existsSync(scriptPath)) {
            return reject({ status: 404, message: 'Script file not found on disk' });
        }

        let command;
        let args = [];

        if (script.type === 'sh') {
            command = 'sh'; // or 'bash'
            args.push(scriptPath);
        } else if (script.type === 'js') {
            command = 'node';
            args.push(scriptPath);
        } else {
            return reject({ status: 400, message: 'Unsupported script type' });
        }

        console.log(`Executing: ${command} ${args.join(' ')}`);
        const child = spawn(command, args);
        let output = `Running script: ${script.name} (ID: ${scriptId})\nType: ${script.type}\nPath: ${scriptPath}\n---------------------\n`;
        let errorOutput = '';

        child.stdout.on('data', (data) => {
            output += data.toString();
        });

        child.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        child.on('close', (code) => {
            output += `\n---------------------\nScript exited with code ${code}\n`;
            if (errorOutput) {
                output += `\nErrors:\n${errorOutput}`;
            }
            console.log(`Script ${script.name} (ID: ${scriptId}) finished with code ${code}.`);
            resolve({ output, code });
        });

        child.on('error', (err) => {
            console.error(`Failed to start script ${script.name} (ID: ${scriptId}):`, err);
            reject({ status: 500, message: `Failed to start script: ${err.message}` });
        });
    });
}


// --- API Endpoints for Scripts ---

// GET all scripts
app.get('/api/scripts', (req, res) => {
    res.json(scripts.map(s => ({ id: s.id, name: s.name, type: s.type, cronExpression: s.cronExpression })));
});

// POST a new script
app.post('/api/scripts', (req, res) => {
    const { name, type, content } = req.body;
    if (!name || !type || typeof content !== 'string') {
        return res.status(400).json({ message: 'Name, type, and content are required.' });
    }
    if (type !== 'js' && type !== 'sh') {
        return res.status(400).json({ message: 'Invalid script type. Must be "js" or "sh".' });
    }

    const scriptId = uuidv4();
    const filePath = getScriptFilePath(scriptId, type);

    try {
        fs.writeFileSync(filePath, content, 'utf8');
        const newScript = { id: scriptId, name, type, filePath, cronExpression: '' };
        scripts.push(newScript);
        console.log(`Script created: ${name} (ID: ${scriptId})`);
        res.status(201).json(newScript);
    } catch (error) {
        console.error('Error creating script:', error);
        res.status(500).json({ message: 'Failed to save script file.', error: error.message });
    }
});

// GET script content (for "modify" view)
app.get('/api/scripts/:id/content', (req, res) => {
    const script = scripts.find(s => s.id === req.params.id);
    if (!script) {
        return res.status(404).json({ message: 'Script not found' });
    }
    try {
        const content = fs.readFileSync(script.filePath, 'utf8');
        res.json({ id: script.id, name: script.name, type: script.type, content });
    } catch (error) {
        console.error('Error reading script content:', error);
        res.status(500).json({ message: 'Failed to read script content.', error: error.message });
    }
});

// PUT (Update) a script's content
app.put('/api/scripts/:id', (req, res) => {
    const scriptId = req.params.id;
    const { name, content } = req.body; // Type cannot be changed easily as filename would change

    const scriptIndex = scripts.findIndex(s => s.id === scriptId);
    if (scriptIndex === -1) {
        return res.status(404).json({ message: 'Script not found' });
    }

    if (typeof content !== 'string' && !name) {
        return res.status(400).json({ message: 'Content or name must be provided for update.' });
    }
    
    const script = scripts[scriptIndex];

    try {
        if (typeof content === 'string') {
             fs.writeFileSync(script.filePath, content, 'utf8');
             script.contentHash = uuidv4(); // To indicate change
        }
        if (name) {
            script.name = name;
        }
        console.log(`Script updated: ${script.name} (ID: ${scriptId})`);
        res.json(script);
    } catch (error) {
        console.error('Error updating script:', error);
        res.status(500).json({ message: 'Failed to update script file.', error: error.message });
    }
});


// DELETE a script
app.delete('/api/scripts/:id', (req, res) => {
    const scriptId = req.params.id;
    const scriptIndex = scripts.findIndex(s => s.id === scriptId);
    if (scriptIndex === -1) {
        return res.status(404).json({ message: 'Script not found' });
    }

    // Stop and remove any scheduled tasks for this script
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
        console.log(`Script deleted: ${script.name} (ID: ${scriptId})`);
        res.status(200).json({ message: 'Script and associated tasks deleted successfully' });
    } catch (error) {
        console.error('Error deleting script file:', error);
        // Even if file deletion fails, remove from in-memory list
        scripts.splice(scriptIndex, 1);
        res.status(500).json({ message: 'Failed to delete script file, but removed from list.', error: error.message });
    }
});

// POST to run a script manually
app.post('/api/scripts/:id/run', async (req, res) => {
    const scriptId = req.params.id;
    try {
        const result = await runScript(scriptId);
        res.json({ message: 'Script execution finished.', output: result.output, exitCode: result.code });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});


// --- API Endpoints for Scheduled Tasks ---

// GET all scheduled tasks
app.get('/api/tasks', (req, res) => {
    res.json(scheduledTasks.map(task => ({
        id: task.id,
        scriptId: task.scriptId,
        scriptName: scripts.find(s => s.id === task.scriptId)?.name || 'N/A',
        cronExpression: task.cronExpression
    })));
});

// POST a new scheduled task
app.post('/api/tasks', (req, res) => {
    const { scriptId, cronExpression } = req.body;
    if (!scriptId || !cronExpression) {
        return res.status(400).json({ message: 'Script ID and Cron expression are required.' });
    }

    const script = scripts.find(s => s.id === scriptId);
    if (!script) {
        return res.status(404).json({ message: 'Script to schedule not found.' });
    }

    if (!cron.validate(cronExpression)) {
        return res.status(400).json({ message: 'Invalid Cron expression.' });
    }

    // Prevent duplicate schedules for the same script with the same expression (optional)
    // if (scheduledTasks.some(t => t.scriptId === scriptId && t.cronExpression === cronExpression)) {
    //     return res.status(409).json({ message: 'This script is already scheduled with the same expression.' });
    // }

    const taskId = uuidv4();
    try {
        const cronJob = cron.schedule(cronExpression, async () => {
            console.log(`Cron job triggered for task ${taskId}, script ${script.name} (ID: ${scriptId}) at ${new Date()}`);
            try {
                const result = await runScript(scriptId);
                // Simple logging. In a real app, you'd write this to a persistent log.
                console.log(`Scheduled run of ${script.name} (Task ID: ${taskId}) output:\n${result.output}`);
            } catch (err) {
                console.error(`Error running scheduled script ${script.name} (Task ID: ${taskId}):`, err.message);
            }
        });

        const newTask = { id: taskId, scriptId, cronExpression, cronJob };
        scheduledTasks.push(newTask);
        script.cronExpression = cronExpression; // Update script's cron info (simplistic)
        console.log(`Task created: ${taskId} for script ${script.name} with cron "${cronExpression}"`);
        res.status(201).json({ id: taskId, scriptId, scriptName: script.name, cronExpression });
    } catch (error) {
        console.error("Failed to schedule task:", error);
        res.status(500).json({ message: "Failed to schedule task.", error: error.message });
    }
});

// DELETE a scheduled task
app.delete('/api/tasks/:id', (req, res) => {
    const taskId = req.params.id;
    const taskIndex = scheduledTasks.findIndex(t => t.id === taskId);

    if (taskIndex === -1) {
        return res.status(404).json({ message: 'Scheduled task not found' });
    }

    const task = scheduledTasks[taskIndex];
    if (task.cronJob) {
        task.cronJob.stop();
    }

    const script = scripts.find(s => s.id === task.scriptId);
    if(script) script.cronExpression = ''; // Clear cron from script (simplistic)

    scheduledTasks.splice(taskIndex, 1);
    console.log(`Scheduled task deleted: ${taskId}`);
    res.status(200).json({ message: 'Scheduled task deleted successfully' });
});


// --- Server Start ---
app.listen(port, () => {
    console.log(`Simple Script Runner listening at http://localhost:${port}`);
    console.warn("WARNING: This is a simplified demo. Data is in-memory and will be lost on restart. No security measures implemented.");
});
