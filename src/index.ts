#!/usr/bin/env node
/**
 * KontirolClaw 主入口文件 - OpenAI API 模式
 * 
 * 该文件是 KontirolClaw 应用的主入口，使用 OpenAI API (Moonshot) 作为后端
 * 负责：初始化AI客户端、处理用户输入、调用AI模型、执行命令、返回结果
 * 
 * 核心流程：
 * 1. 初始化 OpenAI 客户端和会话管理器
 * 2. 加载技能（Skills）文档
 * 3. 创建/恢复会话
 * 4. 进入主循环：获取用户输入 → 调用AI → 执行命令 → 返回结果
 * 
 * 使用方式：
 * - npm run start         - 启动应用（恢复上次会话或创建新会话）
 * - npm run start:new    - 创建全新会话
 * - npm run start:list   - 列出所有会话
 * - npm run start:session - 切换到指定会话
 */

// =============================================================
// 导入依赖模块
// =============================================================

import OpenAI from "openai";                            // OpenAI SDK，用于调用AI模型
import readline from 'readline/promises';              // 异步读取用户输入
import { exec } from 'child_process';                   // 执行系统命令
import { promisify } from "util";                       // 将回调函数转为 Promise
import fs from 'fs';                                    // 文件系统操作
import path from 'path';                                // 路径处理
import os from 'os';                                    // 操作系统信息
import { fileURLToPath } from 'url';                    // ESM 模块路径处理

// 导入自定义工具模块
import * as file from './tools/file.js';              // 文件操作工具
import * as todo from './tools/todo.js';                // 待办事项管理工具
import { isInteractiveCommand, execInteractive, InteractiveSession, isLongRunningCommand } from './tools/interactive.js';  // 交互式命令工具
import { SessionManager } from './session/session-manager.js';  // 会话管理器

// =============================================================
// 类型定义
// =============================================================

/**
 * 会话消息类型（内联定义）
 * 与 session/types.ts 中的定义保持一致
 * 用于描述会话中每条消息的结构
 */
interface SessionMessage {
  /** 消息角色：user-用户、assistant-AI助手、system-系统 */
  role: 'user' | 'assistant' | 'system';
  /** 消息内容 */
  content: string;
}

// =============================================================
// 常量定义 - 终端颜色代码
// =============================================================

/** 重置颜色（用于恢复默认终端颜色） */
const reset = "\x1b[0m";
/** 绿色 - 用于显示执行的命令 */
const green = "\x1b[32m";   
/** 青色 - 用于显示 AI 回复 */
const cyan = "\x1b[36m";    
/** 黄色 - 用于提示信息 */
const yellow = "\x1b[33m";  
/** 灰色 - 用于显示分割线 */
const gray = "\x1b[90m";    
/** 红色 - 用于显示错误信息 */
const red = "\x1b[31m";    

// =============================================================
// ESM 模块路径处理
// =============================================================

/**
 * 在 ESM 模块中手动获取 __dirname
 * TypeScript/ESM 中没有内置的 __dirname，需要通过 fileURLToPath 获取
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================
// 技能（Skills）加载
// =============================================================

/**
 * 加载所有技能的说明文档
 * 读取 skills/ 目录下每个子目录中的 SKILL.md 文件
 * AI 模型会根据这些文档了解可用的技能
 * @returns 所有技能文档合并后的字符串
 */
function loadAllSkills() {
    // skills 目录路径
    const skillRoot = path.join(__dirname, '../skills');
    // 获取所有子目录
    const skillDirs = fs.readdirSync(skillRoot).filter(dir => {
        return fs.statSync(path.join(skillRoot, dir)).isDirectory();
    });

    const docs: string[] = [];
    // 读取每个技能的 SKILL.md
    for (const dir of skillDirs) {
        const docPath = path.join(skillRoot, dir, 'SKILL.md');
        if (fs.existsSync(docPath)) {
            const content = fs.readFileSync(docPath, 'utf8');
            // 格式化为 "### 技能名\n文档内容"
            docs.push(`### ${dir}\n${content}`);
        }
    }
    return docs.join('\n\n');
}

/**
 * 预加载所有技能文档
 * 在应用启动时一次性加载，之后重复使用
 */
const ALL_SKILLS_DOCS = loadAllSkills();

// =============================================================
// 工具函数别名
// =============================================================

/**
 * 将 exec 回调函数转为 Promise 形式
 * 便于在 async/await 中使用
 */
