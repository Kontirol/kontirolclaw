/**
 * KontirolClaw 主入口文件 - Ollama 本地模型模式
 * 
 * 该文件是 KontirolClaw 应用的另一个入口，使用本地 Ollama 模型作为后端
 * 功能与 index.ts (OpenAI模式) 相同，只是后端不同
 * 
 * 核心流程：
 * 1. 初始化 Ollama 客户端和会话管理器
 * 2. 加载技能（Skills）文档
 * 3. 创建/恢复会话
 * 4. 进入主循环：获取用户输入 → 调用AI → 执行命令 → 返回结果
 * 
 * 使用方式：
 * - npm run ollama        - 启动应用（恢复上次会话或创建新会话）
 * - npm run ollama:new   - 创建全新会话
 * - npm run ollama:list  - 列出所有会话
 * - npm run ollama:session - 切换到指定会话
 */

// =============================================================
// 导入依赖模块
// =============================================================

import ollama from 'ollama'                                 // Ollama 本地模型库
import readline from 'readline/promises';                  // 异步读取用户输入
import { exec } from 'child_process';                       // 执行系统命令
import { promisify } from "util";                           // 将回调转为Promise
import fs from 'fs';                                        // 文件系统操作
import path from 'path';                                    // 路径处理
import os from 'os';                                       // 操作系统信息
import { fileURLToPath } from 'url';                       // ESM模块路径处理

// 导入自定义工具模块
import * as file from './tools/file.ts';                   // 文件操作工具
import * as todo from './tools/todo.ts';                   // 待办事项工具
import { isInteractiveCommand, execInteractive, isLongRunningCommand } from './tools/interactive.ts';  // 交互式命令工具
import { SessionManager } from './session/session-manager.ts';  // 会话管理器

// =============================================================
// 类型定义
// =============================================================

/**
 * 会话消息类型（内联定义）
 * 与 session/types.ts 中的定义保持一致
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

/** 重置颜色 */
const reset = "\x1b[0m";
/** 绿色 - 显示执行的命令 */
const green = "\x1b[32m";
/** 青色 - 显示AI回复 */
const cyan = "\x1b[36m";
/** 黄色 - 提示信息 */
const yellow = "\x1b[33m";
/** 灰色 - 分割线 */
const gray = "\x1b[90m";
/** 红色 - 错误信息 */
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
 * AI模型会根据这些文档了解可用的技能
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

// 预加载所有技能文档
const ALL_SKILLS_DOCS = loadAllSkills();

// =============================================================
// 工具函数别名
// =============================================================

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

// =============================================================
// 系统消息（Prompt）
// =============================================================

/**
 * 系统消息 - 告诉AI模型如何工作
 * 包含：AI角色定义、输出格式要求、可用工具说明、技能文档
 */
