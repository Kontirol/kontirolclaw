// Ctrl AI - WebView Chat Script
const vscode = acquireVsCodeApi();
const state = vscode.getState() || { messages: [] };

const $ = (sel) => document.querySelector(sel);
const messagesEl = $('#messages');
const inputEl = $('#input');
const sendBtn = $('#send-btn');
const abortBtn = $('#abort-btn');
const statusText = $('#status-text');
const sessionBtn = $('#current-session-btn');
const sessionNameEl = $('#current-session-name');
const sessionDropdown = $('#session-dropdown');
const sessionListEl = $('#session-list');
const newSessionBtn = $('#new-session-btn');

let isProcessing = false;
let currentAssistantMsg = null;
let toolGroup = null;
let toolCount = 0;
let sessions = [];
let currentSessionId = null;
let welcomeEl = null;

state.messages.forEach(m => renderStoredMessage(m));
if (state.messages.length === 0) showWelcome();

// ===== 会话 =====
sessionBtn.addEventListener('click', e => { e.stopPropagation(); sessionDropdown.classList.toggle('hidden'); if (!sessionDropdown.classList.contains('hidden')) vscode.postMessage({ type:'list_sessions' }); });
document.addEventListener('click', () => sessionDropdown.classList.add('hidden'));
newSessionBtn.addEventListener('click', () => { sessionDropdown.classList.add('hidden'); vscode.postMessage({ type:'create_session' }); });

