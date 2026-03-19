import ollama from 'ollama'
import readline from 'readline/promises'
import { exec } from 'child_process'
import { promisify } from "util";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
                const { stdout, stderr } = await execAsync(command);
                const result = stdout || stderr
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