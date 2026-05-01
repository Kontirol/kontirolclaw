// memory/sessions.js - 多会话管理
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CTRL_DIR = path.join(os.homedir(), '.ctrl');
const SESSIONS_DIR = path.join(CTRL_DIR, 'sessions');
const META_FILE = path.join(CTRL_DIR, 'sessions_meta.json');

function ensureDir() {
  if (!fs.existsSync(CTRL_DIR)) fs.mkdirSync(CTRL_DIR, { recursive: true });
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function loadMeta() {
  ensureDir();
  try {
    if (fs.existsSync(META_FILE)) return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
  } catch { /* ignore */ }
  return { sessions: [], currentId: null };
}

function saveMeta(meta) {
  ensureDir();
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}

function sessionPath(id) {
  return path.join(SESSIONS_DIR, `${id}.json`);
}

// 清理孤立的 tool 消息（没有前置 assistant(tool_calls) 的）
function cleanOrphanedToolMessages(msgs) {
  const toolCallIds = new Set();
  for (const m of msgs) {
    if (m.role === 'assistant' && m.tool_calls) {
      for (const tc of m.tool_calls) {
        toolCallIds.add(tc.id);
      }
    }
  }
  return msgs.filter(m => {
    if (m.role === 'tool') {
      return toolCallIds.has(m.tool_call_id);
    }
    return true;
  });
}

// 迁移旧的单文件历史到会话系统
function migrateOldHistory() {
  const oldFile = path.join(CTRL_DIR, 'history.json');
  if (!fs.existsSync(oldFile)) return false;
  try {
    const raw = fs.readFileSync(oldFile, 'utf-8');
    const data = JSON.parse(raw);
    const messages = data.messages || [];
    if (messages.length === 0) return false;

    const meta = loadMeta();
    const id = Date.now().toString(36);
    const session = {
      id,
      name: '旧会话 (已迁移)',
      createdAt: data.updatedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: messages.length
    };
    // 保存会话消息
    fs.writeFileSync(sessionPath(id), JSON.stringify({ session, messages }, null, 2), 'utf-8');
    meta.sessions.push(session);
    meta.currentId = id;
    saveMeta(meta);

    // 备份旧文件
    fs.renameSync(oldFile, oldFile + '.bak');
    console.log(`📦 已将旧历史迁移到会话 #${id}`);
    return true;
  } catch (err) {
    console.warn('⚠️ 迁移旧历史失败:', err.message);
    return false;
  }
}

// 列出所有会话
export function listSessions() {
  const meta = loadMeta();
  migrateOldHistory();
  const m = loadMeta();
  if (m.sessions.length === 0) return '暂无会话';
  return m.sessions
    .map(s => `${s.id === m.currentId ? '👉' : '  '} [${s.id}] ${s.name} (${s.messageCount || 0} 条消息, ${s.updatedAt?.slice(0, 10) || '?'})`)
    .join('\n');
}

// 获取当前会话 ID
export function getCurrentSessionId() {
  migrateOldHistory();
  const meta = loadMeta();
  return meta.currentId;
}

// 新建会话
export function createSession(name) {
  migrateOldHistory();
  const meta = loadMeta();
  const id = Date.now().toString(36);
  const session = {
    id,
    name: name || `会话 ${meta.sessions.length + 1}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0
  };
  meta.sessions.push(session);
  meta.currentId = id;
  saveMeta(meta);
  // 写入空消息文件
  fs.writeFileSync(sessionPath(id), JSON.stringify({ session, messages: [] }, null, 2), 'utf-8');
  return { session, msg: `✅ 已创建并切换到新会话「${session.name}」(#${id})` };
}

// 切换会话
export function switchSession(idOrName) {
  migrateOldHistory();
  const meta = loadMeta();
  const found = meta.sessions.find(
    s => s.id === idOrName || s.name === idOrName
  );
  if (!found) return { error: `未找到会话「${idOrName}」。输入 :sessions 查看所有会话。` };
  // 先保存当前会话
  meta.currentId = found.id;
  saveMeta(meta);
  return { session: found, msg: `✅ 已切换到会话「${found.name}」(#${found.id})` };
}

// 删除会话
export function deleteSession(idOrName) {
  migrateOldHistory();
  const meta = loadMeta();
  const idx = meta.sessions.findIndex(
    s => s.id === idOrName || s.name === idOrName
  );
  if (idx === -1) return `未找到会话「${idOrName}」`;

  const session = meta.sessions[idx];

  // 如果只剩一个会话，不允许删除
  if (meta.sessions.length <= 1) return '❌ 至少保留一个会话';

  meta.sessions.splice(idx, 1);

  // 如果删除的是当前会话，切换到第一个
  if (meta.currentId === session.id) {
    meta.currentId = meta.sessions[0].id;
  }

  saveMeta(meta);

  // 删除会话文件
  try { fs.unlinkSync(sessionPath(session.id)); } catch { /* ignore */ }
  return `✅ 已删除会话「${session.name}」(#${session.id})，当前切换到「${meta.sessions.find(s => s.id === meta.currentId)?.name}」`;
}

// 加载当前会话消息
export function loadCurrentSession() {
  migrateOldHistory();
  const meta = loadMeta();
  if (!meta.currentId) {
    // 没有任何会话，自动创建一个
    const { session } = JSON.parse(
      JSON.stringify(createSession('默认会话'))
    );
    return { session, messages: [] };
  }

  const file = sessionPath(meta.currentId);
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      return { session: data.session, messages: data.messages || [] };
    }
  } catch (err) {
    console.warn('⚠️ 加载会话失败:', err.message);
  }
  // 文件丢失，创建一个新的
  const s = meta.sessions.find(s => s.id === meta.currentId);
  return { session: s || { id: meta.currentId, name: '未知' }, messages: [] };
}

// 保存当前会话消息
export function saveCurrentSession(messages, maxMessages = 200) {
  const meta = loadMeta();
  if (!meta.currentId) return;

  // 裁剪并清理孤立 tool 消息
  let trimmed = messages;
  if (messages.length > maxMessages) {
    trimmed = messages.slice(-maxMessages);
    trimmed = cleanOrphanedToolMessages(trimmed);
  }

  const file = sessionPath(meta.currentId);
  const session = meta.sessions.find(s => s.id === meta.currentId);
  if (session) {
    session.messageCount = trimmed.length;
    session.updatedAt = new Date().toISOString();
  }

  fs.writeFileSync(file, JSON.stringify({ session, messages: trimmed }, null, 2), 'utf-8');
  saveMeta(meta);
}
