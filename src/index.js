#!/usr/bin/env node
import OpenAI from "openai";
import readline from "readline";
import { toolDefinitions } from "./tools/definition.js";
import { executeToolCall } from "./tools/executor.js";

// 实例化openAI
const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: "",
});

// 输入管理器
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "CTRL > "
})


// 提示词
let message = [{ role: "system", content: "你是一个AI助手，专门帮助用户。每一条回复都需要帮用户介绍。" }]

// 主函数
async function main() {

    //  显示输入框
    rl.prompt()
    rl.on('line', async (text) => {
        const content = text.trim()
        if (content == "exit") {
            rl.close();
            return;
        }
        const spinner = createSpinner('正在调用 DeepSeek...');
        const MAX_ITERATIONS = 40;   // 防止死循环

        message.push({ role: 'user', 'content': content })
        let responseMessage;

        try {
            // 调用模型
            let completion = await client.chat.completions.create({
                messages: message,
                model: "deepseek-v4-flash",
                // thinking: { "type": "enabled" },
                // reasoning_effort: "high",
                stream: false,
                // response_format: { type: 'json_object' },
                tools: toolDefinitions
            });
            responseMessage = completion.choices[0].message;
            message.push(responseMessage)

            //开始循环
            let iteration = 0;
            while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0 && iteration < MAX_ITERATIONS) {
                iteration++;
                // console.log(iteration+"次循环");
                
                //调用工具
                for (const toolCall of responseMessage.tool_calls) {
                    const toolName = toolCall.function.name;
                    let toolArgs;
                    let result;
                    try {
                        toolArgs = JSON.parse(toolCall.function.arguments);
                        result = await executeToolCall(toolName, toolArgs);
                    } catch (error) {
                        result = `错误：调用工具 ${toolName} 失败。\n原因：${err.message}\n收到的参数原始字符串：${toolCall.function.arguments}\n请检查参数格式是否正确（必须是严格 JSON，键和字符串值使用双引号）。`;
                    }
                    console.log("正在调用："+toolName+"// -> "+toolArgs);
                    // 把工具执行结果作为一条 tool 消息加入历史
                    message.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: result
                    });
                }
                completion = await client.chat.completions.create({
                    messages: message,
                    model: "deepseek-v4-flash",
                    stream: false,
                    tools: toolDefinitions,
                });
                responseMessage = completion.choices[0].message;
                // console.log(responseMessage);
                message.push(responseMessage);
            }
            if (iteration >= MAX_ITERATIONS) {
                    console.warn('⚠️ 达到最大工具调用次数，强制结束。');
                }
            spinner.stop('✅ 完成');
            console.log(responseMessage.content);
            rl.prompt()
        } catch (error) {
            spinner.stop('❌ 出错');
            console.error(error);
            rl.prompt();
            return;
        }
    })

    rl.on('close', () => {
        console.log("再见!");
        process.exit(0);
    })
}

main();











// 动画部分
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 一个简易 spinner
function createSpinner(text = '思考中') {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    const interval = setInterval(() => {
        process.stdout.write(`\r${frames[i++ % frames.length]} ${text}`);
    }, 80);

    return {
        stop: (finalText = '') => {
            clearInterval(interval);
            process.stdout.write(`\r${finalText}${' '.repeat(20)}\n`); // 清除并换行
        }
    };
}