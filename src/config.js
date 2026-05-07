// config.js - 统一配置管理
// 优先级：环境变量 > ~/.ctrl/config.json > 默认值
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CTRL_DIR = path.join(os.homedir(), '.ctrl');
const CONFIG_FILE = path.join(CTRL_DIR, 'config.json');

function ensureDir() {
  if (!fs.existsSync(CTRL_DIR)) fs.mkdirSync(CTRL_DIR, { recursive: true });
}

function loadFileConfig() {
  ensureDir();
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

const fileCfg = loadFileConfig();

export const config = {
  baseURL: process.env.CTRL_BASE_URL || fileCfg.baseURL || 'https://api.deepseek.com',
  apiKey: process.env.CTRL_API_KEY || fileCfg.apiKey || '',
  model:  process.env.CTRL_MODEL  || fileCfg.model  || 'deepseek-v4-pro',
};

// 保存配置到文件
export function saveConfig(updates) {
  ensureDir();
  const current = loadFileConfig();
  Object.assign(current, updates);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(current, null, 2), 'utf-8');
  // 同步更新内存中的配置
  Object.assign(config, updates);
}
