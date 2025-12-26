const mysql = require('mysql2');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: process.env.DB_PASSWORD,
    database: 'company_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const promisePool = pool.promise();

console.log("正在尝试连接数据库配置...");
// 新增：自动分析数据库结构
async function getDatabaseSchema() {
    try {
        // 1. 查有哪些表
        const [tables] = await promisePool.query('SHOW TABLES');
        // tables 结果类似: [ { Tables_in_company_db: 'employees' }, ... ]

        let schemaDescription = "当前数据库包含以下表结构：\n";

        for (const row of tables) {
            // 获取表名 (Object.values取第一个值)
            const tableName = Object.values(row)[0];

            // 2. 查每个表的字段
            const [columns] = await promisePool.query(`DESCRIBE ${tableName}`);

            // 拼凑成字符串: "- employees (id, name, salary...)"
            const columnNames = columns.map(col => `${col.Field}(${col.Type})`).join(', ');
            schemaDescription += `- 表名: ${tableName}\n  字段: ${columnNames}\n`;
        }

        return schemaDescription;
    } catch (err) {
        console.error("获取表结构失败:", err);
        return "无法获取数据库结构";
    }
}

module.exports = {
    query: promisePool.query.bind(promisePool), // 绑定上下文，防止报错
    end: promisePool.end.bind(promisePool),
    getDatabaseSchema: getDatabaseSchema // 导出新函数
};