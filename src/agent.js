// src/agent.js
const db = require('./db');

// ⚠️ 这里填你的 API Key
const API_KEY = process.env.AI_API_KEY;
// 如果用 DeepSeek，地址是 https://api.deepseek.com/v1/chat/completions
// 如果用 OpenAI，地址是 https://api.openai.com/v1/chat/completions
const API_URL = 'https://api.deepseek.com/chat/completions';
let conversationHistory = [];
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
    },
    {
        type: "function",
        function: {
            name: "update_employee",
            description: "修改员工信息。⚠️注意：必须先查询获取员工ID，才能调用此工具。",
            parameters: {
                type: "object",
                properties: {
                    id: { type: "number", description: "员工ID (必填)" },
                    name: { type: "string", description: "新姓名 (可选)" },
                    position: { type: "string", description: "新职位 (可选)" },
                    salary: { type: "number", description: "新薪资 (可选)" }
                },
                required: ["id"] // 只有 ID 是必须的，其他选填
            }
        }
    }
];

// ==========================================
// 2. 核心函数：与 LLM 通信
// ==========================================
// src/agent.js 中的 callLLM 函数

async function callLLM(messages) {
    try {
        // ==================================================
        // 📤 1. 打印发送给 AI 的完整内容 (Prompt + History)
        // ==================================================
        console.log("\n👇👇👇 ============ [发送给 AI 的 Payload] ============ 👇👇👇");
        // JSON.stringify(..., null, 2) 可以让 JSON 自动换行、缩进，变得非常易读
        console.log(JSON.stringify(messages, null, 2));
        console.log("👆👆👆 ================================================== 👆👆👆\n");

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: "deepseek-chat", // 或者是 "gpt-3.5-turbo"
                messages: messages,
                tools: toolsDefinition,
                tool_choice: "auto"
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error ${response.status}: ${errText}`);
        }

        const data = await response.json();

        // ==================================================
        // 📥 2. 打印 AI 返回的原始数据
        // ==================================================
        console.log("\n👇👇👇 ============ [AI 返回的 Raw Response] ============ 👇👇👇");
        console.log(JSON.stringify(data, null, 2));
        console.log("👆👆👆 ==================================================== 👆👆👆\n");

        // 简单提取一下 AI 到底说了啥，方便一眼看懂
        const aiContent = data.choices[0].message.content;
        if (aiContent) {
            console.log(`💬 [AI 人话]: ${aiContent}\n`);
        } else if (data.choices[0].message.tool_calls) {
            console.log(`🔧 [AI 决定调工具]: ${JSON.stringify(data.choices[0].message.tool_calls)}\n`);
        }

        return data.choices[0].message;

    } catch (error) {
        console.error("🔴 callLLM 报错:", error);
        throw error;
    }
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
        if (functionName === 'delete_employee') {
            // 1. 修改 SQL：查出所有信息 (SELECT *)，而不仅仅是 ID
            const [users] = await db.query('SELECT * FROM employees WHERE name = ?', [args.name]);

            if (users.length === 0) return "找不到这个人，无法删除。";

            // 拿到这个人的完整档案
            const targetUser = users[0];

            // 2. 执行删除
            await db.query('DELETE FROM employees WHERE id = ?', [targetUser.id]);

            // 3. 关键点：把他的详细信息写在返回结果里！
            // 这样这些信息就会被存进历史记录（memory），AI 以后就能查到了。
            return `操作成功。已删除员工详情：
            - ID: ${targetUser.id}
            - 姓名: ${targetUser.name}
            - 职位: ${targetUser.position}
            - 薪资: ${targetUser.salary}
            (数据已备份在对话历史中)`;
        }

        if (functionName === 'update_employee') {
            const { id, name, position, salary } = args;
            // 动态构建 SET 子句
            let updates = [];
            let params = [];

            if (name) { updates.push('name = ?'); params.push(name); }
            if (position) { updates.push('position = ?'); params.push(position); }
            if (salary) { updates.push('salary = ?'); params.push(salary); }

            if (updates.length === 0) return "未提供任何要修改的信息。";

            // 把 ID 加到参数最后，给 WHERE 用
            params.push(id);

            const sql = `UPDATE employees SET ${updates.join(', ')} WHERE id = ?`;

            const [res] = await db.query(sql, params);
            if (res.affectedRows === 0) return "修改失败，可能 ID 不存在。";
            return "修改成功。";
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
        const systemPrompt = `你是一个数据库管理员。
${currentSchema}

你的能力：
1. 查询数据 (query_database)
2. 招聘员工 (add_employee)
3. 开除员工 (delete_employee)
4. 修改员工 (update_employee)

回复风格要求：
- 简洁明了，像真人一样说话。
- 如果操作成功，直接说结果。
- 如果操作失败，直接告诉用户原因即可，不要解释你的工作规则。

⚠️ 核心规则：
1. **删除前必须确认**：涉及删除时，先查人，再问“你确定要删除 [姓名] (ID: [ID]) 吗？”。
2. 只有用户确认后，才调用 delete_employee。

🧠 高级逻辑（后悔药）：
- **关于“恢复”**：虽然数据库没有“撤销”功能，但如果用户要求“恢复”或“撤销删除”刚才删掉的人，请利用你的**对话记忆**。
- 从历史消息中提取那个人的【姓名、职位、薪资】，然后直接调用 **add_employee** 重新把他加回去。
- 成功后提示用户：“已根据记忆恢复了该员工，但系统分配了新的 ID。”

`;

        // ==========================================
        // 🌟 记忆管理逻辑 (开始)
        // ==========================================

        // A. 初始化或更新 System Prompt
        if (conversationHistory.length === 0) {
            conversationHistory.push({ role: "system", content: systemPrompt });
        } else {
            // 永远确保第0条是最新的表结构和规则
            conversationHistory[0] = { role: "system", content: systemPrompt };
        }

        // B. 加入当前用户的提问
        conversationHistory.push({ role: "user", content: userQuery });

        // C. 🔪 裁剪历史记录 (滑动窗口) 🔪
        // 设定最大保留条数 (比如20条，大概对应10轮对话)
        const MAX_HISTORY_LENGTH = 40;

        if (conversationHistory.length > MAX_HISTORY_LENGTH) {
            let recentHistory = conversationHistory.slice(-(MAX_HISTORY_LENGTH - 1));
            while (recentHistory.length > 0 && recentHistory[0].role === 'tool') {
                recentHistory.shift(); // 扔掉这条没头没脑的工具结果
            }
            conversationHistory = [
                conversationHistory[0],
                ...recentHistory
            ];
            console.log(`✂️ 已执行裁剪，当前历史长度: ${conversationHistory.length}`);
        }

        // 让 messages 指向全局历史
        let messages = conversationHistory;

        // ==========================================
        // 🌟 记忆管理逻辑 (结束)
        // ==========================================
        let needRefresh = false;
        console.log("🤖 AI 正在思考...");

        let turnCount = 0;
        const MAX_TURNS = 5;

        while (turnCount < MAX_TURNS) {
            turnCount++;

            const aiMessage = await callLLM(messages);

            if (aiMessage.tool_calls) {
                console.log(`🔄 第 ${turnCount} 轮: AI 调工具...`);

                // 把 AI 的想法存入历史
                messages.push(aiMessage);

                for (const toolCall of aiMessage.tool_calls) {
                    const toolResult = await executeTool(toolCall);

                    const funcName = toolCall.function.name;
                    if (funcName === 'add_employee' || funcName === 'delete_employee' || funcName === 'update_employee') {
                        needRefresh = true; // 标记一下：刚才改过数据了！
                    }
                    // 把工具结果存入历史
                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: toolResult
                    });
                }
                // 循环继续，AI 会看到工具结果并再次思考

            } else {
                // 任务结束，把 AI 的最终回答存入历史
                // 这样下一轮对话时，AI 就能记得它刚才说过什么
                messages.push(aiMessage);

                console.log('✅ AI 最终回复:', aiMessage.content);
                return {
                    reply: aiMessage.content,
                    shouldRefresh: needRefresh
                };
            }
        }
        console.warn("⚠️ AI 思考次数过多，强制停止。");
        return {
            reply: "任务有点太复杂了，我先暂停一下。不过刚才的操作（如果有）已经执行了。",
            shouldRefresh: needRefresh
        };

    } catch (error) {
        console.error("AI Error:", error);
        return {
            reply: "系统出小差了: " + error.message,
            shouldRefresh: needRefresh // 关键！把这个变量带出去
        };
    }
}

function injectMemory(logText) {
    // 构造一条系统通知消息
    const systemNote = {
        role: "system", // 使用 system 角色，像旁白一样
        content: `[系统通知] ${logText}`
    };

    // 存入历史记录
    conversationHistory.push(systemNote);

    // 简单的裁剪保护（防止手动操作太多把内存撑爆）
    if (conversationHistory.length > 20) {
        conversationHistory = [conversationHistory[0], ...conversationHistory.slice(-19)];
    }

    console.log("🧠 已注入 AI 记忆:", logText);
}

module.exports = { chatWithAI, injectMemory };