const execAsync = promisify(exec);

// =============================================================
// 创建命令行交互界面
// =============================================================

/**
 * 创建 readline 接口
 * 用于获取用户输入和输出信息
 */
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})

/**
 * 创建 OpenAI 客户端
 * 使用环境变量中的配置：
 * - OPENAI_API_KEY: API 密钥
 * - OPENAI_BASE_URL: API 地址（Moonshot 为 https://api.moonshot.cn/v1）
 */
// 读取用户目录下的 .ctrl/config.json
const configDir = path.join(os.homedir(), '.ctrl');
const configPath = path.join(configDir, '.env');

// 确保配置文件夹存在
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

// 读取配置
const config: Record<string, string> = {};
if (fs.existsSync(configPath)) {
  const raw = fs.readFileSync(configPath, 'utf8');
  raw.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...rest] = trimmed.split('=');
    if (key) config[key.trim()] = rest.join('=').trim();
  });
}

// 初始化 OpenAI 客户端
const client = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
  baseURL: config.OPENAI_BASE_URL,
});
// const client = new OpenAI({
//     apiKey: process.env['OPENAI_API_KEY'],
//     baseURL: process.env['OPENAI_BASE_URL'],
// });

// =============================================================
// 系统消息（Prompt）- 告诉 AI 模型如何工作
// =============================================================

/**
 * 系统消息内容
 * 包含：AI 角色定义、输出格式要求、可用工具说明、技能文档
 * 
 * AI 模型必须返回以下两种 JSON 格式之一：
 * 1. {"exec": "<命令>"} - 执行命令
 * 2. {"text": "<文本>"} - 返回文本回复
 */
const systemMessageContent = `You are a helpful ai agent. your name is Ctrl,你的开发者 是 Nijat (Ctrl)
         
        You  must respond in one of these two formats:
        不要包含 \'\'\'
        1.{"exec":"<bash command>"} - when you need execute a bash command and you can also call built-in skills
        2.{"text":"<responsi>"} - when you want to return  normal text response

        Examples:
        - {"exec":"dir d:"}
        - {"text":"Hello! How can I help you today?"}
        - {"exec":"pwd"}
        - {"text":"the current directory is ..."}

        当用户下发某个任务时，如果任务还没完成，千百万不能返回 text，必须要返回 exec,你返回exec以后，用户会把执行结果给你返回，你看着结果判断，如果完成了你才发text,不然一直返回exec,
        比如
        用户：查看当前目录,并查看IP;
        你:{"exec":"dir"}
        用户：dir 的执行结果
        你：{"exec":"ipconfig"}
        用户：ipconfig 的执行结果
        你看着这些内容，判断是否完成了，是的话就才返回text

        你可以调用以下文件操作工具，直接用函数名调用：

文件操作工具：
1. readFile("路径")      - 读取文件
2. createFile("路径")    - 创建空文件
3. editFile("路径","内容") - 写入/修改文件
4. deleteFile("路径")    - 删除文件
5. readDir("目录")       - 查看文件夹

Todo任务管理工具（用于跟踪你的任务进度）：
1. createTodoList(任务数组) - 创建/更新整个todo列表，参数是JSON数组，每个任务包含：id(必填), content(必填), status(pending/in_progress/completed), priority(high/medium/low)
2. updateTodoStatus("任务ID", "新状态") - 更新单个任务状态
3. getTodos() - 获取当前todo列表，显示所有任务和进度
4. addTodo("任务内容", "优先级") - 添加单个任务
5. deleteTodo("任务ID") - 删除任务

当用户给你复杂任务时，你应该先创建todo列表来跟踪进度，然后逐步执行，每完成一步就更新任务状态。

如果用户让你写代码，你就不要用 \n \ 这种转义字符

调用示例：
文件操作：
{"exec":"readFile(\"test.txt\")"}
{"exec":"createFile(\"notes.md\")"}
{"exec":"editFile(\"notes.md\",\"# 我是内容\")"}
{"exec":"deleteFile(\"notes.md\")"}
{"exec":"readDir(\"./\")"}

Todo操作：
{"exec":"createTodoList([{\"id\":\"1\",\"content\":\"查看目录\",\"status\":\"pending\",\"priority\":\"high\"},{\"id\":\"2\",\"content\":\"创建文件\",\"status\":\"pending\",\"priority\":\"medium\"}])"}
{"exec":"updateTodoStatus(\"1\",\"in_progress\")"}
{"exec":"getTodos()"}
{"exec":"addTodo(\"新任务\",\"high\")"}
{"exec":"deleteTodo(\"1\")"}

重要提示 - 交互式命令处理：
当执行需要用户输入的命令时（如 npm create、git commit 无 -m 等），系统会自动检测并使用PTY模式执行。
如果命令需要用户交互，系统会提示用户在终端中继续操作。
常见的交互式命令包括：npm create、npm init、git commit（无-m）、ssh连接等。
建议：对于创建项目等命令，尽量使用非交互式参数，如 npm create vue@latest my-app -- --default

重要提示 - 长期运行进程处理：
当执行开发服务器等长期运行的命令时（如 npm run dev、npm start、vite 等），系统会自动在后台启动进程。
进程启动后会显示初始输出和进程ID（PID），你可以继续执行其他命令。
如需停止后台进程，请使用任务管理器或运行: taskkill /PID <PID> /F (Windows) 或 kill <PID> (Linux/Mac)
        

        用户让你用skills 或者 skill 你再调用，不然你就用自己的工具千万不要调用skill.
        The following are the specifications for all the skills you can invoke (please follow them strictly).
        ${ALL_SKILLS_DOCS}
        The skills script is located in the current "skill" folder.
        如果skills 文件夹里有脚本，比如 python ts js ， 你可以按照它的文档直接运行它，不用自己写代码执行。不要执行 python -c ""
        `;

