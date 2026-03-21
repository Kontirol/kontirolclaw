import ollama from 'ollama'
import readline from 'readline/promises'
import { exec } from 'child_process'
import { promisify } from "util";
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import * as file from './tools/file.ts'
import * as todo from './tools/todo.ts'
import { isInteractiveCommand, execInteractive, isLongRunningCommand } from './tools/interactive.ts'

// 颜色常量
const reset = "\x1b[0m";
const green = "\x1b[32m";   // 命令
const cyan = "\x1b[36m";    // AI 回复
const yellow = "\x1b[33m";  // 提示
const gray = "\x1b[90m";    // 分割线

// 修复：ESM 中手动获取 __dirname（必须加）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


function loadAllSkills() {
    const skillRoot = path.join(__dirname, '../skills');
    const skillDirs = fs.readdirSync(skillRoot).filter(dir => {
        return fs.statSync(path.join(skillRoot, dir)).isDirectory();
    });

    const docs = [];
    for (const dir of skillDirs) {
        const docPath = path.join(skillRoot, dir, 'README.md');
        if (fs.existsSync(docPath)) {
            const content = fs.readFileSync(docPath, 'utf8');
            docs.push(`### ${dir}\n${content}`);
        }
    }
    return docs.join('\n\n');
}

// 读取所有技能说明文档
const ALL_SKILLS_DOCS = loadAllSkills();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})

const execAsync = promisify(exec);

// 执行工具命令
async function executeToolCommand(command: string) {
  try {
    // 解码 AI 转义的代码：把 \n 变成换行，\" 变成 "
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
    // readFile
    // ------------------------------
    if (command.startsWith("readFile(")) {
      const filePath = command.match(/readFile\("(.*?)"\)/)?.[1] || "";
      return await file.readFile(filePath);
    }

    // ------------------------------
    // createFile
    // ------------------------------
    if (command.startsWith("createFile(")) {
      const filePath = command.match(/createFile\("(.*?)"\)/)?.[1] || "";
      return await file.createFile(filePath);
    }

    // ------------------------------
    // editFile
    // ------------------------------
    if (command.startsWith("editFile(")) {
      const match = command.match(/editFile\("(.*?)",\s*"([\s\S]*)"\)$/);
      const filePath = match?.[1] || "";
      const content = match?.[2] || "";
      const realContent = decodeAICode(content);
      return await file.editFile(filePath, realContent);
    }

    // ------------------------------
    // deleteFile
    // ------------------------------
    if (command.startsWith("deleteFile(")) {
      const filePath = command.match(/deleteFile\("(.*?)"\)/)?.[1] || "";
      return await file.deleteFile(filePath);
    }

    // ------------------------------
    // readDir
    // ------------------------------
    if (command.startsWith("readDir(")) {
      const dirPath = command.match(/readDir\("(.*?)"\)/)?.[1] || "./";
      return await file.readDir(dirPath);
    }

    // ==============================
    // Todo 工具
    // ==============================
    
    // ------------------------------
    // createTodoList
    // ------------------------------
    if (command.startsWith("createTodoList(")) {
      const match = command.match(/createTodoList\(([\s\S]*)\)$/);
      const todosJson = match?.[1] || "[]";
      return await todo.createTodoList(todosJson);
    }

    // ------------------------------
    // updateTodoStatus
    // ------------------------------
    if (command.startsWith("updateTodoStatus(")) {
      const match = command.match(/updateTodoStatus\("(.*?)",\s*"(.*?)"\)/);
      const id = match?.[1] || "";
      const status = match?.[2] || "pending";
      return await todo.updateTodoStatus(id, status as any);
    }

    // ------------------------------
    // getTodos
    // ------------------------------
    if (command.startsWith("getTodos()")) {
      return await todo.getTodos();
    }

    // ------------------------------
    // addTodo
    // ------------------------------
    if (command.startsWith("addTodo(")) {
      const match = command.match(/addTodo\("(.*?)"(?:,\s*"(.*?)")?\)/);
      const content = match?.[1] || "";
      const priority = match?.[2] || "medium";
      return await todo.addTodo(content, priority as any);
    }

    // ------------------------------
    // deleteTodo
    // ------------------------------
    if (command.startsWith("deleteTodo(")) {
      const match = command.match(/deleteTodo\("(.*?)"\)/);
      const id = match?.[1] || "";
      return await todo.deleteTodo(id);
    }

    // ------------------------------
    // 系统命令
    // ------------------------------
    // 检测是否为长期运行进程
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
    
    // 检测是否为交互式命令
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
    
    // 普通命令使用exec执行（传递工作目录）
    const { stdout, stderr } = await execAsync(command);
    return stdout || stderr;

  } catch (err: any) {
    return "执行失败：" + err.message;
  }
}