const systemMessageContent = `You are a helpful ai agent. your name is KontirolClaw,你的开发者 是 Nijat (Kontirol)
        
        You can execute powershell / cmd commands and return results to users. You  must respond in one of these two formats:
        不要包含 \'\'\'
        1.{"exec":"<bash command>"} - when you need execute a bash command and you can also call built-in skills
        2.{"text":"<responsi>"} - when you want to return  normal text response

        Examples:
        - {"exec":"dir d:"}
        - {"text":"Hello! How can I help you today?"}
        - {"exec":"pwd"}
        - {"text":"the current directory is ..."}

        当用户下发某个任务时，如果任务还没完成千万不能返回 textiquez返回 exec,你返回exec以后，用户会把执行结果给你返回，你看着结果判断，如果完成了你才发text,不然一直返回exec,
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

        如果用户让你写代码，你就不要用 \\
         \\ 这种转义字符

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

// 初始化会话管理器
const sessionManager = new SessionManager();

// =============================================================
// 命令行参数解析
// =============================================================

/** 是否创建新会话 */
const shouldCreateNewSession = process.argv.includes('--new-session');
/** 是否列出所有会话 */
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
 * 将 Ollama 格式的消息转换为 SessionMessage 格式
 * @param msg - Ollama消息对象
 * @returns SessionMessage对象
 */
function ollamaToSessionMessage(msg: any): SessionMessage {
  return {
    role: msg.role,
    content: msg.content
  };
}

/**
 * 将 SessionMessage 格式转换为 Ollama 格式
 * @param msg - SessionMessage对象
 * @returns Ollama格式消息
 */
function sessionMessageToOllama(msg: SessionMessage): any {
  return {
    role: msg.role,
    content: msg.content
  };
}

// =============================================================
// 会话初始化逻辑
// =============================================================

// 消息历史数组
let messages: any[] = [];

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
  messages = [systemMessageContent];
  console.log(yellow + '创建了新会话' + reset);
} else if (targetSessionId) {
  // 切换到指定会话
  const session = sessionManager.loadSession(targetSessionId);
  if (session && session.messages.length > 0) {
    messages = session.messages.map(sessionMessageToOllama);
    console.log(yellow + `切换到会话: "${session.title}" (${session.messages.length} 条消息)` + reset);
  } else {
    console.log(red + `未找到会话: ${targetSessionId}` + reset);
    process.exit(1);
  }
} else {
  // 尝试恢复上次会话
  const lastSession = sessionManager.getLastActiveSession();
  if (lastSession && lastSession.messages.length > 0) {
    // 恢复消息，注意：系统消息已经包含在会话中
    messages = lastSession.messages.map(sessionMessageToOllama);
    console.log(yellow + `恢复了会话: "${lastSession.title}" (${lastSession.messages.length} 条消息)` + reset);
  } else {
    // 没有找到会话，创建新会话
    const initialMessages: SessionMessage[] = [
      { role: 'system', content: systemMessageContent }
    ];
    sessionManager.createSession(initialMessages);
    messages = [systemMessageContent];
    console.log(yellow + '创建了新会话' + reset);
  }
}

// =============================================================
// 自动保存机制
// =============================================================

/**
 * 自动保存会话
 * 每隔5条消息保存一次，避免频繁IO操作
 * @param currentMessages - 当前消息数组
 */
let saveCounter = 0;
function autoSaveSession(currentMessages: any[]) {
  // 转换为SessionMessage格式
  const sessionMessages: SessionMessage[] = currentMessages.map(ollamaToSessionMessage);
  // 每5次交互保存一次
  if (saveCounter % 5 === 0) {
    sessionManager.updateCurrentSession(sessionMessages);
  }
  saveCounter++;
}

// =============================================================
// JSON解析辅助函数
// =============================================================

/**
 * 强制解析JSON
 * 处理AI返回的各种格式
 * @param text - AI返回的文本
 * @returns 解析后的JSON字符串
 */
// json解析
function forcePureJson(text: string): string {
  if (!text) return '{"text":""}';
  text = text.replace(/```json|```/g, '').trim();
  
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      JSON.parse(trimmed);
      return trimmed; // 合法JSON，直接返回
    } catch {}
  }

  const m = text.match(/\{[\s\S]*?\}/);
  return m ? m[0].replace(/\n/g, ' ').trim()
      : `{"text":"${text.replace(/"/g, '\\"')}"}`;
}

// =============================================================
// 主循环
// =============================================================

/**
 * 主循环：持续获取用户输入、处理请求、返回结果
 * 循环直到用户输入 "exit"
 */
