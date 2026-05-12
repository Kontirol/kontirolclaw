// memory/sessions.js - 多会话管理（CommonJS 版本）
const fs = require('fs');
const path = require('path');
const os = require('os');

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
      id, name: '旧会话 (已迁移)',
      createdAt: data.updatedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(), messageCount: messages.length
    };
    fs.writeFileSync(sessionPath(id), JSON.stringify({ session, messages }, null, 2), 'utf-8');
    meta.sessions.push(session);
    meta.currentId = id;
    saveMeta(meta);
    fs.renameSync(oldFile, oldFile + '.bak');
    return true;
  } catch (err) {
    console.warn('⚠️ 迁移旧历史失败:', err.message);
    return false;
  }
}

function listSessions() {
  migrateOldHistory();
  const meta = loadMeta();
  return meta.sessions.map(s => ({
    id: s.id,
    name: s.name,
    messageCount: s.messageCount || 0,
    updatedAt: s.updatedAt,
    isCurrent: s.id === meta.currentId
  }));
}

function getCurrentSessionId() {
  migrateOldHistory();
  return loadMeta().currentId;
}

function createSession(name) {
  migrateOldHistory();
  const meta = loadMeta();
  const id = Date.now().toString(36);
  const session = {
    id, name: name || `会话 ${meta.sessions.length + 1}`,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 0
  };
  meta.sessions.push(session);
  meta.currentId = id;
  saveMeta(meta);
  fs.writeFileSync(sessionPath(id), JSON.stringify({ session, messages: [] }, null, 2), 'utf-8');
  return session;
}

function switchSession(idOrName) {
  migrateOldHistory();
  const meta = loadMeta();
  const found = meta.sessions.find(s => s.id === idOrName || s.name === idOrName);
  if (!found) return null;
  meta.currentId = found.id;
  saveMeta(meta);
  return found;
}

function deleteSession(idOrName) {
  migrateOldHistory();
  const meta = loadMeta();
  const idx = meta.sessions.findIndex(s => s.id === idOrName || s.name === idOrName);
  if (idx === -1) return null;
  if (meta.sessions.length <= 1) return { error: '至少保留一个会话' };
  const session = meta.sessions[idx];
  meta.sessions.splice(idx, 1);
  if (meta.currentId === session.id) meta.currentId = meta.sessions[0].id;
  saveMeta(meta);
  try { fs.unlinkSync(sessionPath(session.id)); } catch { /* ignore */ }
  return session;
}

function loadCurrentSession() {
  migrateOldHistory();
  const meta = loadMeta();
  if (!meta.currentId) {
    const id = Date.now().toString(36);
    const session = {
      id, name: '默认会话',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 0
    };
    meta.sessions.push(session);
    meta.currentId = id;
    saveMeta(meta);
    fs.writeFileSync(sessionPath(id), JSON.stringify({ session, messages: [] }, null, 2), 'utf-8');
    return { session, messages: [] };
  }
  const file = sessionPath(meta.currentId);
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      return { session: data.session, messages: data.messages || [] };
    }
  } catch (err) { console.warn('⚠️ 加载会话失败:', err.message); }
  const s = meta.sessions.find(s => s.id === meta.currentId);
  return { session: s || { id: meta.currentId, name: '未知' }, messages: [] };
}

function saveCurrentSession(messages) {
  const meta = loadMeta();
  if (!meta.currentId) return;
  const file = sessionPath(meta.currentId);
  const session = meta.sessions.find(s => s.id === meta.currentId);
  if (session) {
    session.messageCount = messages.length;
    session.updatedAt = new Date().toISOString();
  }
  fs.writeFileSync(file, JSON.stringify({ session, messages }, null, 2), 'utf-8');
  saveMeta(meta);
}

module.exports = { listSessions, getCurrentSessionId, createSession, switchSession, deleteSession, loadCurrentSession, saveCurrentSession };
