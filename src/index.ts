import OpenAI from "openai";
import readline from 'readline/promises'
import {exec} from 'child_process'
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


const execAsync = promisify(exec);


const rl = readline.createInterface({
    input:process.stdin,
    output:process.stdout,
})

const client = new OpenAI({
    apiKey: process.env['OPENAI—API_KEY'],    
    baseURL: process.env['OPENAI_BASE_URL'],
});

// 上下文
const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {role: "system", content: `You are a helpful ai agent. your name is KontirolClaw
        
        You can execute powershell / cmd commands and return results to users. You  must respond in one of these two formats:

        1.command: <bash command> - when you need execute a bash command and you can also call built-in skills
        2.text: <response> - when you want to return  normal text response

        Examples:
        - command: dir d:
        - text: Hello! How can I help you today?
        - command: pwd
        - text:the current directory is ...

        The following are the specifications for all the skills you can invoke (please follow them strictly).
        ${ALL_SKILLS_DOCS}
        Skills scripts are located in the corresponding skill folders within the skills directory.
        `},
]
 
while (true) {
    const userInput = await rl.question(yellow+'请输入您的问题(输入 "exit" 退出)：');

    if(userInput.toLowerCase()=== 'exit'){
        console.log('再见');
        break;
    }

    messages.push({role:'user',content:userInput})

    let completion = await client.chat.completions.create({
        model: "kimi-k2-turbo-preview",         
        messages: messages,
        temperature: 0.6
    });

    let assistantMessage = completion.choices[0].message.content || '';

    // 内部循环
    while(assistantMessage.startsWith('command:')){
        const command  =assistantMessage.replace('command:','').trim();
        console.log(`${green}执行命令：${command}`);

         try {
            const {stdout,stderr} = await execAsync(command);
            const  result  = stdout || stderr
            // console.log(result);

            // 将命令和结果都添加到对话历史
            messages.push({role:'assistant',content:assistantMessage})
            messages.push({role:'user',content:`命令执行结果:\n${result}`})
            
        } catch (error:any) {
            const errorMsg =  `命令执行错误: ${error.message}`;
            // console.log(errorMsg);
            messages.push({role:'assistant',content:assistantMessage})
            messages.push({role:'user',content:errorMsg})
        }

        completion = await client.chat.completions.create({
            model: "kimi-k2-turbo-preview",         
            messages: messages,
            temperature: 0.6
        });
        assistantMessage = completion.choices[0].message.content || '';
    }



    //  处理不同类型的返回
    if(assistantMessage.startsWith('text:')){
        const text  =assistantMessage.replace('text:','').trim();
        console.log(`${cyan}AI回复：${text}`);
        messages.push({role:'assistant',content:assistantMessage})
    }else{
        console.log(`${cyan}AI回复：${assistantMessage}`);
        messages.push({role:'assistant',content:assistantMessage})
    }
    console.log('---');
}
rl.close();