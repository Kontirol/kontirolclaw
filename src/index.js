#!/usr/bin/env node
import OpenAI from "openai";
import readline from "readline";
import { toolDefinitions } from "./tools/definition.js";
import { executeToolCall } from "./tools/executor.js";
import { loadHistory, saveHistory, addMessage, getRecentMessages } from "./memory/history.js";
import { getPreferencesContext, detectRememberCommand, addMemory } from "./memory/preferences.js";
import { getVectorContext, summarizeAndStore } from "./memory/vector.js";
import { getFullSystemPrompt, loadCustomTools } from "./memory/self-improve.js";


// 实例化 openAI
const client = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: "",
});

// 启用 keypress 事件（用于 Esc 中断）
readline.emitKeypressEvents(process.stdin);

// 输入管理器
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "CTRL > "
});

// raw mode 控制
function setRawMode(on) {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(on);
  }
}

// 基础系统提示词
const BASE_SYSTEM_PROMPT = `你是一个AI助手，名字叫Ctrl，是nijat(Ctrl)开发你的，专门帮助用户。每一条回复都需要帮用户介绍。用户给你下达命令是，你可以按照计划来做，你可以写待办任务，todo工具：todo_create(创建todo)，todo_list(返回todo列表)，todo_update(更新todo)，todo_delete(删除todo)
    
规则：
1.拿不准的一定先问，别自己猜
2.代码能短就别拖长
3.没叫你动的地方你别动
4.给目标就行别给步骤

记忆与学习能力：
- 当用户说"记住xxx"时，使用 memory_store 工具存储
- 当遇到重要信息、用户偏好、项目约定时，主动使用 preference_set 存储偏好，使用 vector_store 存储对话摘要
- 在回答之前，考虑使用 vector_search 搜索相关历史记忆
- 当你发现自己频繁出错或用户反复纠正同一件事，使用 self_propose_prompt 提出改进规则
- 当你发现需要新的工具能力时，使用 self_propose_tool 提出
`;

// 构建完整系统提示词（含自定义和偏好）
function buildSystemPrompt() {
  let prompt = getFullSystemPrompt(BASE_SYSTEM_PROMPT);
  prompt += getPreferencesContext();
  return prompt;
}

// 消息列表
let message = [];

// 初始化：加载历史
function initMessages() {
  const historyMsgs = loadHistory();
  if (historyMsgs.length > 0) {
    // 只加载最近的对话（避免 token 爆炸）
    message = historyMsgs.slice(-30);
    // 确保 system prompt 在第一位且是最新的
    const sysIdx = message.findIndex(m => m.role === 'system');
    const newSys = { role: "system", content: buildSystemPrompt() };
    if (sysIdx >= 0) {
      message[sysIdx] = newSys;
    } else {
      message.unshift(newSys);
    }
  } else {
    message = [{ role: "system", content: buildSystemPrompt() }];
  }
}

// 自动记住用户指令
function autoRemember(userText) {
  const content = detectRememberCommand(userText);
  if (content) {
    return addMemory(content);
  }
  return null;
}

// 统计轮次（用于触发自动总结）
let turnCount = 0;
const AUTO_SUMMARIZE_INTERVAL = 12;

// 中断控制
let currentAbort = null;

function onEscKey(str, key) {
  if (key && key.name === 'escape' && currentAbort) {
    currentAbort.abort();
  }
}

