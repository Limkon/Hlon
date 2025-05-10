// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 8100;

// 新增：配置 Bash 执行路径
// 您可以根据服务器上的实际情况修改这里的路径
// 或者通过环境变量 SR_BASH_PATH 来设置，例如 SR_BASH_PATH=/usr/bin/bash node server.js
const BASH_EXECUTABLE = process.env.SR_BASH_PATH || '/bin/bash'; // 默认使用 /bin/bash

const USER_SCRIPTS_DIR = path.join(__dirname, 'user_scripts');
if (!fs.existsSync(USER_SCRIPTS_DIR)) {
    fs.mkdirSync(USER_SCRIPTS_DIR, { recursive: true });
}

app.use(express.json());
app.use(express.static('public'));

let scripts = [];
let scheduledTasks = [];

function getScriptFilePath(scriptId, scriptType) {
    return path.join(USER_SCRIPTS_DIR, `<span class="math-inline">\{scriptId\}\.</span>{scriptType}`);
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
            command = BASH_EXECUTABLE; // 使用配置的 Bash 路径
            args.push(scriptPath);
        } else if (script.type === 'js') {
            command = 'node'; // 假设 node 在 PATH 中是可靠的
            args.push(scriptPath);
        } else {
            return reject({ status: 400, message: '不支持的脚本类型' });
        }

        console.log(`正在执行: ${command} ${args.join(' ')}`);
        // 传递当前 Node.js 进程的环境变量，并可以覆盖或添加特定变量
        const child = spawn(command, args, { env: process.env }); 

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
            // 如果是因为找不到 BASH_EXECUTABLE，这里会报错
            if (err.code === 'ENOENT') {
                 reject({ status: 500, message: `启动脚本失败: 无法找到执行程序 '${command}'。请检查 BASH_EXECUTABLE 配置或确保命令在 PATH 中。` });
            } else {
                reject({ status: 500, message: `启动脚本失败: ${err.message}` });
            }
        });
    });
}

// ... (文件的其余部分 API 接口等保持不变) ...
// (确保 GET /api/scripts, POST /api/scripts 等路由都在这里)

// 示例 API (确保您的 server.js 中包含所有必要的路由)
app.get('/api/scripts', (req, res) => {
    res.json(scripts.map(s => ({ id: s.id, name: s.name, type: s.type, cronExpression: s.cronExpression })));
});
// ... 其他所有 API 路由 ...

app.listen(port, () => {
    console.log(`简易脚本运行器正在监听 http://localhost:${port}`);
    console.log(`将使用 Bash 执行器: ${BASH_EXECUTABLE}`);
    console.warn("警告: 这是一个简化演示。数据存储在内存中，服务器重启后会丢失。未实现任何安全措施。");
});
