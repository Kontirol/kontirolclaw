// memory/history.js - 对话持久化
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CTRL_DIR = path.join(os.homedir(), '.ctrl');
const HISTORY_FILE = path.join(CTRL_DIR, 'history.json');
const MAX_HISTORY_MESSAGES = 200;   // 最多保留多少条消息
const SAVE_INTERVAL = 5;            // 每 N 轮自动保存一次

let messages = [];
let saveCounter = 0;

// 确保目录存在
function ensureDir() {
  if (!fs.existsSync(CTRL_DIR)) {
    fs.mkdirSync(CTRL_DIR, { recursive: true });
  }
}

// 加载历史
export function loadHistory() {
  ensureDir();
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
      const data = JSON.parse(raw);
      messages = data.messages || [];
      console.log(`📂 加载了 ${messages.length} 条历史消息`);
      return messages;
    }
  } catch (err) {
    console.warn('⚠️ 加载历史失败:', err.message);
  }
  return [];
}

// 保存历史
export function saveHistory() {
  ensureDir();
  try {
    // 只保留最近的消息
    if (messages.length > MAX_HISTORY_MESSAGES) {
      messages = messages.slice(-MAX_HISTORY_MESSAGES);
    }
    fs.writeFileSync(HISTORY_FILE, JSON.stringify({
      messages,
      updatedAt: new Date().toISOString()
    }, null, 2), 'utf-8');
  } catch (err) {
    console.warn('⚠️ 保存历史失败:', err.message);
  }
}

// 添加消息
export function addMessage(msg) {
  messages.push(msg);
  saveCounter++;
  // 每 N 轮自动保存
  if (saveCounter >= SAVE_INTERVAL) {
    saveCounter = 0;
    saveHistory();
  }
}

// 获取最近 N 条消息（用于注入上下文）
export function getRecentMessages(n = 20) {
  return messages.slice(-n);
}

// 获取全部消息
export function getAllMessages() {
  return [...messages];
}

// 清空历史
export function clearHistory() {
  messages = [];
  saveHistory();
  return '历史已清空';
}
