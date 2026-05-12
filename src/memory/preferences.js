// memory/preferences.js - 用户偏好管理（CommonJS 版本）
const fs = require('fs');
const path = require('path');
const os = require('os');

const CTRL_DIR = path.join(os.homedir(), '.ctrl');
const PREF_FILE = path.join(CTRL_DIR, 'preferences.json');
const MEMORY_FILE = path.join(CTRL_DIR, 'memory.json');

function ensureDir() {
  if (!fs.existsSync(CTRL_DIR)) {
    fs.mkdirSync(CTRL_DIR, { recursive: true });
  }
}

// ============ 偏好管理 ============

function loadPreferences() {
  ensureDir();
  try {
    if (fs.existsSync(PREF_FILE)) {
      return JSON.parse(fs.readFileSync(PREF_FILE, 'utf-8'));
    }
  } catch (err) {
    console.warn('⚠️ 加载偏好失败:', err.message);
  }
  return {};
}

function savePreferences(prefs) {
  ensureDir();
  fs.writeFileSync(PREF_FILE, JSON.stringify(prefs, null, 2), 'utf-8');
}

function setPreference(key, value) {
  const prefs = loadPreferences();
  prefs[key] = value;
  savePreferences(prefs);
  return `偏好已保存: ${key} = ${value}`;
}

function listPreferences() {
  const prefs = loadPreferences();
  if (Object.keys(prefs).length === 0) return '暂无偏好记录';
  return Object.entries(prefs).map(([k, v]) => `• ${k}: ${JSON.stringify(v)}`).join('\n');
}

function getPreferencesContext() {
  const prefs = loadPreferences();
  const memory = loadMemory();
  let ctx = '';
  if (Object.keys(prefs).length > 0) {
    ctx += '\n\n=== 用户偏好（从历史中学到的）===\n';
    ctx += Object.entries(prefs).map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`).join('\n');
  }
  if (memory.length > 0) {
    ctx += '\n\n=== 长期记忆（用户要求记住的）===\n';
    ctx += memory.map(m => `- [${m.id}] ${m.content}`).join('\n');
  }
  return ctx;
}

// ============ 长期记忆 ============

function loadMemory() {
  ensureDir();
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
    }
  } catch (err) {
    console.warn('⚠️ 加载记忆失败:', err.message);
  }
  return [];
}

function saveMemory(memory) {
  ensureDir();
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2), 'utf-8');
}

function addMemory(content, tags = []) {
  const memory = loadMemory();
  const mem = {
    id: Date.now(),
    content,
    tags,
    createdAt: new Date().toISOString()
  };
  memory.push(mem);
  saveMemory(memory);
  return `记忆已存储 #${mem.id}: "${content}"`;
}

function searchMemory(keyword) {
  const memory = loadMemory();
  const kw = keyword.toLowerCase();
  const results = memory.filter(m =>
    m.content.toLowerCase().includes(kw) ||
    (m.tags || []).some(t => t.toLowerCase().includes(kw))
  );
  if (results.length === 0) return `没有找到包含"${keyword}"的记忆`;
  return results.map(m => `[#${m.id}] ${m.content} (${m.createdAt.slice(0, 10)})`).join('\n');
}

function listMemory() {
  const memory = loadMemory();
  if (memory.length === 0) return '暂无长期记忆';
  return memory.map(m => `[#${m.id}] ${m.content}`).join('\n');
}

function deleteMemory(id) {
  const memory = loadMemory();
  const idx = memory.findIndex(m => m.id === id);
  if (idx === -1) return `未找到记忆 #${id}`;
  const deleted = memory.splice(idx, 1)[0];
  saveMemory(memory);
  return `已删除记忆 #${id}: "${deleted.content}"`;
}

// 自动检测"记住xxx"
function detectRememberCommand(userMessage) {
  const patterns = [
    /记住[：:]\s*(.+)/,
    /记住\s+(.+)/,
    /记住，(.+)/,
    /记住了[：:]\s*(.+)/,
    /帮我记住[：:]\s*(.+)/,
  ];
  for (const p of patterns) {
    const m = userMessage.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

module.exports = {
  loadPreferences, savePreferences,
  setPreference, listPreferences, getPreferencesContext,
  loadMemory, addMemory, searchMemory, listMemory, deleteMemory,
  detectRememberCommand
};
