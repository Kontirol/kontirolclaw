#!/usr/bin/env node
import OpenAI from "openai";
import readline from "readline";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { config } from "./config.js";
import { toolDefinitions } from "./tools/definition.js";
import { executeToolCall } from "./tools/executor.js";
import { getPreferencesContext, detectRememberCommand, addMemory } from "./memory/preferences.js";
import { getVectorContext, summarizeAndStore } from "./memory/vector.js";
import { getFullSystemPrompt, loadCustomTools } from "./memory/self-improve.js";
import {
  listSessions,
  createSession,
  switchSession,
  deleteSession,
  loadCurrentSession,
  saveCurrentSession,
  releaseAllLocks,
} from "./memory/sessions.js";
import { Spinner } from "./ui/spinner.js";
import { printBanner, printToolCall, printToolResult, printSessionBanner } from "./ui/banner.js";
import { getGitContext, clearGitCache } from "./git.js";

if (!config.apiKey) {
  console.error(chalk.red('❌ 未配置 API Key。请设置环境变量 CTRL_API_KEY 或写入 ~/.ctrl/config.json'));
  console.error(chalk.dim('   示例: set CTRL_API_KEY=sk-xxx'));
  process.exit(1);
}

const client = new OpenAI({
  baseURL: config.baseURL,
  apiKey: config.apiKey,
});

readline.emitKeypressEvents(process.stdin);

const spinner = new Spinner();

// ===== 命令历史持久化 =====
const CTRL_DIR = path.join(os.homedir(), '.ctrl');
const CMD_HISTORY_FILE = path.join(CTRL_DIR, 'cmd_history.json');
const MAX_CMD_HISTORY = 500;