const messages = [
    {
        role: "system", content: `You are a helpful ai agent. 你的名字是 KontirolClaw
        
        You can execute powershell / cmd commands and return results to users. a strict AI agent that ONLY outputs PURE JSON:
        【核心规则 1】
            必须使用命令行实现，绝对绝对不能让用户手动操作！
            绝对不能输出代码让用户复制！
            绝对不能说“你手动创建”！
        规则：
            - 要返回纯json
            - 不要加任何额外文字
            - 不要加注释
            - 不要包裹\`\`\`

        1.{"exec":"<bash command>"} - when you need execute a bash command and you can also call built-in skills
        2.{"text":"<responsi>"} - when you want to return  normal text response

        Examples:
        - {"exec":"dir d:"}
        - {"text":"Hello! How can I help you today?"}
        - {"exec":"pwd"}
        - {"text”:"the current directory is ..."}
        千万不要返回 \'\'\' bash.... , 要返回 {"exec":"<command>"},
        以下是你可以调用的所有技能说明（请严格按照说明调用）：
        ${ALL_SKILLS_DOCS}
        skills 脚本在 skills目录里对应的技能文件夹里面

        你还可以使用以下Todo任务管理工具（用于跟踪你的任务进度）：
        1. createTodoList(任务数组) - 创建/更新整个todo列表，参数是JSON数组，每个任务包含：id(必填), content(必填), status(pending/in_progress/completed), priority(high/medium/low)
        2. updateTodoStatus("任务ID", "新状态") - 更新单个任务状态
        3. getTodos() - 获取当前todo列表，显示所有任务和进度
        4. addTodo("任务内容", "优先级") - 添加单个任务
        5. deleteTodo("任务ID") - 删除任务

        当用户给你复杂任务时，你应该先创建todo列表来跟踪进度，然后逐步执行，每完成一步就更新任务状态。

        重要提示 - 交互式命令处理：
        当执行需要用户输入的命令时（如 npm create、git commit 无 -m 等），系统会自动检测并使用PTY模式执行。
        如果命令需要用户交互，系统会提示用户在终端中继续操作。
        常见的交互式命令包括：npm create、npm init、git commit（无-m）、ssh连接等。
        建议：对于创建项目等命令，尽量使用非交互式参数，如 npm create vue@latest my-app -- --default

        重要提示 - 长期运行进程处理：
        当执行开发服务器等长期运行的命令时（如 npm run dev、npm start、vite 等），系统会自动在后台启动进程。
        进程启动后会显示初始输出和进程ID（PID），你可以继续执行其他命令。
        如需停止后台进程，请使用任务管理器或运行: taskkill /PID <PID> /F (Windows) 或 kill <PID> (Linux/Mac)。

        规则：
            - 要返回纯json
            - 不要加任何额外文字
            - 不要加注释
            - 不要包裹\`\`\`
        `},
]

// ====================== 终极清理函数（不管 AI 怎么乱输出都能修好）======================
function forcePureJson(text:any) {
    if (!text) return '{"text":""}';
    text = text.replace(/```json|```/g, '').trim();
    
    // 🔥 修复：只取【第一个】{...}，忽略后面多余的
    const matches = text.match(/\{[\s\S]*?\}/g);
    if (matches && matches.length > 0) {
        return matches[0].replace(/\n/g, ' ').trim();
    }
    
    return `{"text":"${text.replace(/"/g, '\\"')}"}`;
}

while (true) {
    const userInput = await rl.question(yellow + '请输入您的问题(输入 "exit" 退出)：');
    if (userInput.toLowerCase() === 'exit') {
        console.log('再见');
        break;
    }

    messages.push({ role: 'user', content: userInput })

    let response = await ollama.chat({
        model: 'qwen2.5:7b',
        messages: messages,
        options: {
    temperature: 0.2,
    top_p: 0.8,
    num_ctx: 4096
  }
    })
    // console.log(response.message.content)
    let assistantMessage = forcePureJson(response.message.content || '')

    let aiMessage
    let keys
    // 内部循环
    while (true) {
        try {
            aiMessage = JSON.parse(assistantMessage.trim());
            keys = Object.keys(aiMessage);
        } catch (error) {
            aiMessage = { text: assistantMessage };
            keys = ['text'];
        }
        if (keys[0] == "exec") {
            const command = aiMessage.exec
            console.log(`${green}执行命令：${command}`);

            try {
                const result = await executeToolCommand(command);
                // console.log(result);

                // 将命令和结果都添加到对话历史
                messages.push({ role: 'assistant', content: assistantMessage })
                messages.push({ role: 'user', content: `命令执行结果:\n${result}` })

            } catch (error: any) {
                const errorMsg = `命令执行错误: ${error.message}`;
                // console.log(errorMsg);
                messages.push({ role: 'assistant', content: assistantMessage })
                messages.push({ role: 'user', content: errorMsg })
            }

            response = await ollama.chat({
                model: 'qwen2.5:7b',
                messages: messages,
                options: {
    temperature: 0.2,
    top_p: 0.8,
    num_ctx: 4096
  }
            })
            assistantMessage = forcePureJson(response.message.content || '')
            try {
                aiMessage = JSON.parse(assistantMessage.trim());
                keys = Object.keys(aiMessage)
            } catch (error) {
                aiMessage = { text: assistantMessage };
                keys = ['text'];
            }
        }else{
            break
        }
    }

    //  处理不同类型的返回
    if (keys[0] === 'text') {
        const text = aiMessage.text
        console.log(`${cyan}AI回复：${text}`);
        messages.push({ role: 'assistant', content: assistantMessage })
    } else {
        console.log(`${cyan}AI回复：${assistantMessage}`);
        messages.push({ role: 'assistant', content: assistantMessage })
    }
    console.log(gray + '-----------------------------');
}
rl.close();