// =============================================================
// 会话管理初始化
// =============================================================

/**
 * 初始化会话管理器
 * 用于管理对话历史的保存、恢复和切换
 */
const sessionManager = new SessionManager();

// =============================================================
// 命令行参数解析
// =============================================================

/** 是否创建新会话（--new-session 参数） */
const shouldCreateNewSession = process.argv.includes('--new-session');
/** 是否列出所有会话（--list 参数） */
const listSessions = process.argv.includes('--list');

// =============================================================
// 命令行操作处理
// =============================================================

/**
 * --list 参数：列出所有会话
 * 显示所有历史会话的标题、ID、消息数量、更新时间
 */
if (listSessions) {
    console.log('\n' + cyan + '=== 会话列表 ===' + reset + '\n');
    const sessions = sessionManager.getAllSessions();
    if (sessions.length === 0) {
        console.log('暂无会话');
    } else {
        sessions.forEach((s, i) => {
            const date = new Date(s.updatedAt).toLocaleString('zh-CN');
            console.log(`${i + 1}. ${s.title}`);
            console.log(`   ID: ${s.id}`);
            console.log(`   消息: ${s.messageCount}条 | 更新: ${date}`);
            console.log('');
        });
    }
    process.exit(0);
}

/**
 * --session=xxx 参数：切换到指定会话
 * 从命令行参数中提取会话 ID
 */
const sessionArg = process.argv.find(arg => arg.startsWith('--session='));
let targetSessionId: string | null = null;
if (sessionArg) {
    targetSessionId = sessionArg.replace('--session=', '');
}

// =============================================================
// 消息格式转换函数
// =============================================================

/**
 * 将 OpenAI 格式的消息转换为 SessionMessage 格式
 * @param msg - OpenAI 消息对象
 * @returns SessionMessage 对象
 */
function openaiToSessionMessage(msg: any): SessionMessage {
    return {
        role: msg.role,
        content: msg.content
    };
}

/**
 * 将 SessionMessage 格式转换为 OpenAI 格式
 * @param msg - SessionMessage 对象
 * @returns OpenAI 格式消息
 */
function sessionMessageToOpenai(msg: SessionMessage): any {
    return {
        role: msg.role,
        content: msg.content
    };
}

// =============================================================
// 会话初始化
// =============================================================

/**
 * 消息历史数组
 * 存储当前会话的所有消息，用于发送给 AI 模型
 */
let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

/**
 * 会话初始化逻辑：
 * 1. --new-session: 创建全新会话
 * 2. --session=xxx: 加载指定会话
 * 3. 无参数: 尝试恢复上次会话，如果没有则创建新会话
 */
