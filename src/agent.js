// src/agent.js
const db = require('./db');

// ⚠️ 这里填你的 API Key
const API_KEY = process.env.AI_API_KEY;
// 如果用 DeepSeek，地址是 https://api.deepseek.com/v1/chat/completions
// 如果用 OpenAI，地址是 https://api.openai.com/v1/chat/completions
const API_URL = 'https://api.deepseek.com/chat/completions';

// ==========================================
// 1. 定义工具 (Tools) - 给 AI 看的“菜单”
// ==========================================
// 我们告诉 AI：你有两个能力，一个是查库，一个是联网(暂时先写个壳)
const toolsDefinition = [
    // 工具 1: 查数据 (保持不变)
    {
        type: "function",
        function: {
            name: "query_database",
            description: "执行 SQL SELECT 查询。用于获取信息。",
            parameters: {
                type: "object",
                properties: {
                    sql: { type: "string", description: "SELECT 语句" }
                },
                required: ["sql"]
            }
        }
    },
    // 工具 2: 招人 (新增)
    {
        type: "function",
        function: {
            name: "add_employee",
            description: "招聘新员工，将其添加到数据库中。",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "员工姓名" },
                    position: { type: "string", description: "职位" },
                    salary: { type: "number", description: "薪水(数字)" }
                },
                required: ["name", "position", "salary"]
            }
        }
    },
    // 工具 3: 开人 (新增)
    {
        type: "function",
        function: {
            name: "delete_employee",
            description: "根据姓名开除员工（从数据库删除）。",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "要开除的员工姓名" }
                },
                required: ["name"]
            }
        }
    }
];

// ==========================================
// 2. 核心函数：与 LLM 通信
// ==========================================
async function callLLM(messages) {
    console.log('🤖 正在思考...');

    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
            model: "deepseek-chat", // 或者 deepseek-chat
            messages: messages,
            tools: toolsDefinition, // 把工具箱传给它
            tool_choice: "auto"     // 让 AI 自己决定用不用工具
        })
    });

    const data = await response.json();
    // console.log("LLM raw response:", JSON.stringify(data, null, 2));
    return data.choices[0].message;
}

// ==========================================
// 3. 工具执行器 (Action)
// ==========================================
async function executeTool(toolCall) {
    const functionName = toolCall.function.name;
    const args = JSON.parse(toolCall.function.arguments);

    console.log(`🔧 AI 调用工具: ${functionName}`, args);

    try {
        // --- 情况 A: 查数据 ---
        if (functionName === 'query_database') {
            const [rows] = await db.query(args.sql);
            return JSON.stringify(rows);
        }

        // --- 情况 B: 加员工 ---
        if (functionName === 'add_employee') {
            const sql = 'INSERT INTO employees (name, position, salary) VALUES (?, ?, ?)';
            // 这里的 execute 会自动防止注入，很安全
            const [result] = await db.query(sql, [args.name, args.position, args.salary]);
            return `成功！新员工 ID 为 ${result.insertId}`;
        }

        // --- 情况 C: 删员工 ---
        if (functionName === 'delete_employee') {
            // 先查一下人在不在，不在的话提醒 AI
            const [check] = await db.query('SELECT * FROM employees WHERE name = ?', [args.name]);
            if (check.length === 0) return "操作失败：找不到叫这个名字的员工。";

            const sql = 'DELETE FROM employees WHERE name = ?';
            const [result] = await db.query(sql, [args.name]);
            return `成功！已删除 ${result.affectedRows} 名叫 ${args.name} 的员工。`;
        }

    } catch (err) {
        return `操作执行出错: ${err.message}`;
    }
}


async function chatWithAI(userQuery) {
    try {
        // 1. 获取最新表结构
        const currentSchema = await db.getDatabaseSchema();

        // 2. 系统提示词
        const systemPrompt = `你是一个拥有管理权限的数据库助手。
            ${currentSchema}

            你的能力：
            1. 查询数据 (使用 query_database)
            2. 招聘员工 (使用 add_employee)
            3. 开除员工 (使用 delete_employee)
            回复风格要求：
            - 简洁明了，像真人一样说话。
            - 如果操作成功，直接说结果。
            - 如果操作失败（例如找不到人），直接告诉用户原因即可，不要解释你的工作规则。`;


        let messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userQuery }
        ];

        console.log("🤖 AI 正在思考...");

        // ==========================================
        // 🔄 核心修改：从 if 改成 while 循环
        // ==========================================
        let turnCount = 0;
        const MAX_TURNS = 5; // 防止 AI陷入死循环，最多允许它连续操作5次

        while (turnCount < MAX_TURNS) {
            turnCount++;

            // 1. 问 AI
            const aiMessage = await callLLM(messages);

            // 2. 判断 AI 是否想调工具
            if (aiMessage.tool_calls) {
                console.log(`🔄 第 ${turnCount} 轮思考: AI 想要调用工具...`);

                // 必须把 AI 的“我想调工具”这个决定存入历史
                messages.push(aiMessage);

                // 3. 挨个执行工具
                for (const toolCall of aiMessage.tool_calls) {
                    const toolResult = await executeTool(toolCall);

                    // 把结果存入历史
                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: toolResult
                    });
                }

                // 这样 AI 就能看到工具结果，进入下一轮思考 (Next Turn)

            } else {
                // 3. 如果 AI 不想调工具了，说明它认为任务完成了
                console.log('✅ 任务完成，AI 最终回复:', aiMessage.content);
                return aiMessage.content;
            }
        }

        return "任务太复杂，我尝试了太多次，先停止了。";

    } catch (error) {
        console.error("AI Error:", error);
        return "系统故障: " + error.message;
    }
}

module.exports = { chatWithAI };