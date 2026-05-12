const OpenAI = require('openai');
const { toolDefinitions } = require('./tools/definition');
const { executeToolCall } = require('./tools/executor');
const { getPreferencesContext, detectRememberCommand, addMemory } = require('./memory/preferences');
const { getFullSystemPrompt, loadCustomTools } = require('./memory/self-improve');
const { loadCurrentSession, saveCurrentSession } = require('./memory/sessions');

function formatError(err) {
  const msg = err.message || '';
  const status = err.status;
  if (status === 400) return new Error(`请求格式错误 (400)：${msg}`);
  if (status === 401) return new Error('API Key 无效 (401)：请在 VS Code 设置中检查 ctrl.apiKey');
  if (status === 402) return new Error('账户余额不足 (402)');
  if (status === 429) return new Error('请求过于频繁 (429)：请稍后再试');
  if (status === 503) return new Error('服务暂时不可达 (503)');
  if (msg.includes('terminated') || msg.includes('aborted')) return new Error('连接中断');
  if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) return new Error('请求超时');
  if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) return new Error('无法连接 API');
  return new Error(`API 错误：${msg}`);
}

// 从部分 JSON 提取字段值
function extractJSONField(jsonStr, field) {
  const re = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`, 'g');
  const m = re.exec(jsonStr);
  if (m) return m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
  return null;
}

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

class Agent {
  constructor(cfg) {
    this.client = new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey });
    this.model = cfg.model;
    this.messages = [];
    this.abortController = null;
    this.turnCount = 0;
    this.initMessages();
  }

  initMessages() {
    const { messages } = loadCurrentSession();
    if (messages.length > 0) {
      this.messages = messages;
      const sysIdx = this.messages.findIndex(m => m.role === 'system');
      const ns = { role: 'system', content: this.buildSystemPrompt() };
      if (sysIdx >= 0) this.messages[sysIdx] = ns;
      else this.messages.unshift(ns);
    } else {
      this.messages = [{ role: 'system', content: this.buildSystemPrompt() }];
    }
  }

  buildSystemPrompt() { return getFullSystemPrompt(BASE_SYSTEM_PROMPT) + getPreferencesContext(); }
  reset() { this.messages = [{ role:'system', content:this.buildSystemPrompt() }]; this.turnCount=0; saveCurrentSession(this.messages); }
  clearHistory() { this.messages = [{ role:'system', content:this.buildSystemPrompt() }]; this.turnCount=0; saveCurrentSession([]); }
  abort() { if (this.abortController) this.abortController.abort(); }

  async run(userText, callbacks) {
    const { onChunk, onReasoning, onToolCall, onToolResult, onStreamCreate, onDone, onError } = callbacks;

    const remembered = detectRememberCommand(userText);
    if (remembered) addMemory(remembered);

    this.turnCount++;
    this.messages.push({ role: 'user', content: userText });
    saveCurrentSession(this.messages);

    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const MAX = 400;

    try {
      const customTools = loadCustomTools();
      const allTools = [
        ...toolDefinitions,
        ...customTools.map(t => ({ type:'function', function:{ name:t.name, description:t.description, parameters:t.parameters } }))
      ];

      let resp = await this.streamCompletion(allTools, { onChunk, onReasoning, onStreamCreate }, signal);
      this.messages.push(resp); saveCurrentSession(this.messages);

      let iter = 0;
      while (resp.tool_calls && resp.tool_calls.length > 0 && iter < MAX) {
        if (signal.aborted) throw new Error('ABORTED_BY_USER');
        iter++;
        for (const tc of resp.tool_calls) {
          const name = tc.function.name;
          let args, result;
          try {
            args = JSON.parse(tc.function.arguments);
            onToolCall(name, args);
            result = await executeToolCall(name, args);
            onToolResult(name, result);
          } catch (e) { result = `错误：${e.message}`; }
          this.messages.push({ role:'tool', tool_call_id:tc.id, content:result });
          saveCurrentSession(this.messages);
        }
        if (signal.aborted) throw new Error('ABORTED_BY_USER');
        resp = await this.streamCompletion(allTools, { onChunk, onReasoning, onStreamCreate }, signal);
        this.messages.push(resp); saveCurrentSession(this.messages);
      }

      if (iter >= MAX) onChunk('\n\n⚠️ 达到最大工具调用次数');
      if (this.turnCount > 0 && this.turnCount % 12 === 0) this.triggerAutoSummary();
      onDone();
    } catch (e) {
      if (e.message === 'ABORTED_BY_USER' || e.name === 'AbortError') onChunk('\n\n⏹ 已中断');
      else onError(formatError(e));
    } finally { this.abortController = null; }
  }

  async streamCompletion(tools, callbacks, signal) {
    const { onChunk, onReasoning, onStreamCreate } = callbacks;

    const stream = await this.client.chat.completions.create({
      messages: this.messages, model: this.model, stream: true, tools, max_tokens: 8192,
    }, { signal });

    const toolCalls = {};
    let textContent = '', reasoningContent = '';

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.reasoning_content) { reasoningContent += delta.reasoning_content; if (onReasoning) onReasoning(delta.reasoning_content); }
      if (delta?.content) { textContent += delta.content; if (onChunk) onChunk(delta.content); }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCalls[idx]) toolCalls[idx] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } };
          if (tc.id) toolCalls[idx].id = tc.id;
          if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
          if (tc.function?.arguments) {
            toolCalls[idx].function.arguments += tc.function.arguments;
            // 流式 create_file：实时推送 filename + content 到扩展端
            if (onStreamCreate && toolCalls[idx].function.name === 'create_file') {
              const argsStr = toolCalls[idx].function.arguments;
              const fn = extractJSONField(argsStr, 'filename');
              const ct = extractJSONField(argsStr, 'content');
              if (fn && ct !== null) {
                onStreamCreate(fn, ct);
              }
            }
          }
        }
      }
    }

    const msg = { role: 'assistant' };
    if (reasoningContent) msg.reasoning_content = reasoningContent;
    const tcList = Object.values(toolCalls);
    if (tcList.length > 0) { msg.tool_calls = tcList; msg.content = null; }
    else msg.content = textContent || '✅ 完成';
    return msg;
  }

  async triggerAutoSummary() {
    try {
      const recent = this.messages.slice(-20).filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => `[${m.role}] ${(m.content||'').slice(0,200)}`).join('\n');
      const r = await this.client.chat.completions.create({
        messages: [{ role:'system', content:'用一句话（不超过50字）总结对话关键信息。' }, { role:'user', content:recent }],
        model: this.model, stream: false, max_tokens: 100
      });
      const s = r.choices[0].message.content?.trim();
      if (s) require('./memory/vector').summarizeAndStore(s);
    } catch { /* */ }
  }
}

module.exports = { Agent };
