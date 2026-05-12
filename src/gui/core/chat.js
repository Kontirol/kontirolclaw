// gui/core/chat.js — GUI 聊天引擎
import OpenAI from "openai";
import { EventEmitter } from "events";
import { config } from "../../config.js";
import { toolDefinitions } from "../../tools/definition.js";
import { executeToolCall } from "../../tools/executor.js";
import { getPreferencesContext } from "../../memory/preferences.js";
import { summarizeAndStore } from "../../memory/vector.js";
import { getFullSystemPrompt, loadCustomTools } from "../../memory/self-improve.js";
import { loadCurrentSession, saveCurrentSession } from "../../memory/sessions.js";

const client = new OpenAI({
  baseURL: config.baseURL,
  apiKey: config.apiKey,
});

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

function buildSystemPrompt() {
  let prompt = getFullSystemPrompt(BASE_SYSTEM_PROMPT);
  prompt += getPreferencesContext();
  return prompt;
}

const AUTO_SUMMARIZE_INTERVAL = 10;

export class ChatEngine extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(30);
    this.messages = [];
    this._mainAbort = null;
    this._activeStream = null;
    this.turnCount = 0;
    this._busy = false;
    this._initMessages();
  }

  _initMessages() {
    const { session, messages } = loadCurrentSession();
    if (messages.length > 0) {
      this.messages = messages;
      const sysIdx = this.messages.findIndex(m => m.role === 'system');
      const newSys = { role: "system", content: buildSystemPrompt() };
      if (sysIdx >= 0) {
        this.messages[sysIdx] = newSys;
      } else {
        this.messages.unshift(newSys);
      }
      this.turnCount = this.messages.filter(m => m.role === 'user').length;
    } else {
      this.messages = [{ role: "system", content: buildSystemPrompt() }];
      this.turnCount = 0;
    }
  }

  reloadSession() {
    this._initMessages();
  }

  getHistory() {
    return this.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }));
  }

  async sendMessage(userInput) {
    // 防止重复进入
    if (this._busy) {
      this.emit('error', { message: '上一个请求尚未完成' });
      return;
    }
    this._busy = true;

    // 确保之前的请求已终止
    this._cleanupStream();

    this._mainAbort = new AbortController();
    const msgCountBefore = this.messages.length;

    this.messages.push({ role: 'user', content: userInput });
    saveCurrentSession(this.messages);
    this.turnCount++;

    const allTools = this._getAllTools();
    const MAX_ITERATIONS = 400;

    try {
      let responseMessage = await this._streamOnce(allTools);
      if (this._isValidAssistantMsg(responseMessage)) {
        this.messages.push(responseMessage);
        saveCurrentSession(this.messages);
      }

      let iteration = 0;
      while (responseMessage.tool_calls?.length > 0 && iteration < MAX_ITERATIONS) {
        if (this._mainAbort.signal.aborted) break;
        iteration++;

        for (const toolCall of responseMessage.tool_calls) {
          if (this._mainAbort.signal.aborted) break;
          const toolName = toolCall.function.name;
          let toolArgs, result;
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
            this.emit('tool', { name: toolName, args: toolArgs, status: 'running' });
            result = await executeToolCall(toolName, toolArgs);

            const toolData = { name: toolName, args: toolArgs, status: 'done', result };
            if (['create_file', 'delete_file'].includes(toolName) && toolArgs.filename) {
              const diffTextMatch = result.match(/^文件.*?\n([\s\S]*)/);
              if (diffTextMatch) toolData.diffText = diffTextMatch[1].trim();
            }
            this.emit('tool', toolData);
          } catch (error) {
            result = `错误：调用工具 ${toolName} 失败。\n原因：${error.message}`;
            this.emit('tool', { name: toolName, status: 'error', error: error.message });
          }

          this.messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result
          });
          saveCurrentSession(this.messages);
        }

        if (this._mainAbort.signal.aborted) break;

        responseMessage = await this._streamOnce(allTools);
        if (this._isValidAssistantMsg(responseMessage)) {
          this.messages.push(responseMessage);
          saveCurrentSession(this.messages);
        }
      }

      if (this.turnCount > 0 && this.turnCount % AUTO_SUMMARIZE_INTERVAL === 0) {
        this._autoSummarize();
      }

      this.emit('done');
    } catch (error) {
      if (error.name === 'AbortError' || error.message === 'ABORTED_BY_USER') {
        this.emit('aborted');
        while (this.messages.length > msgCountBefore) {
          this.messages.pop();
        }
        saveCurrentSession(this.messages);
      } else {
        this.emit('error', { message: error.message });
      }
    } finally {
      this._cleanupStream();
      this._busy = false;
    }
  }

  // 单次流式调用（每次都创建新的 AbortController 避免 listener 堆积）
  async _streamOnce(tools) {
    // 为每次 API 调用创建独立 AbortController，链接到主控制器
    const streamCtrl = new AbortController();

    // 如果主控制器被中止，级联中止子控制器
    if (this._mainAbort) {
      if (this._mainAbort.signal.aborted) {
        streamCtrl.abort();
      } else {
        this._mainAbort.signal.addEventListener('abort', () => streamCtrl.abort(), { once: true });
      }
    }

    this._activeStream = streamCtrl;

    this.emit('stream_start');

    try {
      const stream = await client.chat.completions.create({
        messages: this.messages,
        model: config.model,
        stream: true,
        tools,
        max_tokens: 8192,
      }, { signal: streamCtrl.signal });

      const toolCalls = {};
      let textContent = '';
      let reasoningContent = '';

      for await (const chunk of stream) {
        if (streamCtrl.signal.aborted) break;

        const delta = chunk.choices?.[0]?.delta;

        if (delta?.reasoning_content) {
          reasoningContent += delta.reasoning_content;
        }

        if (delta?.content) {
          textContent += delta.content;
          this.emit('chunk', { text: delta.content });
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

      this.emit('stream_end');

      const msg = { role: 'assistant' };
      if (reasoningContent) msg.reasoning_content = reasoningContent;
      const tcList = Object.values(toolCalls);
      if (tcList.length > 0) {
        msg.tool_calls = tcList;
        msg.content = null;
      } else {
        msg.content = textContent || '✅ 完成';
      }
      return msg;
    } finally {
      this._activeStream = null;
      // 确保 streamCtrl 被清理，防止 listener 残留
      try { streamCtrl.abort(); } catch {}
    }
  }

  _isValidAssistantMsg(msg) {
    if (msg.role !== 'assistant') return true;
    return !(msg.content == null && !msg.tool_calls);
  }

  _getAllTools() {
    const customTools = loadCustomTools();
    return [
      ...toolDefinitions,
      ...customTools.map(t => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      }))
    ];
  }

  async _autoSummarize() {
    try {
      const recentMsgs = this.messages.slice(-20);
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
        this.emit('info', { type: 'summary', text: summary });
      }
    } catch {
      // 静默失败
    }
  }

  abort() {
    if (this._mainAbort) {
      this._mainAbort.abort();
    }
    this._cleanupStream();
  }

  _cleanupStream() {
    if (this._activeStream) {
      try { this._activeStream.abort(); } catch {}
      this._activeStream = null;
    }
    if (this._mainAbort) {
      try { this._mainAbort.abort(); } catch {}
      this._mainAbort = null;
    }
  }
}