if (shouldCreateNewSession) {
    // 创建新会话，包含系统消息
    const initialMessages: SessionMessage[] = [
        { role: 'system', content: systemMessageContent }
    ];
    sessionManager.createSession(initialMessages);
    messages = [{ role: 'system', content: systemMessageContent }];
    console.log(yellow + '创建了新会话' + reset);
} else if (targetSessionId) {
    // 切换到指定会话
    const session = sessionManager.loadSession(targetSessionId);
    if (session && session.messages.length > 0) {
        // 恢复会话中的消息历史
        messages = session.messages.map(sessionMessageToOpenai);
        console.log(yellow + `切换到会话: "${session.title}" (${session.messages.length} 条消息)` + reset);
    } else {
        console.log(red + `未找到会话: ${targetSessionId}` + reset);
        process.exit(1);
    }
} else {
    // 尝试恢复上次会话
    const lastSession = sessionManager.getLastActiveSession();
    if (lastSession && lastSession.messages.length > 0) {
        // 恢复消息
        messages = lastSession.messages.map(sessionMessageToOpenai);
        console.log(yellow + `恢复了会话: "${lastSession.title}" (${lastSession.messages.length} 条消息)` + reset);
    } else {
        // 没有找到会话，创建新会话
        const initialMessages: SessionMessage[] = [
            { role: 'system', content: systemMessageContent }
        ];
        sessionManager.createSession(initialMessages);
        messages = [{ role: 'system', content: systemMessageContent }];
        console.log(yellow + '创建了新会话' + reset);
    }
}

// =============================================================
// 自动保存机制
// =============================================================

/**
 * 自动保存会话
 * 每隔 5 条消息保存一次，避免频繁 IO 操作
 * @param currentMessages - 当前消息数组
 */
let saveCounter = 0;
function autoSaveSession(currentMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) {
    // 转换为 SessionMessage 格式
    const sessionMessages: SessionMessage[] = currentMessages.map(openaiToSessionMessage);
    // 每 5 次交互保存一次
    if (saveCounter % 5 === 0) {
        sessionManager.updateCurrentSession(sessionMessages);
    }
    saveCounter++;
}

// =============================================================
// JSON 解析辅助函数
// =============================================================

/**
 * 强制解析 JSON
 * 处理 AI 返回的各种格式：带代码块、不带代码块、纯文本等
 * @param text - AI 返回的文本
 * @returns 解析后的 JSON 字符串
 */
//json解析
function forcePureJson(text: string): string {
    if (!text) return '{"text":""}';
    // 去掉代码块标记
    text = text.replace(/```json|```/g, '').trim();
    
    // 先尝试直接解析是否已经是合法的 {exec} 或 {text}
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            JSON.parse(trimmed);
            return trimmed; // 合法 JSON，直接返回
        } catch {}
    }

    // 不合法才去提取第一个 {...}，没有就兜底包装
    const m = text.match(/\{[\s\S]*?\}/);
    return m ? m[0].replace(/\n/g, ' ').trim()
        : `{"text":"${text.replace(/"/g, '\\"')}"}`;
}

// =============================================================
// 主循环 - 持续处理用户请求
// =============================================================

/**
 * 主循环：持续获取用户输入、处理请求、返回结果
 * 循环直到用户输入 "exit"
 */

const spinner = ['|', '/', '-', '\\'];
let i = 0;