while (true) {
  // 获取用户输入
  const userInput = await rl.question(yellow + '请输入您的问题(输入 "exit" 退出)：' + reset);

  // 用户退出
  if (userInput.toLowerCase() === 'exit') {
    // 退出前保存会话
    const sessionMessages: SessionMessage[] = messages.map(ollamaToSessionMessage);
    sessionManager.updateCurrentSession(sessionMessages);
    console.log('再见');
    break;
  }

  // 添加用户消息到历史
  messages.push({ role: 'user', content: userInput });

  // 调用Ollama模型获取回复
  let response = await ollama.chat({
    model: 'qwen2.5:7b',  // 默认使用 qwen2.5:7b 模型
    messages: messages,
    options: { temperature: 0.2, top_p: 0.8, num_ctx: 4096 }
  });

  let assistantMessage = response.message.content || '';
  
  // 解析AI回复
  let aiMessage;
  let keys;
  try {
    aiMessage = JSON.parse(forcePureJson(assistantMessage.trim()));
    keys = Object.keys(aiMessage);
  } catch (e) {
    aiMessage = { text: assistantMessage };
    keys = ['text'];
  }

  /**
   * 内部循环：处理AI返回的exec命令
   * AI可能连续返回多个exec命令，需要循环执行
   */
  while (keys[0] === 'exec') {
    const command = aiMessage.exec;
    console.log(`${green}执行命令：${command}${reset}`);

    try {
      // 执行工具命令
      const result = await executeToolCommand(command);
      console.log(result);

      // 将命令和结果都添加到对话历史
      messages.push({ role: 'assistant', content: assistantMessage });
      messages.push({ role: 'user', content: `命令执行结果:\n${result}` });

    } catch (error: any) {
      const errorMsg = `命令执行错误: ${error.message}`;
      messages.push({ role: 'assistant', content: assistantMessage });
      messages.push({ role: 'user', content: errorMsg });
    }

    // 再次调用Ollama模型
    response = await ollama.chat({
      model: 'qwen2.5:7b',
      messages: messages,
      options: { temperature: 0.2, top_p: 0.8, num_ctx: 4096 }
    });
    assistantMessage = response.message.content || '';
    
    try {
      aiMessage = JSON.parse(forcePureJson(assistantMessage.trim()));
      keys = Object.keys(aiMessage);
    } catch (error) {
      aiMessage = { text: assistantMessage };
      keys = ['text'];
    }
  }

  // 处理不同类型的返回
  if (keys[0] === 'text') {
    const text = aiMessage.text;
    console.log(`${cyan}AI回复：${text}${reset}`);
    messages.push({ role: 'assistant', content: assistantMessage });
  } else {
    const text = aiMessage.text;
    console.log(`${cyan}AI回复：${text}${reset}`);
    messages.push({ role: 'assistant', content: assistantMessage });
  }
  
  // 自动保存会话
  autoSaveSession(messages);
  console.log(gray + '---' + reset);
}

// 关闭readline接口
rl.close();

// =====================================================================
// 命令执行工具函数（与 index.ts 完全一致）
// =====================================================================

/**
 * 执行AI返回的命令
 * 支持：文件操作、Todo操作、交互式命令、普通shell命令
 * @param command - AI返回的要执行的命令
 * @returns 命令执行结果（字符串）
 */
