// gui/renderer/app.js — 渲染进程主逻辑
import { t, getLang, setLang, getLangList } from './i18n.js';

// ===== DOM 引用 =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const messagesEl = $('#messages');
const userInput = $('#user-input');
const btnSend = $('#btn-send');
const btnAbort = $('#btn-abort');
const statusBar = $('#statusbar');
const statusText = $('#status-text');
const btnLang = $('#btn-lang');
const langMenu = $('#lang-menu');
const btnNewChat = $('#btn-new-chat');
const chatList = $('#chat-list');
const workdirDisplay = $('#workdir-display');
const workdirPath = $('#workdir-path');

// ===== 状态 =====
let isStreaming = false;
let currentAssistantRow = null;
let currentBubble = null;
let cleanupFns = [];

// ===== 初始化 =====
async function init() {
  applyLang();
  setupEventListeners();
  await loadWorkDir();
  await refreshSessionList();
  loadHistory();
}

function applyLang() {
  const lang = getLang();
  document.title = t('title');
  document.documentElement.lang = lang;

  if (lang === 'ug') {
    document.documentElement.dir = 'rtl';
    document.body.classList.add('rtl');
  } else {
    document.documentElement.dir = 'ltr';
    document.body.classList.remove('rtl');
  }

  $$('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });

  const placeholderEl = $('[data-i18n-placeholder]');
  if (placeholderEl) {
    placeholderEl.placeholder = t(placeholderEl.dataset.i18nPlaceholder);
  }

  $$('.dropdown-item').forEach(item => {
    item.classList.toggle('active', item.dataset.lang === lang);
  });
}

function setupEventListeners() {
  btnSend.addEventListener('click', () => sendMessage());
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  userInput.addEventListener('input', autoResize);

  btnAbort.addEventListener('click', () => {
    window.ctrl.abort();
  });

  btnLang.addEventListener('click', (e) => {
    e.stopPropagation();
    langMenu.classList.toggle('hidden');
  });
  document.addEventListener('click', () => langMenu.classList.add('hidden'));

  langMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.dropdown-item');
    if (!item) return;
    const lang = item.dataset.lang;
    if (setLang(lang)) {
      applyLang();
      refreshUIText();
    }
    langMenu.classList.add('hidden');
  });

  $('#btn-min').addEventListener('click', () => window.ctrl.minimize());
  $('#btn-max').addEventListener('click', () => window.ctrl.maximize());
  $('#btn-close').addEventListener('click', () => window.ctrl.close());

  btnNewChat.addEventListener('click', async () => {
    if (isStreaming) window.ctrl.abort();
    await window.ctrl.newSession(null);
    await refreshSessionList();
    clearMessages();
  });

  // 侧边栏会话点击（事件委托）
  chatList.addEventListener('click', async (e) => {
    const item = e.target.closest('.chat-item');
    if (!item) return;
    const sessionId = item.dataset.sessionId;
    if (!sessionId) return;

    const result = await window.ctrl.switchSession(sessionId);
    if (result.error) return;

    await refreshSessionList();
    clearMessages();
    setTimeout(() => loadHistory(), 100);
  });

  // 工作目录切换
  workdirDisplay.addEventListener('click', async () => {
    const newDir = await window.ctrl.setWorkDir();
    if (newDir) {
      updateWorkDirDisplay(newDir);
    }
  });
}

// ===== 工作目录 =====
async function loadWorkDir() {
  const dir = await window.ctrl.getWorkDir();
  updateWorkDirDisplay(dir);
}

function updateWorkDirDisplay(dir) {
  if (!dir) return;
  // 只显示最后两级目录
  const parts = dir.replace(/\\/g, '/').split('/');
  const short = parts.length > 2
    ? '.../' + parts.slice(-2).join('/')
    : dir;
  workdirPath.textContent = short;
  workdirPath.title = dir;
}

// ===== 会话列表 =====
async function refreshSessionList() {
  const [sessionsText, currentSession] = await Promise.all([
    window.ctrl.listSessions(),
    window.ctrl.getCurrentSession(),
  ]);

  chatList.innerHTML = '';

  if (!sessionsText || sessionsText === '暂无会话') return;

  const lines = sessionsText.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const match = line.match(/\[(\w+)\]\s+(.+?)\s+\((\d+)/);
    if (!match) continue;

    const id = match[1];
    const name = match[2].trim();
    const count = match[3];
    const isActive = line.startsWith('👉');

    const div = document.createElement('div');
    div.className = 'chat-item' + (isActive ? ' active' : '');
    div.dataset.sessionId = id;
    div.textContent = name;
    div.title = `${name} (${count} messages)`;
    chatList.appendChild(div);
  }
}