// ===== 输入 =====
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  if (e.key === 'Escape' && isProcessing) abortMessage();
});
sendBtn.addEventListener('click', sendMessage);
abortBtn.addEventListener('click', abortMessage);
inputEl.addEventListener('input', () => { inputEl.style.height = 'auto'; inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px'; });

window.addEventListener('message', e => handleExtensionMessage(e.data));

function sendMessage() {
  if (isProcessing) return;
  const text = inputEl.value.trim(); if (!text) return;
  inputEl.value = ''; inputEl.style.height = 'auto';
  removeWelcome(); addUserMessage(text); setProcessing(true);
  vscode.postMessage({ type:'chat', text });
}
function abortMessage() { vscode.postMessage({ type:'abort' }); setProcessing(false); }

function handleExtensionMessage(msg) {
  switch (msg.type) {
    case 'chunk': appendChunk(msg.text); break;
    case 'reasoning': appendReasoning(msg.text); break;
    case 'tool_call': appendToolCall(msg.name, msg.args); break;
    case 'tool_result': break;
    case 'done': finishMessage(); break;
    case 'error': showError(msg.message); setProcessing(false); break;
    case 'session_reset': clearMessages(); break;
    case 'history_cleared': clearMessages(); showWelcome(); break;
    case 'sessions_update': sessions = msg.sessions; currentSessionId = msg.currentId; renderSessions(); break;
  }
}

// ===== 会话渲染 =====
function renderSessions() {
  const cur = sessions.find(s => s.id === currentSessionId);
  if (cur) sessionNameEl.textContent = cur.name;
  sessionListEl.innerHTML = '';
  sessions.forEach(s => {
    const d = document.createElement('div');
    d.className = 'dropdown-item' + (s.id === currentSessionId ? ' active' : '');
    d.innerHTML = `<span>${escapeHtml(s.name)}</span><span class="session-meta">${s.messageCount||0} 条</span><button class="delete-session-btn" data-id="${s.id}">✕</button>`;
    d.addEventListener('click', e => { if (!e.target.classList.contains('delete-session-btn')) { sessionDropdown.classList.add('hidden'); vscode.postMessage({ type:'switch_session', id:s.id }); } });
    d.querySelector('.delete-session-btn').addEventListener('click', e => { e.stopPropagation(); if (sessions.length>1) vscode.postMessage({ type:'delete_session', id:s.id }); });
    sessionListEl.appendChild(d);
  });
}

// ===== UI =====
function addUserMessage(text) {
  const d = document.createElement('div'); d.className = 'msg msg-user';
  d.innerHTML = `<div class="msg-label">你</div><div class="content">${escapeHtml(text)}</div>`;
  messagesEl.appendChild(d); scrollToBottom(); saveState({ type:'user', text });
}

function setProcessing(active) {
  isProcessing = active; sendBtn.disabled = active; abortBtn.classList.toggle('hidden', !active);
  statusText.textContent = active ? 'Ctrl 思考中...' : '';
  if (active) {
    currentAssistantMsg = document.createElement('div'); currentAssistantMsg.className = 'msg msg-assistant';
    currentAssistantMsg.innerHTML = `<div class="msg-label">Ctrl</div><div class="content"></div>`;
    messagesEl.appendChild(currentAssistantMsg); toolGroup = null; toolCount = 0;
  }
}

function ensureToolGroup() {
  if (!toolGroup) {
    toolGroup = document.createElement('div'); toolGroup.className = 'tool-group';
    const h = document.createElement('div'); h.className = 'tool-group-header';
    h.innerHTML = `<span class="tool-group-icon">🔧</span><span class="tool-group-title">工具调用</span><span class="tool-group-arrow">▸</span>`;
    const b = document.createElement('div'); b.className = 'tool-group-body hidden';
    toolGroup.appendChild(h); toolGroup.appendChild(b);
    currentAssistantMsg.insertBefore(toolGroup, currentAssistantMsg.querySelector('.content'));
    h.addEventListener('click', () => { b.classList.toggle('hidden'); h.querySelector('.tool-group-arrow').textContent = b.classList.contains('hidden') ? '▸' : '▾'; });
  }
  return toolGroup;
}

function appendChunk(text) {
  if (!currentAssistantMsg) return;
  const c = currentAssistantMsg.querySelector('.content');
  if (!c.dataset.text) c.dataset.text = '';
  c.dataset.text += text; c.innerHTML = renderMarkdown(c.dataset.text); scrollToBottom();
}

function appendReasoning(text) {
  if (!currentAssistantMsg) return;
  let el = currentAssistantMsg.querySelector('.reasoning');
  if (!el) { el = document.createElement('div'); el.className = 'reasoning'; currentAssistantMsg.insertBefore(el, currentAssistantMsg.querySelector('.content')); }
  el.textContent += text; scrollToBottom();
}

function appendToolCall(name, args) {
  if (!currentAssistantMsg) return;
  toolCount++;
  const g = ensureToolGroup(), b = g.querySelector('.tool-group-body');
  const d = document.createElement('div'); d.className = 'tool-entry';
  d.innerHTML = `<span class="tool-icon">⚙</span><span class="tool-name">${escapeHtml(name)}</span><span class="tool-args">${escapeHtml(formatArgs(args))}</span>`;
  b.appendChild(d);
  g.querySelector('.tool-group-title').textContent = `${toolCount} 个工具`;
  scrollToBottom();
}

function finishMessage() {
  setProcessing(false); statusText.textContent = '';
  if (currentAssistantMsg) {
    const c = currentAssistantMsg.querySelector('.content');
    if (!c.dataset.text && toolCount === 0) c.textContent = '✅ 完成';
    if (toolGroup && toolCount <= 2) { const b = toolGroup.querySelector('.tool-group-body'); b.classList.remove('hidden'); toolGroup.querySelector('.tool-group-arrow').textContent = '▾'; }
  }
  saveState({ type:'assistant', content: currentAssistantMsg?.querySelector('.content')?.dataset.text || '' });
}

function showError(m) {
  const d = document.createElement('div'); d.className = 'error-msg'; d.textContent = '❌ ' + m;
  messagesEl.appendChild(d); scrollToBottom();
}

function showWelcome() {
  removeWelcome();
  welcomeEl = document.createElement('div'); welcomeEl.className = 'welcome';
  welcomeEl.innerHTML = `<h2>⏺ Ctrl AI</h2><p>你的 AI 编程助手<br>读写文件、执行命令、管理待办、记忆偏好</p><p style="margin-top:12px;color:#666">基于 DeepSeek · 由 nijat(Ctrl) 开发</p>`;
  messagesEl.appendChild(welcomeEl);
}
function removeWelcome() { if (welcomeEl?.parentNode) { welcomeEl.remove(); welcomeEl = null; } }
function clearMessages() { messagesEl.innerHTML = ''; vscode.setState({ messages:[] }); welcomeEl = null; }
function scrollToBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }

function saveState(md) { const msgs = state.messages.slice(-200); msgs.push(md); vscode.setState({ messages:msgs }); }
function renderStoredMessage(m) {
  if (m.type === 'user') {
    const d = document.createElement('div'); d.className = 'msg msg-user';
    d.innerHTML = `<div class="msg-label">你</div><div class="content">${escapeHtml(m.text)}</div>`; messagesEl.appendChild(d);
  } else if (m.type === 'assistant' && m.content) {
    const d = document.createElement('div'); d.className = 'msg msg-assistant';
    d.innerHTML = `<div class="msg-label">Ctrl</div><div class="content">${renderMarkdown(m.content)}</div>`; messagesEl.appendChild(d);
  }
}

function escapeHtml(t) { const map = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}; return t.replace(/[&<>"']/g, c => map[c]); }
function formatArgs(a) { if (!a) return ''; try { const s = JSON.stringify(a); return s.length>80 ? s.slice(0,80)+'...' : s; } catch { return String(a).slice(0,80); } }
function renderMarkdown(t) {
  if (!t) return '';
  let h = escapeHtml(t);
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_,lang,code) => `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`);
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\n/g, '<br>');
  return h;
}