function loadCmdHistory() {
  try {
    if (fs.existsSync(CMD_HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(CMD_HISTORY_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return [];
}

function saveCmdHistory(history) {
  try {
    if (!fs.existsSync(CTRL_DIR)) fs.mkdirSync(CTRL_DIR, { recursive: true });
    const trimmed = history.slice(-MAX_CMD_HISTORY);
    fs.writeFileSync(CMD_HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch { /* ignore */ }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: chalk.hex('#FFB347')('Ctrl > '),
});

rl.history = loadCmdHistory();

// ===== Token 估算 =====
function estimateTokens(messages) {
  let total = 0;
  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    total += content.length;
    if (msg.tool_calls) total += JSON.stringify(msg.tool_calls).length;
  }
  return total;
}

const TOKEN_THRESHOLD = 50000;

const BASE_SYSTEM_PROMPT = `你是一个AI助手，名字叫Ctrl，是nijat(Ctrl)开发你的，专门帮助用户。每一条回复都需要帮用户介绍。用户给你下达命令是，你可以按照计划来做，你可以写待办任务，todo工具：todo_create(创建todo)，todo_list(返回todo列表)，todo_update(更新todo)，todo_delete(删除todo)

规则：
1.拿不准的一定先问，别自己猜
2.代码能短就别拖长
3.没叫你动的地方你别动
4.给目标就行别给步骤
5.文件编辑一律使用 create_file（传入完整新内容）

记忆与学习能力：
- 当用户说"记住xxx"时，使用 memory_store 工具存储
- 当遇到重要信息、用户偏好、项目约定时，主动使用 preference_set 存储偏好，使用 vector_store 存储对话摘要
- 在回答之前，考虑使用 vector_search 搜索相关历史记忆
- 当你发现自己频繁出错或用户反复纠正同一件事，使用 self_propose_prompt 提出改进规则
- 当你发现需要新的工具能力时，使用 self_propose_tool 提出
`;

function buildSystemPrompt() {
  let prompt = getFullSystemPrompt(BASE_SYSTEM_PROMPT);
  prompt += getPreferencesContext();
  // 注入 Git 上下文
  const gitCtx = getGitContext();
  if (gitCtx) {
    prompt += '\n\n=== Git 仓库状态 ===\n' + gitCtx;
  }
  return prompt;
}

let message = [];

function initMessages() {
  const { session, messages } = loadCurrentSession();
  if (session) {
    console.log(chalk.blue(`📂 当前会话: ${chalk.bold(session.name)} (${chalk.dim('#' + session.id)})`));
  }
  if (messages.length > 0) {
    message = messages;
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

function autoRemember(userText) {
  const content = detectRememberCommand(userText);
  if (content) return addMemory(content);
  return null;
}

let turnCount = 0;
const AUTO_SUMMARIZE_INTERVAL = 12;
let currentAbort = null;

function onEscKey(str, key) {
  if (key && key.name === 'escape' && currentAbort) {
    currentAbort.abort();
  }
}

function isValidAssistantMsg(msg) {
  if (msg.role !== 'assistant') return true;
  return !(msg.content == null && !msg.tool_calls);
}

function showPrompt() {
  rl.resume();
  rl.prompt();
}

async function streamCompletion(messages, tools, signal) {
  spinner.start('⏳ 思考中...');

  const stream = await client.chat.completions.create({
    messages,
    model: config.model,
    stream: true,
    tools,
    max_tokens: 8192,
  }, { signal });

  const toolCalls = {};
  let textContent = '';
  let reasoningContent = '';
  let hasStartedContent = false;

  for await (const chunk of stream) {
    if (signal?.aborted) break;

    const delta = chunk.choices?.[0]?.delta;

    if (delta?.reasoning_content) {
      reasoningContent += delta.reasoning_content;
    }

    if (delta?.content) {
      if (!hasStartedContent) {
        spinner.stop();
        hasStartedContent = true;
      }
      textContent += delta.content;
      process.stdout.write(delta.content);
    }

    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index;
        if (!toolCalls[idx]) {
          toolCalls[idx] = {
            id: tc.id || '',
            type: 'function',
            function: { name: '', arguments: '' }
          };
        }
        if (tc.id) toolCalls[idx].id = tc.id;
        if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
        if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
      }
    }
  }

  spinner.stop();

  const msg = { role: 'assistant' };
  if (reasoningContent) {
    msg.reasoning_content = reasoningContent;
  }
  const tcList = Object.values(toolCalls);
  if (tcList.length > 0) {
    msg.tool_calls = tcList;
    msg.content = null;
  } else {
    msg.content = textContent || '✅ 完成';
    if (textContent) process.stdout.write('\n');
  }

  return msg;
}

function handleSessionCommand(content) {
  const parts = content.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ');

  switch (cmd) {
    case ':sessions':
    case ':list':
      console.log(chalk.blue('📋 所有会话：'));
      console.log(listSessions());
      return true;

    case ':new': {
      const name = arg || null;
      const { msg } = createSession(name);
      console.log(chalk.green(msg));
      message = [{ role: "system", content: buildSystemPrompt() }];
      turnCount = 0;
      return true;
    }

    case ':switch': {
      if (!arg) {
        console.log(chalk.yellow('用法：:switch <会话ID或名称>'));
        return true;
      }
      const result = switchSession(arg);
      console.log(result.error ? chalk.red(result.error) : chalk.green(result.msg));
      if (!result.error) {
        const { messages } = loadCurrentSession();
        message = messages.length > 0 ? messages : [{ role: "system", content: buildSystemPrompt() }];
        turnCount = 0;
      }
      return true;
    }

    case ':delete': {
      if (!arg) {
        console.log(chalk.yellow('用法：:delete <会话ID或名称>'));
        return true;
      }
      const result = deleteSession(arg);
      console.log(result.includes('✅') ? chalk.green(result) : chalk.red(result));
      const { messages } = loadCurrentSession();
      message = messages.length > 0 ? messages : [{ role: "system", content: buildSystemPrompt() }];
      turnCount = 0;
      return true;
    }

    case ':compact': {
      console.log(chalk.blue('📦 正在压缩对话历史...'));
      triggerCompact().then(() => {
        console.log(chalk.green('✅ 压缩完成'));
        showPrompt();
      }).catch(err => {
        console.log(chalk.red('❌ 压缩失败:'), err.message);
        showPrompt();
      });
      return 'async';
    }

    case ':git': {
      clearGitCache();
      const gitCtx = getGitContext();
      if (gitCtx) {
        console.log(chalk.blue('📋 Git 仓库状态：'));
        console.log(gitCtx);
      } else {
        console.log(chalk.yellow('⚠ 当前目录不在 Git 仓库中'));
      }
      return true;
    }

    case ':help':
      console.log(chalk.blue('\n⌨️  Ctrl 命令：\n  :new [名称]    - 创建新会话\n  :switch <ID>   - 切换会话\n  :sessions      - 列出所有会话\n  :delete <ID>   - 删除会话\n  :compact       - 压缩对话历史（释放上下文空间）\n  :git           - 查看 Git 仓库状态\n  exit           - 退出\n  Esc            - 中断当前请求\n'));
      return true;

    default:
      return false;
  }
}

// ===== Compact 机制 =====
async function triggerCompact() {
  if (message.length <= 6) return;

  const estTokens = estimateTokens(message);
  let recentStart = message.length;
  let completeRounds = 0;
  for (let i = message.length - 1; i >= 1; i--) {
    if (message[i].role === 'assistant' && !message[i].tool_calls && completeRounds >= 3) {
      recentStart = i;
      break;
    }
    if (message[i].role === 'assistant' && !message[i].tool_calls) {
      completeRounds++;
    }
  }
  if (recentStart < 1) recentStart = 1;

  const oldMessages = message.slice(1, recentStart);
  if (oldMessages.length === 0) return;

  const convText = oldMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `[${m.role}] ${(m.content || '').slice(0, 500)}`)
    .join('\n');

  try {
    const summaryCompletion = await client.chat.completions.create({
      messages: [
        { role: "system", content: "用中文总结以下对话的关键信息（技术决策、代码片段、重要结论等），不超过 300 字。只输出总结文本。" },
        { role: "user", content: convText }
      ],
      model: config.model,
      stream: false,
      max_tokens: 500
    });

    const summary = summaryCompletion.choices[0].message.content?.trim();
    if (summary) {
      const sysIdx = message.findIndex(m => m.role === 'system');
      const sysMsg = message[sysIdx];
      const cleanContent = sysMsg.content.replace(/\n\n=== 对话历史摘要 ===[\s\S]*?(?=\n\n|$)/g, '');
      sysMsg.content = cleanContent + `\n\n=== 对话历史摘要 ===\n${summary}`;
      message = [sysMsg, ...message.slice(recentStart)];
      saveCurrentSession(message);
    }
  } catch (err) {
    console.log(chalk.yellow(`⚠️ 压缩总结失败: ${err.message}`));
  }
}

// ===== 管道输入 =====
async function handlePipeInput() {
  const chunks = [];
  process.stdin.setEncoding('utf-8');
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return chunks.join('').trim();
}

async function main() {
  initMessages();
  printBanner(config);

  // 启动时显示 git 信息
  const startupGit = getGitContext();
  if (startupGit) {
    const firstLine = startupGit.split('\n')[0];
    console.log(chalk.dim(`  🔀 ${firstLine}`));
  }

  // 管道输入
  const hasPipeInput = !process.stdin.isTTY;
  if (hasPipeInput) {
    const pipeContent = await handlePipeInput();
    if (pipeContent) {
      console.log(chalk.dim('📥 收到管道输入...\n'));
      const content = `以下是管道传入的内容，请分析：\n\n${pipeContent}`;
      message.push({ role: 'user', content });
      saveCurrentSession(message);

      const customTools = loadCustomTools();
      const allTools = [...toolDefinitions, ...customTools.map(t => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters }
      }))];

      currentAbort = new AbortController();
      try {
        let responseMessage = await streamCompletion(message, allTools, currentAbort.signal);
        if (isValidAssistantMsg(responseMessage)) {
          message.push(responseMessage);
          saveCurrentSession(message);
        }

        let iteration = 0;
        const MAX_ITERATIONS = 400;
        while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0 && iteration < MAX_ITERATIONS) {
          if (currentAbort.signal.aborted) throw new Error("ABORTED_BY_USER");
          iteration++;

          spinner.start('⏳ 执行中...');
          for (const toolCall of responseMessage.tool_calls) {
            const toolName = toolCall.function.name;
            let toolArgs, result;
            const toolStart = Date.now();
            try {
              toolArgs = JSON.parse(toolCall.function.arguments);
              printToolCall(toolName, toolArgs);
              result = await executeToolCall(toolName, toolArgs);
              printToolResult(toolName, Date.now() - toolStart);
            } catch (error) {
              result = `错误：调用工具 ${toolName} 失败。\n原因：${error.message}\n收到的参数原始字符串：${toolCall.function.arguments}\n请检查参数格式是否正确。`;
            }
            message.push({ role: "tool", tool_call_id: toolCall.id, content: result });
            saveCurrentSession(message);
          }
          spinner.stop();

          if (currentAbort.signal.aborted) throw new Error("ABORTED_BY_USER");
          responseMessage = await streamCompletion(message, allTools, currentAbort.signal);
          if (isValidAssistantMsg(responseMessage)) {
            message.push(responseMessage);
            saveCurrentSession(message);
          }
        }
      } catch (error) {
        spinner.stop();
        if (error.message !== "ABORTED_BY_USER" && !(error.name === "AbortError")) {
          console.error(chalk.red('\n❌ 出错:'), error.message);
        }
      }
      console.log('');
    }
    releaseAllLocks();
    process.exit(0);
  }

  rl.prompt();

  rl.on('line', async (text) => {
    rl.pause();

    const content = text.trim();
    if (!content) { showPrompt(); return; }

    // 命令历史
    const history = rl.history;
    if (history.length === 0 || history[history.length - 1] !== content) {
      history.push(content);
      if (history.length > MAX_CMD_HISTORY * 2) {
        history.splice(0, history.length - MAX_CMD_HISTORY * 2);
      }
      saveCmdHistory(history);
    }

    if (content === 'exit') {
      saveCurrentSession(message);
      releaseAllLocks();
      console.log(chalk.dim('   再见'));
      rl.close();
      return;
    }

    if (content.startsWith(':')) {
      const result = handleSessionCommand(content);
      if (result === 'async') return;
      showPrompt();
      return;
    }

    const remembered = autoRemember(content);
    if (remembered) console.log(chalk.magenta('🧠'), remembered);

    // 刷新 git 上下文
    clearGitCache();
    const sysIdx = message.findIndex(m => m.role === 'system');
    if (sysIdx >= 0) {
      message[sysIdx].content = buildSystemPrompt();
    }

    const MAX_ITERATIONS = 400;
    turnCount++;

    message.push({ role: 'user', content });
    saveCurrentSession(message);

    const msgCountBefore = message.length;
    let responseMessage;
    currentAbort = new AbortController();
    process.stdin.on('keypress', onEscKey);

    try {
      const customTools = loadCustomTools();
      const allTools = [...toolDefinitions, ...customTools.map(t => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters }
      }))];

      responseMessage = await streamCompletion(message, allTools, currentAbort.signal);
      if (isValidAssistantMsg(responseMessage)) {
        message.push(responseMessage);
        saveCurrentSession(message);
      }

      let iteration = 0;
      while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0 && iteration < MAX_ITERATIONS) {
        if (currentAbort.signal.aborted) throw new Error("ABORTED_BY_USER");
        iteration++;

        spinner.start('⏳ 执行中...');
        for (const toolCall of responseMessage.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs, result;
          const toolStart = Date.now();
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
            printToolCall(toolName, toolArgs);
            result = await executeToolCall(toolName, toolArgs);
            printToolResult(toolName, Date.now() - toolStart);
          } catch (error) {
            result = `错误：调用工具 ${toolName} 失败。\n原因：${error.message}\n收到的参数原始字符串：${toolCall.function.arguments}\n请检查参数格式是否正确。`;
          }
          message.push({ role: "tool", tool_call_id: toolCall.id, content: result });
          saveCurrentSession(message);
        }
        spinner.stop();

        if (currentAbort.signal.aborted) throw new Error("ABORTED_BY_USER");
        responseMessage = await streamCompletion(message, allTools, currentAbort.signal);
        if (isValidAssistantMsg(responseMessage)) {
          message.push(responseMessage);
          saveCurrentSession(message);
        }
      }

      if (iteration >= MAX_ITERATIONS) {
        console.log(chalk.yellow('\n⚠️ 达到最大工具调用次数，强制结束。'));
      }

      if (turnCount > 0 && turnCount % AUTO_SUMMARIZE_INTERVAL === 0) {
        triggerAutoSummary();
      }

      const estTokens = estimateTokens(message);
      if (estTokens > TOKEN_THRESHOLD) {
        console.log(chalk.gray(`\n  📦 Token 估算 ${(estTokens / 1000).toFixed(1)}K，自动压缩...`));
        await triggerCompact();
      }

      showPrompt();
    } catch (error) {
      spinner.stop();
      if (error.message === "ABORTED_BY_USER" || error.name === "AbortError" ||
          (error.name === "APIError" && error.status === undefined)) {
        console.log(chalk.yellow('\n⏹ 已中断 (Esc)，对话上下文已保留'));
        while (message.length > msgCountBefore) message.pop();
        saveCurrentSession(message);
        showPrompt();
      } else {
        console.error(chalk.red('\n❌ 出错:'), error.message);
        showPrompt();
      }
    } finally {
      spinner.stop();
      currentAbort = null;
      process.stdin.off('keypress', onEscKey);
    }
  });

  process.on('SIGINT', () => {
    saveCurrentSession(message);
    releaseAllLocks();
    console.log(chalk.dim('\n   再见'));
    process.exit(0);
  });
}

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
      model: config.model,
      stream: false,
      max_tokens: 100
    });

    const summary = summaryCompletion.choices[0].message.content?.trim();
    if (summary) {
      summarizeAndStore(summary);
      console.log(chalk.gray(`  🧠 自动总结: ${summary}`));
    }
  } catch { /* 静默失败 */ }
}

main();
