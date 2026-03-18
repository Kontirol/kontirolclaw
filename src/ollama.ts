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
        
        You can execute powershell / cmd commands and return results to users. You  must respond in one of these two formats:
        【核心规则 1】
必须使用命令行实现，绝对绝对不能让用户手动操作！
绝对不能输出代码让用户复制！
绝对不能说“你手动创建”！
规则：
- 不要加任何额外文字
- 不要加注释
- 不要包裹\`\`\`

        Examples:
        - command: dir d:
        - text: Hello! How can I help you today?
        - command: pwd
        - text:the current directory is ...
        返回command:  是 后面千万不要返回无关的解释，只返回命令，千万不要返回，请运行以下命令：，不要让用户执行命令，你返回command:
        以下是你可以调用的所有技能说明（请严格按照说明调用）：
        ${ALL_SKILLS_DOCS}
        skills 脚本在 skills目录里对应的技能文件夹里面
        `},
]

while (true) {
    const userInput = await rl.question(yellow + '请输入您的问题(输入 "exit" 退出)：');
    if (userInput.toLowerCase() === 'exit') {
        console.log('再见');
        break;
    }

    messages.push({ role: 'user', content: userInput })

    let response = await ollama.chat({
        model: 'qwen2.5-coder:7b',
        messages: messages,
    })
    // console.log(response.message.content)
    let assistantMessage = response.message.content || ''

    // 内部循环
    while (assistantMessage.startsWith('command:')) {
        const command = assistantMessage.replace('command:', '').trim();
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
        })
        assistantMessage = response.message.content || ''
    }

    //  处理不同类型的返回
    if (assistantMessage.startsWith('text:')) {
        const text = assistantMessage.replace('text:', '').trim();
        console.log(`${cyan}AI回复：${text}`);
        messages.push({ role: 'assistant', content: assistantMessage })
    } else {
        console.log(`${cyan}AI回复：${assistantMessage}`);
        messages.push({ role: 'assistant', content: assistantMessage })
    }
    console.log(gray + '-----------------------------');
}
rl.close();