while (true) {
    // 获取用户输入
    const userInput = await rl.question(yellow + '请输入您的问题(输入 "exit" 退出)：');
    const timer = setInterval(() => {
        process.stdout.write(`\rAI 思考中 ${spinner[i++ % spinner.length]} `);
    }, 100);
    // 用户退出处理
    if (userInput.toLowerCase() === 'exit') {
        // 退出前保存会话
        const sessionMessages: SessionMessage[] = messages.map(openaiToSessionMessage);
        sessionManager.updateCurrentSession(sessionMessages);
        console.log('再见');
        clearInterval(timer);
        process.stdout.write('\r'); // 清空动画行
        break;
    }

    // 添加用户消息到历史
    messages.push({ role: 'user', content: userInput })
    
    // 调用 AI 模型获取回复
    let completion = await client.chat.completions.create({
        model:config.MODEL,
        messages: messages,
        temperature: 0.6,
        response_format:{
                'type': 'json_object'
        }
    });
    
    let assistantMessage = completion.choices[0].message.content || '';
    // 停止动画（AI 返回结果后执行）
    
    // 解析 AI 回复
    let aiMessage;
    let keys;
    try {
        aiMessage = JSON.parse(forcePureJson(assistantMessage.trim()));
        keys = Object.keys(aiMessage);
    } catch (e) {
        // 解析失败 → 当成纯文本处理
        aiMessage = { text: assistantMessage };
        keys = ['text'];
    }

    /**
     * 内部循环：处理 AI 返回的 exec 命令
     * AI 可能连续返回多个 exec 命令，需要循环执行
     * 直到 AI 返回 text（任务完成）
     */
    while (keys[0] === 'exec') {
        const command = aiMessage.exec;
        console.log(`${green}执行命令：${command}`);

        try {
            // 执行工具命令
            const result = await executeToolCommand(command);
            console.log(result);

            // 将命令和结果都添加到对话历史
            messages.push({ role: 'assistant', content: assistantMessage })
            messages.push({ role: 'user', content: `命令执行结果:\n${result}` })

        } catch (error: any) {
            const errorMsg = `命令执行错误: ${error.message}`;
            // console.log(errorMsg);
            messages.push({ role: 'assistant', content: assistantMessage })
            messages.push({ role: 'user', content: errorMsg })
        }

        // 再次调用 AI，获取下一步指示
        completion = await client.chat.completions.create({
            model:config.MODEL,
            messages: messages,
            temperature: 0.6,
            response_format:{
                'type': 'json_object'
            }
        });
        assistantMessage = completion.choices[0].message.content || '';
        
        try {
            aiMessage = JSON.parse(forcePureJson(assistantMessage.trim()));
            keys = Object.keys(aiMessage)
        } catch (error) {
            aiMessage = { text: assistantMessage };
            keys = ['text'];
        }
    }
    clearInterval(timer);
    process.stdout.write('\r'); // 清空动画行
    // 处理不同类型的返回
    if (keys[0] === 'text') {
        const text = aiMessage.text;
        console.log(`${cyan}AI回复：${text}`);
        messages.push({ role: 'assistant', content: assistantMessage })
    } else {
        const text = aiMessage.text;
        console.log(`${cyan}AI回复：${text}`);
        messages.push({ role: 'assistant', content: assistantMessage })
    }
    
    // 自动保存会话
    autoSaveSession(messages);
    console.log(gray + '---' + reset);
}

// 关闭 readline 接口
rl.close();









// =============================================================
// 命令执行工具函数
// =============================================================

/**
 * 执行 AI 返回的命令
 * 支持：文件操作、Todo 操作、交互式命令、普通 shell 命令
 * @param command - AI 返回的要执行的命令
 * @returns 命令执行结果（字符串）
 */
