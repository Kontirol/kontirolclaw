// memory/sessions.js - 多会话管理 + PID 文件锁
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

function lockPath(id) {
  return path.join(SESSIONS_DIR, `${id}.lock`);
}

// ===== PID 文件锁 =====

// 检查 PID 是否还活着（Windows 兼容）
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// 尝试锁定会话，返回 true 表示成功，false 表示被其他进程占用
export function acquireLock(sessionId) {
  const lp = lockPath(sessionId);
  ensureDir();

  // 检查已有锁
  if (fs.existsSync(lp)) {
    try {
      const raw = fs.readFileSync(lp, 'utf-8').trim();
      const existingPid = parseInt(raw, 10);
      if (!isNaN(existingPid) && isPidAlive(existingPid) && existingPid !== process.pid) {
        return false; // 被别的活进程占用
      }
      // 僵尸锁（PID 已死），覆盖它
    } catch { /* 锁文件损坏，覆盖 */ }
  }

  // 写入当前 PID
  try {
    fs.writeFileSync(lp, String(process.pid), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

// 释放会话锁
export function releaseLock(sessionId) {
  const lp = lockPath(sessionId);
  try {
    if (fs.existsSync(lp)) {
      const raw = fs.readFileSync(lp, 'utf-8').trim();
      const existingPid = parseInt(raw, 10);
      if (existingPid === process.pid) {
        fs.unlinkSync(lp);
        return true;
      }
    }
  } catch { /* ignore */ }
  return false;
}

// 检查会话是否被其他进程锁定
export function isLockedByOther(sessionId) {
  const lp = lockPath(sessionId);
  try {
    if (fs.existsSync(lp)) {
      const raw = fs.readFileSync(lp, 'utf-8').trim();
      const existingPid = parseInt(raw, 10);
      if (!isNaN(existingPid) && existingPid !== process.pid && isPidAlive(existingPid)) {
        return existingPid;
      }
    }
  } catch { /* ignore */ }
  return null;
}

// ===== 当前实例持有锁的会话 ID（仅内存，不持久化）=====
let activeSessionId = null;

export function getActiveSessionId() {
  return activeSessionId;
}

// ===== 迁移旧的单文件历史到会话系统 =====
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
    fs.writeFileSync(sessionPath(id), JSON.stringify({ session, messages }, null, 2), 'utf-8');
    meta.sessions.push(session);
    meta.currentId = id;
    saveMeta(meta);

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
    .map(s => {
      const lockedBy = isLockedByOther(s.id);
      const lockInfo = lockedBy ? ` 🔒PID:${lockedBy}` : '';
      const marker = s.id === activeSessionId ? '👉' : '  ';
      return `${marker} [${s.id}] ${s.name} (${s.messageCount || 0} 条消息, ${s.updatedAt?.slice(0, 10) || '?'})${lockInfo}`;
    })
    .join('\n');
}

// 获取当前会话 ID（优先返回活跃的，否则 meta 中的）
export function getCurrentSessionId() {
  migrateOldHistory();
  if (activeSessionId) return activeSessionId;
  const meta = loadMeta();
  return meta.currentId;
}

// 新建会话（自动锁定）
export function createSession(name) {
  migrateOldHistory();
  const meta = loadMeta();
  const id = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const session = {
    id,
    name: name || `会话 ${meta.sessions.length + 1}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0
  };

  // 释放旧锁
  if (activeSessionId && activeSessionId !== id) {
    releaseLock(activeSessionId);
  }

  // 获取新锁
  if (!acquireLock(id)) {
    // 极端情况：刚生成的随机 ID 还被占用了，再试一次
    const id2 = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    session.id = id2;
    acquireLock(id2);
  }

  activeSessionId = session.id;
  meta.sessions.push(session);
  meta.currentId = id;
  saveMeta(meta);
  fs.writeFileSync(sessionPath(session.id), JSON.stringify({ session, messages: [] }, null, 2), 'utf-8');
  return { session, msg: `✅ 已创建并切换到新会话「${session.name}」(#${session.id})` };
}

// 切换会话
export function switchSession(idOrName) {
  migrateOldHistory();
  const meta = loadMeta();
  const found = meta.sessions.find(
    s => s.id === idOrName || s.name === idOrName
  );
  if (!found) return { error: `未找到会话「${idOrName}」。输入 :sessions 查看所有会话。` };

  // 检查目标会话是否被其他进程占用
  const lockedBy = isLockedByOther(found.id);
  if (lockedBy) {
    return { error: `⚠️ 会话「${found.name}」正被另一个 Ctrl 进程 (PID: ${lockedBy}) 使用中。请关闭那个终端后再切换，或使用 :new 创建新会话。` };
  }

  // 释放旧锁，获取新锁
  if (activeSessionId) releaseLock(activeSessionId);
  if (!acquireLock(found.id)) {
    return { error: `⚠️ 无法锁定会话「${found.name}」，请稍后重试。` };
  }

  activeSessionId = found.id;
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
  if (meta.sessions.length <= 1) return '❌ 至少保留一个会话';

  // 检查是否被其他进程占用
  const lockedBy = isLockedByOther(session.id);
  if (lockedBy) {
    return `⚠️ 会话「${session.name}」正被另一个 Ctrl 进程 (PID: ${lockedBy}) 使用中，无法删除。`;
  }

  meta.sessions.splice(idx, 1);
  if (meta.currentId === session.id) {
    meta.currentId = meta.sessions[0]?.id || null;
  }
  saveMeta(meta);

  try { fs.unlinkSync(sessionPath(session.id)); } catch { /* ignore */ }
  try { fs.unlinkSync(lockPath(session.id)); } catch { /* ignore */ }

  // 如果删除的是当前活跃会话，切换到第一个
  if (activeSessionId === session.id) {
    releaseLock(session.id);
    activeSessionId = meta.sessions[0]?.id || null;
    if (activeSessionId) acquireLock(activeSessionId);
  }

  return `✅ 已删除会话「${session.name}」(#${session.id})，当前切换到「${meta.sessions.find(s => s.id === meta.currentId)?.name || '无'}」`;
}

// 加载当前会话消息（核心：处理锁冲突）
export function loadCurrentSession() {
  migrateOldHistory();
  const meta = loadMeta();

  // 如果当前实例已经锁定了某个会话，直接加载
  if (activeSessionId) {
    const file = sessionPath(activeSessionId);
    try {
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        return { session: data.session, messages: data.messages || [] };
      }
    } catch (err) {
      console.warn('⚠️ 加载会话失败:', err.message);
    }
    return { session: { id: activeSessionId, name: '未知' }, messages: [] };
  }

  // 尝试加载 meta.currentId 指向的会话
  const trySessionId = meta.currentId;

  if (trySessionId) {
    // 检查是否被其他进程占用
    const lockedBy = isLockedByOther(trySessionId);
    if (lockedBy) {
      // 被占用，自动创建新会话
      console.log(`🔒 会话 #${trySessionId} 正被另一个 Ctrl 终端 (PID: ${lockedBy}) 使用，自动创建新会话...`);
      const { session } = createSession(`终端 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`);
      activeSessionId = session.id;
      return { session, messages: [] };
    }

    // 尝试锁定
    if (acquireLock(trySessionId)) {
      activeSessionId = trySessionId;
      const file = sessionPath(trySessionId);
      try {
        if (fs.existsSync(file)) {
          const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
          return { session: data.session, messages: data.messages || [] };
        }
      } catch (err) {
        console.warn('⚠️ 加载会话失败:', err.message);
      }
      const s = meta.sessions.find(s => s.id === trySessionId);
      return { session: s || { id: trySessionId, name: '未知' }, messages: [] };
    }

    // 锁定失败，创建新会话
    const { session } = createSession(`终端 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`);
    activeSessionId = session.id;
    return { session, messages: [] };
  }

  // 没有任何会话，创建默认
  const { session } = createSession('默认会话');
  activeSessionId = session.id;
  return { session, messages: [] };
}

// 保存当前会话消息（全部保存，不截断）
export function saveCurrentSession(messages) {
  const sid = activeSessionId;
  if (!sid) return;

  const meta = loadMeta();
  const file = sessionPath(sid);
  const session = meta.sessions.find(s => s.id === sid);
  if (session) {
    session.messageCount = messages.length;
    session.updatedAt = new Date().toISOString();
  }

  fs.writeFileSync(file, JSON.stringify({ session, messages }, null, 2), 'utf-8');
  saveMeta(meta);
}

// 释放当前实例持有的所有锁（退出时调用）
export function releaseAllLocks() {
  if (activeSessionId) {
    releaseLock(activeSessionId);
    activeSessionId = null;
  }
}