function clearMessages() {
  messagesEl.innerHTML = `
    <div class="welcome-msg">
      <div class="welcome-icon">⏺</div>
      <p>${t('welcome')}</p>
    </div>`;
}

// ===== 消息渲染 =====

function loadHistory() {
  window.ctrl.getHistory().then(messages => {
    if (!messages || messages.length === 0) return;
    const welcome = messagesEl.querySelector('.welcome-msg');
    if (welcome) welcome.remove();

    for (const msg of messages) {
      if (msg.content) {
        appendMessage(msg.role, msg.content);
      }
    }
    scrollToBottom();
  });
}

function appendMessage(role, content) {
  const row = document.createElement('div');
  row.className = `msg-row ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = renderMarkdown(content);

  row.appendChild(bubble);
  messagesEl.appendChild(row);
  return { row, bubble };
}

function removeWelcome() {
  const welcome = messagesEl.querySelector('.welcome-msg');
  if (welcome) welcome.remove();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ===== 发送消息 =====
function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isStreaming) return;

  removeWelcome();

  appendMessage('user', text);
  scrollToBottom();

  const row = document.createElement('div');
  row.className = 'msg-row assistant';
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  row.appendChild(bubble);
  messagesEl.appendChild(row);
  currentAssistantRow = row;
  currentBubble = bubble;

  isStreaming = true;
  userInput.value = '';
  userInput.style.height = 'auto';
  btnSend.classList.add('hidden');
  btnAbort.classList.remove('hidden');
  statusBar.classList.remove('hidden');
  statusText.textContent = t('thinking');
  userInput.disabled = true;

  const unsubs = [
    window.ctrl.onChunk(handleChunk),
    window.ctrl.onStreamStart(() => {
      statusText.textContent = t('thinking');
    }),
    window.ctrl.onStreamEnd(() => {}),
    window.ctrl.onTool(handleTool),
    window.ctrl.onDone(() => {
      finishStream();
      refreshSessionList();
    }),
    window.ctrl.onAborted(() => {
      statusText.textContent = t('aborted');
      finishStream();
    }),
    window.ctrl.onError((data) => {
      if (currentBubble) {
        currentBubble.innerHTML += `<span style="color:var(--red)">\n\n❌ ${escapeHtml(data.message)}</span>`;
      }
      statusText.textContent = t('error');
      finishStream();
    }),
  ];
  cleanupFns = unsubs;

  window.ctrl.send(text);
}

function handleChunk({ text }) {
  if (currentBubble) {
    currentBubble.innerHTML += renderMarkdownInline(text);
    scrollToBottom();
  }
}

function handleTool({ name, args, status, result, error }) {
  if (status === 'running' && currentBubble) {
    const tag = document.createElement('span');
    tag.className = 'tool-tag running';
    tag.innerHTML = `⚙ ${t('toolRunning')}: ${escapeHtml(name)}`;
    currentBubble.appendChild(tag);
    currentBubble.appendChild(document.createTextNode(' '));
    scrollToBottom();
  } else if (status === 'done' && currentBubble) {
    const tags = currentBubble.querySelectorAll('.tool-tag.running');
    const lastTag = tags[tags.length - 1];
    if (lastTag) {
      lastTag.classList.remove('running');
      lastTag.classList.add('done');
      lastTag.innerHTML = `✓ ${t('toolDone')}: ${escapeHtml(name)}`;
    }
  } else if (status === 'error' && currentBubble) {
    const tag = document.createElement('span');
    tag.className = 'tool-tag error';
    tag.textContent = `✕ ${escapeHtml(name)}: ${escapeHtml(error || '')}`;
    currentBubble.appendChild(tag);
    currentBubble.appendChild(document.createTextNode(' '));
  }
}

function finishStream() {
  isStreaming = false;
  currentAssistantRow = null;
  currentBubble = null;
  btnSend.classList.remove('hidden');
  btnAbort.classList.add('hidden');
  statusBar.classList.add('hidden');
  userInput.disabled = false;
  userInput.focus();

  cleanupFns.forEach(fn => fn());
  cleanupFns = [];
}

function refreshUIText() {
  const welcome = messagesEl.querySelector('.welcome-msg p');
  if (welcome) {
    welcome.textContent = t('welcome');
  }
}

// ===== 工具函数 =====
function autoResize() {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 160) + 'px';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderMarkdown(text) {
  let html = escapeHtml(text);

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  html = html.replace(/^---$/gm, '<hr>');
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  if (!html.startsWith('<')) {
    html = '<p>' + html + '</p>';
  } else {
    html = '<p>' + html + '</p>';
  }

  return html;
}

function renderMarkdownInline(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

init();
