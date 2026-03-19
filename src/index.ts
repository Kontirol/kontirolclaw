import OpenAI from "openai";
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

const client = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'],
    baseURL: process.env['OPENAI_BASE_URL'],
});

// 上下文
const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
        role: "system", content: `You are a helpful ai agent. your name is KontirolClaw
        
        You can execute powershell / cmd commands and return results to users. You  must respond in one of these two formats:
        不要包含 \'\'\'
        1.{"exec":"<bash command>"} - when you need execute a bash command and you can also call built-in skills
        2.{"text":"<responsi>"} - when you want to return  normal text response

        Examples:
        - {"exec":"dir d:"}
        - {"text":"Hello! How can I help you today?"}
        - {"exec":"pwd"}
        - {"text”:"the current directory is ..."}

        当用户下发某个任务时，如果任务还没完成，千万不能返回 text，必须要返回 exec,你返回exec以后，用户会把执行结果给你返回，你看着结果判断，如果完成了你才发text，不然一直返回exec,
        比如
        用户：查看当前目录,并查看IP;
        你:{"exec":"dir"}
        用户：dir 的执行结果
        你：{"exec":"ipconfig"}
        用户：ipconfig 的执行结果
        你看着这些内容，判断是否完成了，是的话就才返回text
        

        The following are the specifications for all the skills you can invoke (please follow them strictly).
        ${ALL_SKILLS_DOCS}
        The skills script is located in the current "skill" folder. There might be some Python files or other code files there. Just follow the instructions in the documentation to run that script.
        `},
]
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
            return trimmed; // 合法JSON，直接返回
        } catch {}
    }

    // 不合法才去提取第一个 {...}，没有就兜底包装
    const m = text.match(/\{[\s\S]*?\}/);
    return m ? m[0].replace(/\n/g, ' ').trim()
        : `{"text":"${text.replace(/"/g, '\\"')}"}`;
}
while (true) {
    const userInput = await rl.question(yellow + '请输入您的问题(输入 "exit" 退出)：');

    if (userInput.toLowerCase() === 'exit') {
        console.log('再见');
        break;
    }

    messages.push({ role: 'user', content: userInput })

    let completion = await client.chat.completions.create({
        model: "deepseek-chat",
        messages: messages,
        temperature: 0.6
    });

    let assistantMessage = forcePureJson(completion.choices[0].message.content || '');
    
    let aiMessage;
    let keys;
    try {
        aiMessage = JSON.parse(assistantMessage.trim());
        keys = Object.keys(aiMessage);
    } catch (e) {
        // 解析失败 → 当成纯文本处理
        aiMessage = { text: assistantMessage };
        keys = ['text'];
    }
    // 内部循环
    while (keys[0] === 'exec') {
        const command = aiMessage.exec;
        console.log(`${green}执行命令：${command}`);

        try {
            const { stdout, stderr } = await execAsync(command);
            const result = stdout || stderr
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

        completion = await client.chat.completions.create({
            model: "deepseek-chat",
            messages: messages,
            temperature: 0.6
        });
        assistantMessage = completion.choices[0].message.content || '';
        try {
            aiMessage = JSON.parse(assistantMessage.trim());
            keys = Object.keys(aiMessage)
        } catch (error) {
            aiMessage = { text: assistantMessage };
            keys = ['text'];
        }

        // console.log(assistantMessage);
    }



    //  处理不同类型的返回
    if (keys[0] === 'text') {
        const text = aiMessage.text;
        console.log(`${cyan}AI回复：${text}`);
        messages.push({ role: 'assistant', content: assistantMessage })
    } else {
        const text = aiMessage.text;
        console.log(`${cyan}AI回复：${text}`);
        messages.push({ role: 'assistant', content: assistantMessage })
    }
    console.log('---');
}
rl.close();