async function executeToolCommand(command: string) {
  try {
    /**
     * 解码AI转义的代码
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
    // Todo 工具
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

    // ------------------------------
    // 检测长期运行进程
    // ------------------------------
    if (isLongRunningCommand(command)) {
      console.log(`${yellow}⚠️  检测到长期运行进程（如开发服务器），正在后台启动...${reset}`);
      const { spawn } = await import('child_process');
      const shell = os.platform() === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'bash';
      const shellArgs = os.platform() === 'win32' ? ['/c'] : ['-c'];
      const child = spawn(shell, [...shellArgs, command], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
      let output = '';
      let outputTimeout: NodeJS.Timeout;
      const collectOutput = (data: Buffer) => { output += data.toString(); clearTimeout(outputTimeout); outputTimeout = setTimeout(()=>{},3000); }
      child.stdout?.on('data', collectOutput);
      child.stderr?.on('data', collectOutput);
      await new Promise(r => setTimeout(r,3500));
      child.unref();
      return `✅ 进程已在后台启动 (PID: ${child.pid})\n\n初始输出：\n${output}`;
    }

    // ------------------------------
    // 检测交互式命令
    // ------------------------------
    if (isInteractiveCommand(command)) {
      console.log(`${yellow}⚠️  检测到交互式命令，正在使用PTY模式执行...${reset}`);
      const result = await execInteractive(command, { timeout:60000, showOutput:true });
      if (result.needsInput) return `${yellow}⚠️  命令需要用户输入，请在终端中继续操作。${reset}\n\n当前输出：\n${result.output}`;
      return result.output;
    }

    // ------------------------------
    // 普通命令执行
    // ------------------------------
    const { stdout, stderr } = await execAsync(command);
    return stdout || stderr;

  } catch (err: any) {
    return "执行失败：" + err.message;
  }
}

// 颜色常量
const reset = "\x1b[0m";
const green = "\x1b[32m";   // 命令
const cyan = "\x1b[36m";    // AI 回复
const yellow = "\x1b[33m";  // 提示
const gray = "\x1b[90m";    // 分割线
const red = "\x1b[31m";    // 错误

// 修复：ESM 中手动获取 __dirname（必须加）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadAllSkills() {
    const skillRoot = path.join(__dirname, '../skills');
    const skillDirs = fs.readdirSync(skillRoot).filter(dir => {
        return fs.statSync(path.join(skillRoot, dir)).isDirectory();
    });

    const docs: string[] = [];
    for (const dir of skillDirs) {
        const docPath = path.join(skillRoot, dir, 'SKILL.md');
        if (fs.existsSync(docPath)) {
            const content = fs.readFileSync(docPath, 'utf8');
            docs.push(`### ${dir}\n${content}`);
        }
    }
    return docs.join('\n\n');
}

// 读取所有技能说明文档
const ALL_SKILLS_DOCS = loadAllSkills();

const execAsync = promisify(exec);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})

// 系统消息
const systemMessageContent = `You are a helpful ai agent. your name is KontirolClaw,你的开发者 是 Nijat (Kontirol)
        
        You can execute powershell / cmd commands and return results to users. You  must respond in one of these two formats:
        不要包含 \'\'\'
        1.{\"exec\":\"<bash command>\"} - when you need execute a bash command and you can also call built-in skills
        2.{\"text\":\"<responsi>\"} - when you want to return  normal text response

        Examples:
        - {\"exec\":\"dir d:\"}
        - {\"text\":\"Hello! How can I help you today?\"}
        - {\"exec\":\"pwd\"}
        - {\"text\":\"the current directory is ...\"}

        当用户下发某个任务时，如果任务还没完成，千万不能返回 text，必须要返回 exec,你返回exec以后，用户会把执行结果给你返回，你看着结果判断，如果完成了你才发text,不然一直返回exec,
        比如
        用户：查看当前目录,并查看IP;
        你:{\"exec\":\"dir\"}
        用户：dir 的执行结果
        你：{\"exec\":\"ipconfig\"}
        用户：ipconfig 的执行结果
        你看着这些内容，判断是否完成了，是的话就才返回text

        你可以调用以下文件操作工具，直接用函数名调用：

文件操作工具：
1. readFile(\"路径\")      - 读取文件
2. createFile(\"路径\")    - 创建空文件
3. editFile(\"路径\",\"内容\") - 写入/修改文件
4. deleteFile(\"路径\")    - 删除文件
5. readDir(\"目录\")       - 查看文件夹

Todo任务管理工具（用于跟踪你的任务进度）：
1. createTodoList(任务数组) - 创建/更新整个todo列表，参数是JSON数组，每个任务包含：id(必填), content(必填), status(pending/in_progress/completed), priority(high/medium/low)
2. updateTodoStatus(\"任务ID\", \"新状态\") - 更新单个任务状态
3. getTodos() - 获取当前todo列表，显示所有任务和进度
4. addTodo(\"任务内容\", \"优先级\") - 添加单个任务
5. deleteTodo(\"任务ID\") - 删除任务

当用户给你复杂任务时，你应该先创建todo列表来跟踪进度，然后逐步执行，每完成一步就更新任务状态。

如果用户让你写代码，你就不要用 \\\
 \\ 这种转义字符

调用示例：
文件操作：
{\"exec\":\"readFile(\\\"test.txt\\\")\"}
{\"exec\":\"createFile(\\\"notes.md\\\")\"}
{\"exec\":\"editFile(\\\"notes.md\\\",\\\"# 我是内容\\\")\"}
{\"exec\":\"deleteFile(\\\"notes.md\\\")\"}
{\"exec\":\"readDir(\\\"./\\\")\"}

Todo操作：
{\"exec\":\"createTodoList([{\\\"id\\\":\\\"1\\\",\\\"content\\\":\\\"查看目录\\\",\\\"status\\\":\\\"pending\\\",\\\"priority\\\":\\\"high\\\"},{\\\"id\\\":\\\"2\\\",\\\"content\\\":\\\"创建文件\\\",\\\"status\\\":\\\"pending\\\",\\\"priority\\\":\\\"medium\\\"}])\"}
{\"exec\":\"updateTodoStatus(\\\"1\\\",\\\"in_progress\\\")\"}
{\"exec\":\"getTodos()\"}
{\"exec\":\"addTodo(\\\"新任务\\\",\\\"high\\\")\"}
{\"exec\":\"deleteTodo(\\\"1\\\")\"}

重要提示 - 交互式命令处理：
当执行需要用户输入的命令时（如 npm create、git commit 无 -m 等），系统会自动检测并使用PTY模式执行。
如果命令需要用户交互，系统会提示用户在终端中继续操作。
常见的交互式命令包括：npm create、npm init、git commit（无-m）、ssh连接等。
建议：对于创建项目等命令，尽量使用非交互式参数，如 npm create vue@latest my-app -- --default

重要提示 - 长期运行进程处理：
当执行开发服务器等长期运行的命令时（如 npm run dev、npm start、vite 等），系统会自动在后台启动进程。
进程启动后会显示初始输出和进程ID（PID），你可以继续执行其他命令。
如需停止后台进程，请使用任务管理器或运行: taskkill /PID <PID> /F (Windows) 或 kill <PID> (Linux/Mac)
        

        用户让你用skills 或者 skill 你再调用，不然你就用自己的工具，千万不要调用skill.
        The following are the specifications for all the skills you can invoke (please follow them strictly).
        ${ALL_SKILLS_DOCS}
        The skills script is located in the current \"skill\" folder.
        如果skills 文件夹里有脚本，比如 python ts js ， 你可以按照它的文档直接运行它，不用自己写代码执行。不要执行 python -c \"\"
        `;

// 初始化会话管理器
const sessionManager = new SessionManager();

// 检查命令行参数
const shouldCreateNewSession = process.argv.includes('--new-session');
const listSessions = process.argv.includes('--list');

// 会话管理命令处理
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

// 检查是否要切换会话
const sessionArg = process.argv.find(arg => arg.startsWith('--session='));
let targetSessionId: string | null = null;
if (sessionArg) {
    targetSessionId = sessionArg.replace('--session=', '');
}

// 转换消息格式：Ollama格式（与OpenAI格式相同） -> SessionMessage
function ollamaToSessionMessage(msg: any): SessionMessage {
    return {
        role: msg.role,
        content: msg.content
    };
}

// 转换消息格式：SessionMessage -> Ollama格式
function sessionMessageToOllama(msg: SessionMessage): any {
    return {
        role: msg.role,
        content: msg.content
    };
}

// 初始化消息数组
let messages: any[] = [];

// 尝试恢复会话或创建新会话
if (shouldCreateNewSession) {
    // 创建新会话，包含系统消息
    const initialMessages: SessionMessage[] = [
        { role: 'system', content: systemMessageContent }
    ];
    sessionManager.createSession(initialMessages);
    messages = [systemMessageContent];
    console.log(yellow + '创建了新会话' + reset);
} else if (targetSessionId) {
    // 切换到指定会话
    const session = sessionManager.loadSession(targetSessionId);
    if (session && session.messages.length > 0) {
        messages = session.messages.map(sessionMessageToOllama);
        console.log(yellow + `切换到会话: "${session.title}" (${session.messages.length} 条消息)` + reset);
    } else {
        console.log(red + `未找到会话: ${targetSessionId}` + reset);
        process.exit(1);
    }
} else {
    // 尝试恢复上次会话
    const lastSession = sessionManager.getLastActiveSession();
    if (lastSession && lastSession.messages.length > 0) {
        // 恢复消息，注意：系统消息已经包含在会话中，所以我们直接使用会话中的消息
        messages = lastSession.messages.map(sessionMessageToOllama);
        console.log(yellow + `恢复了会话: "${lastSession.title}" (${lastSession.messages.length} 条消息)` + reset);
    } else {
        // 没有找到会话，创建新会话
        const initialMessages: SessionMessage[] = [
            { role: 'system', content: systemMessageContent }
        ];
        sessionManager.createSession(initialMessages);
        messages = [systemMessageContent];
        console.log(yellow + '创建了新会话' + reset);
    }
}

// 保存会话的函数（每隔5条消息保存一次，避免频繁IO）
let saveCounter = 0;
function autoSaveSession(currentMessages: any[]) {
    // 将当前消息转换为SessionMessage格式
    const sessionMessages: SessionMessage[] = currentMessages.map(ollamaToSessionMessage);
    // 每5次交互保存一次
    if (saveCounter % 5 === 0) {
        sessionManager.updateCurrentSession(sessionMessages);
    }
    saveCounter++;
}

// json解析
function forcePureJson(text: string): string {
    if (!text) return '{\"text\":\"\"}';
    text = text.replace(/```json|```/g, '').trim();
    
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            JSON.parse(trimmed);
            return trimmed; // 合法JSON，直接返回
        } catch {}
    }

    const m = text.match(/\{[\s\S]*?\}/);
    return m ? m[0].replace(/\n/g, ' ').trim()
        : `{"text":"${text.replace(/"/g, '\\"')}"}`;
}

// 主循环
while (true) {
    const userInput = await rl.question(yellow + '请输入您的问题(输入 \"exit\" 退出)：' + reset);

    if (userInput.toLowerCase() === 'exit') {
        // 退出前保存会话
        const sessionMessages: SessionMessage[] = messages.map(ollamaToSessionMessage);
        sessionManager.updateCurrentSession(sessionMessages);
        console.log('再见');
        break;
    }

    messages.push({ role: 'user', content: userInput });

    let response = await ollama.chat({
        model: 'qwen2.5:7b',
        messages: messages,
        options: { temperature: 0.2, top_p: 0.8, num_ctx: 4096 }
    });

    let assistantMessage = response.message.content || '';
    
    let aiMessage;
    let keys;
    try {
        aiMessage = JSON.parse(forcePureJson(assistantMessage.trim()));
        keys = Object.keys(aiMessage);
    } catch (e) {
        aiMessage = { text: assistantMessage };
        keys = ['text'];
    }

    // 内部 exec 循环
    while (keys[0] === 'exec') {
        const command = aiMessage.exec;
        console.log(`${green}执行命令：${command}${reset}`);

        try {
            const result = await executeToolCommand(command);
            console.log(result);

            messages.push({ role: 'assistant', content: assistantMessage });
            messages.push({ role: 'user', content: `命令执行结果:\
${result}` });

        } catch (error: any) {
            const errorMsg = `命令执行错误: ${error.message}`;
            messages.push({ role: 'assistant', content: assistantMessage });
            messages.push({ role: 'user', content: errorMsg });
        }

        response = await ollama.chat({
            model: 'qwen2.5:7b',
            messages: messages,
            options: { temperature: 0.2, top_p: 0.8, num_ctx: 4096 }
        });
        assistantMessage = response.message.content || '';
        
        try {
            aiMessage = JSON.parse(forcePureJson(assistantMessage.trim()));
            keys = Object.keys(aiMessage);
        } catch (error) {
            aiMessage = { text: assistantMessage };
            keys = ['text'];
        }
    }

    // 输出 text
    if (keys[0] === 'text') {
        const text = aiMessage.text;
        console.log(`${cyan}AI回复：${text}${reset}`);
        messages.push({ role: 'assistant', content: assistantMessage });
    } else {
        const text = aiMessage.text;
        console.log(`${cyan}AI回复：${text}${reset}`);
        messages.push({ role: 'assistant', content: assistantMessage });
    }
    // 自动保存会话
    autoSaveSession(messages);
    console.log(gray + '---' + reset);
}

rl.close();

// =====================================================================
// executeToolCommand 完全与线上版一致
// =====================================================================
async function executeToolCommand(command: string) {
  try {
    function decodeAICode(content: string): string {
      if (!content) return "";
      return content
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "")
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, "\\");
    }

    if (command.startsWith("readFile(")) {
      const filePath = command.match(/readFile\("(.*?)"\)/)?.[1] || "";
      return await file.readFile(filePath);
    }

    if (command.startsWith("createFile(")) {
      const filePath = command.match(/createFile\("(.*?)"\)/)?.[1] || "";
      return await file.createFile(filePath);
    }

    if (command.startsWith("editFile(")) {
      const match = command.match(/editFile\("(.*?)",\\s*"([\\s\\S]*)"\)$/);
      const filePath = match?.[1] || "";
      const content = match?.[2] || "";
      const realContent = decodeAICode(content);
      return await file.editFile(filePath, realContent);
    }

    if (command.startsWith("deleteFile(")) {
      const filePath = command.match(/deleteFile\("(.*?)"\)/)?.[1] || "";
      return await file.deleteFile(filePath);
    }

    if (command.startsWith("readDir(")) {
      const dirPath = command.match(/readDir\("(.*?)"\)/)?.[1] || "./";
      return await file.readDir(dirPath);
    }

    if (command.startsWith("createTodoList(")) {
      const match = command.match(/createTodoList\(([\\s\\S]*)\)$/);
      const todosJson = match?.[1] || "[]";
      return await todo.createTodoList(todosJson);
    }

    if (command.startsWith("updateTodoStatus(")) {
      const match = command.match(/updateTodoStatus\("(.*?)",\\s*"(.*?)"\)/);
      const id = match?.[1] || "";
      const status = match?.[2] || "pending";
      return await todo.updateTodoStatus(id, status as any);
    }

    if (command.startsWith("getTodos()")) {
      return await todo.getTodos();
    }

    if (command.startsWith("addTodo(")) {
      const match = command.match(/addTodo\("(.*?)"(?:,\\\s*"(.*?)")?\)/);
      const content = match?.[1] || "";
      const priority = match?.[2] || "medium";
      return await todo.addTodo(content, priority as any);
    }

    if (command.startsWith("deleteTodo(")) {
      const match = command.match(/deleteTodo\("(.*?)"\)/);
      const id = match?.[1] || "";
      return await todo.deleteTodo(id);
    }

    if (isLongRunningCommand(command)) {
      console.log(`${yellow}⚠️  检测到长期运行进程（如开发服务器），正在后台启动...${reset}`);
      const { spawn } = await import('child_process');
      const shell = os.platform() === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'bash';
      const shellArgs = os.platform() === 'win32' ? ['/c'] : ['-c'];
      const child = spawn(shell, [...shellArgs, command], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
      let output = '';
      let outputTimeout: NodeJS.Timeout;
      const collectOutput = (data: Buffer) => { output += data.toString(); clearTimeout(outputTimeout); outputTimeout = setTimeout(()=>{},3000); }
      child.stdout?.on('data', collectOutput);
      child.stderr?.on('data', collectOutput);
      await new Promise(r => setTimeout(r,3500));
      child.unref();
      return `✅ 进程已在后台启动 (PID: ${child.pid})\
\
初始输出：\
${output}`;
    }

    if (isInteractiveCommand(command)) {
      console.log(`${yellow}⚠️  检测到交互式命令，正在使用PTY模式执行...${reset}`);
      const result = await execInteractive(command, { timeout:60000, showOutput:true });
      if (result.needsInput) return `${yellow}⚠️  命令需要用户输入，请在终端中继续操作。${reset}\
\
当前输出：\
${result.output}`;
      return result.output;
    }

    const { stdout, stderr } = await execAsync(command);
    return stdout || stderr;

  } catch (err: any) {
    return "执行失败：" + err.message;
  }
}
