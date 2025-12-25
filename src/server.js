const http = require('http');   // Node自带的网络模块
const fs = require('fs');       // Node自带的文件读写模块
const path = require('path');   // Node自带的路径处理模块
const db = require('./db');     // 引入上一节写的数据库连接
const { chatWithAI } = require('./agent');
// 辅助函数：专门用来接收 POST 请求发来的数据
function getBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        // 监听数据流：来一点存一点
        req.on('data', chunk => body += chunk.toString());
        // 监听结束：接收完了，把结果返回出去
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

// 创建服务器
const server = http.createServer(async (req, res) => {
    // 1. 设置允许跨域 (CORS) - 防止浏览器拦截我们的 API 请求
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理预检请求 (浏览器在发 POST 前会先问一下能不能发)
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = req.url;
    const method = req.method;

    console.log(`收到请求: ${method} ${url}`);

    // ==========================================
    // A. 静态文件服务 (负责返回 HTML/JS 文件)
    // ==========================================

    // 首页 -> 读取 public/index.html
    if (url === '/' || url === '/index.html') {
        try {
            const content = fs.readFileSync(path.join(__dirname, '../public/index.html'));
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        } catch (e) {
            res.writeHead(404);
            res.end('找不到 index.html');
        }
        return;
    }

    // 管理页 -> 读取 public/dashboard.html
    if (url === '/dashboard.html') {
        try {
            const content = fs.readFileSync(path.join(__dirname, '../public/dashboard.html'));
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        } catch (e) {
            res.writeHead(404);
            res.end('找不到 dashboard.html');
        }
        return;
    }

    // JS 文件 -> 读取 public/client.js (稍后会写)
    if (url === '/client.js') {
        try {
            const content = fs.readFileSync(path.join(__dirname, '../public/client.js'));
            res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
            res.end(content);
        } catch (e) {
            res.writeHead(404);
            res.end('找不到 client.js');
        }
        return;
    }

    // ==========================================
    // B. API 数据接口 (负责读写数据库)
    // ==========================================

    // 🟢 接口1：登录校验
    if (url === '/api/login' && method === 'POST') {
        try {
            // 1. 获取前端发来的账号密码
            const bodyStr = await getBody(req);
            const { username, password } = JSON.parse(bodyStr);

            // 2. 去数据库查
            // SQL意思：查找 users 表里 username 等于 ? 且 password 等于 ? 的记录
            const [rows] = await db.query(
                'SELECT * FROM users WHERE username = ? AND password = ?',
                [username, password]
            );

            // 3. 判断结果
            if (rows.length > 0) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: '登录成功' }));
            } else {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: '账号或密码错误' }));
            }
        } catch (err) {
            console.error(err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '服务器内部错误' }));
        }
        return;
    }

    // 🟢 接口2：获取员工列表
    if (url === '/api/employees' && method === 'GET') {
        try {
            const [rows] = await db.query('SELECT * FROM employees ORDER BY created_at DESC');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: rows }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // 🟢 接口3：新增员工
    if (url === '/api/employees' && method === 'POST') {
        try {
            const bodyStr = await getBody(req);
            const { name, position, salary } = JSON.parse(bodyStr);

            await db.query(
                'INSERT INTO employees (name, position, salary) VALUES (?, ?, ?)',
                [name, position, salary]
            );

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: '员工创建成功' }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    //🟢 接口：AI 聊天
    if (url === '/api/chat' && method === 'POST') {
        try {
            const bodyStr = await getBody(req);
            const { message } = JSON.parse(bodyStr);

            if (!message) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: '说话啊，没听到内容' }));
                return;
            }

            // 调用 Agent 开始思考
            const reply = await chatWithAI(message);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, reply: reply }));

        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    // 如果以上都不是，返回 404
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found - 找不到这个接口或页面');
});

// 启动监听
server.listen(3000, () => {
    console.log('🚀 服务器已启动: http://localhost:3000');
});