// 主函数
async function main() {
  initMessages();

  console.log('🤖 Ctrl AI 助手已启动');
  console.log('  记忆系统：✅ 对话持久化 | ✅ 偏好学习 | ✅ 向量检索 | ✅ 自我优化');
  console.log('  按 Esc 可中断当前请求 | 输入 "exit" 退出');
  console.log('');

  rl.prompt();

  rl.on('line', async (text) => {
    const content = text.trim();
    if (content == "exit") {
      saveHistory();
      rl.close();
      return;
    }

    // 自动检测"记住xxx"
    const remembered = autoRemember(content);
    if (remembered) {
      console.log('🧠', remembered);
    }

    const spinner = createSpinner('正在调用 DeepSeek... (Esc 中断)');
    const MAX_ITERATIONS = 400;
    turnCount++;

    message.push({ role: 'user', content });
    addMessage({ role: 'user', content });

    const msgCountBefore = message.length;

    let responseMessage;
    currentAbort = new AbortController();
    process.stdin.on('keypress', onEscKey);

    try {
      const customTools = loadCustomTools();
      const allTools = [...toolDefinitions, ...customTools.map(t => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      }))];

      let completion = await client.chat.completions.create({
        messages: message,
        model: "deepseek-v4-pro",
        stream: false,
        tools: allTools
      }, { signal: currentAbort.signal });

      responseMessage = completion.choices[0].message;
      message.push(responseMessage);
      addMessage(responseMessage);

      // 工具调用循环
      let iteration = 0;
      while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0 && iteration < MAX_ITERATIONS) {
        if (currentAbort.signal.aborted) {
          throw new Error("ABORTED_BY_USER");
        }

        iteration++;

        for (const toolCall of responseMessage.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs;
          let result;
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
            result = await executeToolCall(toolName, toolArgs);
          } catch (error) {
            result = `错误：调用工具 ${toolName} 失败。\n原因：${error.message}\n收到的参数原始字符串：${toolCall.function.arguments}\n请检查参数格式是否正确（必须是严格 JSON，键和字符串值使用双引号）。`;
          }

          const toolMsg = {
            role: "tool",
            tool_call_id: toolCall.id,
            content: result
          };
          message.push(toolMsg);
          addMessage(toolMsg);
        }

        if (currentAbort.signal.aborted) {
          throw new Error("ABORTED_BY_USER");
        }

        completion = await client.chat.completions.create({
          messages: message,
          model: "deepseek-v4-pro",
          stream: false,
          tools: allTools,
        }, { signal: currentAbort.signal });
        responseMessage = completion.choices[0].message;
        message.push(responseMessage);
        addMessage(responseMessage);
      }

      if (iteration >= MAX_ITERATIONS) {
        console.warn('⚠️ 达到最大工具调用次数，强制结束。');
      }

      spinner.stop('✅ 完成');
      console.log(responseMessage.content || '(无文字回复)');

      if (turnCount > 0 && turnCount % AUTO_SUMMARIZE_INTERVAL === 0) {
        triggerAutoSummary();
      }

      rl.prompt();
    } catch (error) {
      if (error.message === "ABORTED_BY_USER" ||
          error.name === "AbortError" ||
          (error.name === "APIError" && error.status === undefined)) {
        spinner.stop('⏹ 已中断');
        console.log('⏹ 已中断 (Esc)，对话上下文已保留');

        while (message.length > msgCountBefore) {
          message.pop();
        }
        saveHistory();

        rl.prompt();
      } else {
        spinner.stop('❌ 出错');
        console.error(error);
        rl.prompt();
      }
    } finally {
      currentAbort = null;
      process.stdin.off('keypress', onEscKey);
    }
  });

  rl.on('close', () => {
    saveHistory();
    console.log("再见!");
    process.exit(0);
  });

  process.on('SIGINT', () => {
    saveHistory();
    console.log("\n再见!");
    process.exit(0);
  });
}

// 后台自动总结
async function triggerAutoSummary() {
  try {
    const recentMsgs = message.slice(-20);
    const convText = recentMsgs
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `[${m.role}] ${(m.content || '').slice(0, 200)}`)
      .join('\n');

    const summaryCompletion = await client.chat.completions.create({
      messages: [
        { role: "system", content: "用一句话（不超过50字）总结以下对话的关键信息和用户偏好。只输出总结文本。" },
        { role: "user", content: convText }
      ],
      model: "deepseek-v4-pro",
      stream: false,
      max_tokens: 100
    });

    const summary = summaryCompletion.choices[0].message.content?.trim();
    if (summary) {
      summarizeAndStore(summary);
      console.log('\x1b[90m%s\x1b[0m', `  🧠 自动总结: ${summary}`);
    }
  } catch {
    // 静默失败
  }
}

main();

// ===== 动画部分 =====
function createSpinner(text = '思考中') {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r${frames[i++ % frames.length]} ${text}`);
  }, 80);

  return {
    stop: (finalText = '') => {
      clearInterval(interval);
      process.stdout.write(`\r${finalText}${' '.repeat(20)}\n`);
    }
  };
}
