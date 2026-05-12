const vscode = require('vscode');
const path = require('path');
const os = require('os');

const CTRL_DIR = path.join(os.homedir(), '.ctrl');
const CONFIG_FILE = path.join(CTRL_DIR, 'config.json');

function ensureDir() {
  if (!fs.existsSync(CTRL_DIR)) fs.mkdirSync(CTRL_DIR, { recursive: true });
}

const fs = require('fs');

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

function getConfig() {
  const vsCfg = vscode.workspace.getConfiguration('ctrl');
  return {
    baseURL: vsCfg.get('baseURL') || fileCfg.baseURL || 'https://api.deepseek.com',
    apiKey: vsCfg.get('apiKey') || fileCfg.apiKey || '',
    model:  vsCfg.get('model')  || fileCfg.model  || 'deepseek-v4-pro',
  };
}

module.exports = { getConfig, CTRL_DIR };