async function executeToolCommand(command: string) {
  try {
    /**
     * 解码 AI 转义的代码
     * AI 在返回 JSON 时可能会转义一些字符，这里需要还原
     * 例如：\n → 换行，\" → "
     */
    function decodeAICode(content: string): string {
      if (!content) return "";
      return content
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "")
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, "\\");
    }

    // ==============================
    // 文件操作工具
    // ==============================

    // ------------------------------
    // readFile - 读取文件
    // ------------------------------
    if (command.startsWith("readFile(")) {
      const filePath = command.match(/readFile\("(.*?)"\)/)?.[1] || "";
      return await file.readFile(filePath);
    }

    // ------------------------------
    // createFile - 创建文件
    // ------------------------------
    if (command.startsWith("createFile(")) {
      const filePath = command.match(/createFile\("(.*?)"\)/)?.[1] || "";
      return await file.createFile(filePath);
    }

    // ------------------------------
    // editFile - 编辑文件
    // ------------------------------
    if (command.startsWith("editFile(")) {
      // 正确正则：捕获整个内容，不会断！
      const match = command.match(/editFile\("(.*?)",\s*"([\s\S]*)"\)$/);
      const filePath = match?.[1] || "";
      const content = match?.[2] || "";

      const realContent = decodeAICode(content);
      return await file.editFile(filePath, realContent);
    }

    // ------------------------------
    // deleteFile - 删除文件
    // ------------------------------
    if (command.startsWith("deleteFile(")) {
      const filePath = command.match(/deleteFile\("(.*?)"\)/)?.[1] || "";
      return await file.deleteFile(filePath);
    }

    // ------------------------------
    // readDir - 读取目录
    // ------------------------------
    if (command.startsWith("readDir(")) {
      const dirPath = command.match(/readDir\("(.*?)"\)/)?.[1] || "./";
      return await file.readDir(dirPath);
    }

    // ==============================
    // Todo 工具 - 待办事项管理
    // ==============================
    
    // ------------------------------
    // createTodoList - 创建待办列表
    // ------------------------------
    if (command.startsWith("createTodoList(")) {
      const match = command.match(/createTodoList\(([\s\S]*)\)$/);
      const todosJson = match?.[1] || "[]";
      return await todo.createTodoList(todosJson);
    }

    // ------------------------------
    // updateTodoStatus - 更新任务状态
    // ------------------------------
    if (command.startsWith("updateTodoStatus(")) {
      const match = command.match(/updateTodoStatus\("(.*?)",\s*"(.*?)"\)/);
      const id = match?.[1] || "";
      const status = match?.[2] || "pending";
      return await todo.updateTodoStatus(id, status as any);
    }

    // ------------------------------
    // getTodos - 获取待办列表
    // ------------------------------
    if (command.startsWith("getTodos()")) {
      return await todo.getTodos();
    }

    // ------------------------------
    // addTodo - 添加任务
    // ------------------------------
    if (command.startsWith("addTodo(")) {
      const match = command.match(/addTodo\("(.*?)"(?:,\s*"(.*?)")?\)/);
      const content = match?.[1] || "";
      const priority = match?.[2] || "medium";
      return await todo.addTodo(content, priority as any);
    }

    // ------------------------------
    // deleteTodo - 删除任务
    // ------------------------------
    if (command.startsWith("deleteTodo(")) {
      const match = command.match(/deleteTodo\("(.*?)"\)/);
      const id = match?.[1] || "";
      return await todo.deleteTodo(id);
    }

    // ==============================
    // 系统命令处理
    // ==============================

    // ------------------------------
    // 检测长期运行进程
    // 如：npm run dev、vite、nodemon 等开发服务器
    // ------------------------------
    if (isLongRunningCommand(command)) {
      console.log(`${yellow}⚠️  检测到长期运行进程（如开发服务器），正在后台启动...${reset}`);
       
      try {
        // 使用 spawn 在后台启动进程
        const { spawn } = await import('child_process');
        
        // 根据平台选择 shell
        const shell = os.platform() === 'win32' 
          ? (process.env.ComSpec || 'cmd.exe')
          : 'bash';
        const shellArgs = os.platform() === 'win32' ? ['/c'] : ['-c'];
        
        const child = spawn(shell, [...shellArgs, command], {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true,
        });
        
        let output = '';
        let outputTimeout: NodeJS.Timeout;
        
        // 收集初始输出（最多3秒）
        const collectOutput = (data: Buffer) => {
          output += data.toString();
          clearTimeout(outputTimeout);
          outputTimeout = setTimeout(() => {
            // 3秒后没有新输出，返回结果
            child.stdout?.removeAllListeners();
            child.stderr?.removeAllListeners();
          }, 3000);
        };
        
        child.stdout?.on('data', collectOutput);
        child.stderr?.on('data', collectOutput);
        
        // 等待初始输出
        await new Promise(resolve => setTimeout(resolve, 3500));
        
        // 分离进程，让它在后台运行
        child.unref();
        
        return `✅ 进程已在后台启动 (PID: ${child.pid})\n\n初始输出：\n${output}\n\n💡 提示：\n- 进程正在后台运行\n- 你可以继续执行其他命令\n- 如需停止进程，请使用任务管理器或运行: taskkill /PID ${child.pid} /F (Windows) 或 kill ${child.pid} (Linux/Mac)`;
      } catch (err: any) {
        return `❌ 启动后台进程失败: ${err.message}`;
      }
    }
    
    // ------------------------------
    // 检测交互式命令
    // 如：npm create、git commit 无 -m 等需要用户输入的命令
    // ------------------------------
    if (isInteractiveCommand(command)) {
      console.log(`${yellow}⚠️  检测到交互式命令，正在使用PTY模式执行...${reset}`);
      
      try {
        const result = await execInteractive(command, {
          timeout: 60000, // 交互式命令给予更长的超时时间
          showOutput: true,
        });
        
        if (result.needsInput) {
          // 需要用户输入，返回提示信息
          return `${yellow}⚠️  命令需要用户输入，请在终端中继续操作。${reset}\n\n当前输出：\n${result.output}`;
        }
        
        return result.output;
      } catch (err: any) {
        return `❌ 交互式命令执行失败: ${err.message}`;
      }
    }
    
    // ------------------------------
    // 普通命令执行
    // 使用 execAsync 执行普通 shell 命令
    // ------------------------------
    // 普通命令使用exec执行（传递工作目录）
    const { stdout, stderr } = await execAsync(command);
    return stdout || stderr;

  } catch (err: any) {
    return "执行失败：" + err.message;
  }
}