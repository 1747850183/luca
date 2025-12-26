# **这是一个完全由ai生成的AI驱动员工管理系统,甚至是这篇readme**

---

# 🧠 StaffMind - AI 驱动的智能员工管理系统

> 一个基于原生 Node.js + MySQL 构建的全栈 CRUD 系统，内置具备“全知记忆”的 AI 智能管理员。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/Node.js-Vanilla-green.svg)
![MySQL](https://img.shields.io/badge/Database-MySQL-orange.svg)
![AI](https://img.shields.io/badge/AI-DeepSeek%2FOpenAI-purple.svg)

## 📖 项目简介

**StaffMind** 不仅仅是一个传统的员工管理系统。除了具备标准的企业级增删改查功能外，它还集成了一个**自主 AI Agent（智能体）**。

与普通 Chatbot 不同，这个 AI **“活”在系统中**：
1.  **全知视角**：当你手动在网页上修改、删除员工时，系统会自动将操作日志注入 AI 的大脑（Memory）。
2.  **工具调用**：AI 可以自主决定调用 SQL 查询数据库，或执行增删改操作。
3.  **逻辑闭环**：支持复杂的 ReAct 逻辑（如“先查后删”、“误删恢复”），并具备上下文记忆。

## ✨ 核心功能

### 1. 全栈 CRUD 管理
*   **列表展示**：实时获取员工数据。
*   **新增员工**：标准表单录入。
*   **编辑/修改**：支持回显旧数据，并在修改后生成详细变更日志。
*   **删除员工**：硬删除操作（AI 可通过记忆尝试恢复）。

### 2. 🤖 AI 智能管理员 (Agent)
*   **自然语言交互**：通过聊天框指挥 AI（如：“帮我把张三工资涨到 8000”）。
*   **Tool Calling (工具调用)**：AI 不直接操作数据库，而是通过安全的 Tool 接口执行 SQL。
*   **System Notification (系统感知)**：网页端的每一次手动操作，都会实时同步给 AI。
    *   *例子：你手动删了人，问 AI “我刚才干了什么”，它能准确回答。*
*   **后悔药机制**：AI 记住了被删除员工的信息，可以通过对话要求 AI “恢复”已删除的数据。
*   **自动刷新**：AI 修改数据后，前端页面会自动无刷新重载。

## 🛠️ 技术栈 (坚持原生，拒绝黑盒)

本项目旨在深入理解 Web 开发底层原理，因此**未使用** Express/Koa/Vue/React 等框架。

*   **后端**：Node.js 原生 `http` 模块 (手写路由、Body 解析、CORS 处理)。
*   **数据库**：MySQL 8.0 + `mysql2` (手写原生 SQL，未使用 ORM)。
*   **前端**：原生 HTML5 + CSS3 + Vanilla JavaScript (Fetch API)。
*   **AI 模型**：接入 DeepSeek / OpenAI API (通过原生 HTTP 请求调用)。

## 🚀 快速开始

### 1. 环境准备
*   Node.js (v14+)
*   MySQL (v5.7 或 v8.0)

### 2. 安装依赖
```bash
git clone https://github.com/你的用户名/StaffMind.git
cd StaffMind
npm install
```

### 3. 数据库配置
请在你的 MySQL 中执行以下 SQL 语句来初始化数据库：

```sql
CREATE DATABASE company_db;
USE company_db;

CREATE TABLE employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    position VARCHAR(50),
    salary DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(50) NOT NULL
);

-- 初始化管理员
INSERT INTO users (username, password) VALUES ('admin', '123456');
```

### 4. 环境变量配置
在项目根目录新建 `.env` 文件，填入你的配置（注意不要上传此文件）：

```env
# AI API Key (OpenAI 或 DeepSeek)
AI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 数据库密码
DB_PASSWORD=你的MySQL密码
```

### 5. 启动项目
```bash
# 启动服务器
node src/server.js
```

打开浏览器访问：[http://localhost:3000](http://localhost:3000)

---

## 📂 项目结构

```text
StaffMind/
├── public/              # 前端静态资源
│   ├── index.html       # 登录页
│   └── dashboard.html   # 管理后台 + 聊天窗口
├── src/                 # 后端源码
│   ├── server.js        # HTTP 服务器入口 & 路由分发
│   ├── db.js            # MySQL 连接池 & 自动Schema分析
│   └── agent.js         # AI Agent 核心逻辑 (Prompt工程 + 工具定义)
├── .env                 # 敏感配置 (不上传)
└── package.json
```

## 🧠 学习心得 & 设计理念

在这个项目中，我实践了以下高级概念：
1.  **Agentic Workflow**：使用 `while` 循环实现 AI 的多轮思考（ReAct 模式）。
2.  **Context Management**：实现了滑动窗口（Sliding Window）记忆机制，防止 Token 溢出。
3.  **State Synchronization**：解决了 AI 记忆与数据库状态的同步问题（通过 `injectMemory`）。
4.  **Security**：在 Prompt 中植入“Human-in-the-loop”逻辑，敏感操作（如删除）需用户二次确认。

---



