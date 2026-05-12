// memory/self-improve.js - 自我优化（CommonJS 版本）
const fs = require('fs');
const path = require('path');
const os = require('os');

const CTRL_DIR = path.join(os.homedir(), '.ctrl');
const CUSTOM_TOOLS_FILE = path.join(CTRL_DIR, 'custom_tools.json');
const CUSTOM_PROMPT_FILE = path.join(CTRL_DIR, 'custom_prompt.txt');
const PENDING_FILE = path.join(CTRL_DIR, 'pending_changes.json');

function ensureDir() {
  if (!fs.existsSync(CTRL_DIR)) {
    fs.mkdirSync(CTRL_DIR, { recursive: true });
  }
}

function loadCustomTools() {
  ensureDir();
  try {
    if (fs.existsSync(CUSTOM_TOOLS_FILE)) {
      return JSON.parse(fs.readFileSync(CUSTOM_TOOLS_FILE, 'utf-8'));
    }
  } catch (err) { /* ignore */ }
  return [];
}

function saveCustomTools(tools) {
  ensureDir();
  fs.writeFileSync(CUSTOM_TOOLS_FILE, JSON.stringify(tools, null, 2), 'utf-8');
}

function proposeNewTool(toolName, description, parameters) {
  ensureDir();
  const pending = loadPendingChanges();
  const proposal = {
    id: Date.now(),
    type: 'add_tool',
    toolName,
    description,
    parameters,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  pending.push(proposal);
  savePendingChanges(pending);
  return `📝 工具提案已记录 #${proposal.id}：「${toolName}」- ${description}\n` +
    `⚠️ 需要用户确认后才会生效。请输入 "确认提案 ${proposal.id}" 或 "拒绝提案 ${proposal.id}"`;
}

function loadCustomPrompt() {
  ensureDir();
  try {
    if (fs.existsSync(CUSTOM_PROMPT_FILE)) {
      return fs.readFileSync(CUSTOM_PROMPT_FILE, 'utf-8').trim();
    }
  } catch (err) { /* ignore */ }
  return '';
}

function saveCustomPrompt(prompt) {
  ensureDir();
  fs.writeFileSync(CUSTOM_PROMPT_FILE, prompt, 'utf-8');
}

function proposePromptUpdate(newPromptSnippet, reason) {
  ensureDir();
  const pending = loadPendingChanges();
  const proposal = {
    id: Date.now(),
    type: 'update_prompt',
    newPromptSnippet,
    reason,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  pending.push(proposal);
  savePendingChanges(pending);
  return `📝 提示词修改提案 #${proposal.id}\n理由：${reason}\n内容：${newPromptSnippet.slice(0, 200)}...\n` +
    `⚠️ 请输入 "确认提案 ${proposal.id}" 或 "拒绝提案 ${proposal.id}"`;
}

function loadPendingChanges() {
  try {
    if (fs.existsSync(PENDING_FILE)) {
      return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf-8'));
    }
  } catch (err) { /* ignore */ }
  return [];
}

function savePendingChanges(pending) {
  fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2), 'utf-8');
}

function listPendingChanges() {
  const pending = loadPendingChanges();
  const active = pending.filter(p => p.status === 'pending');
  if (active.length === 0) return '暂无待处理的提案';
  return active.map(p =>
    `[#${p.id}] ${p.type}: ${p.toolName || p.newPromptSnippet?.slice(0, 50) || '(详见文件)'} - ${p.createdAt}`
  ).join('\n');
}

function approveProposal(id) {
  const pending = loadPendingChanges();
  const idx = pending.findIndex(p => p.id === id);
  if (idx === -1) return `未找到提案 #${id}`;

  const proposal = pending[idx];

  if (proposal.type === 'add_tool') {
    const tools = loadCustomTools();
    tools.push({
      name: proposal.toolName,
      description: proposal.description,
      parameters: proposal.parameters
    });
    saveCustomTools(tools);
    proposal.status = 'approved';
    savePendingChanges(pending);
    return `✅ 工具「${proposal.toolName}」已生效！重启后可用。`;

  } else if (proposal.type === 'update_prompt') {
    let current = loadCustomPrompt();
    current += '\n' + proposal.newPromptSnippet;
    saveCustomPrompt(current);
    proposal.status = 'approved';
    savePendingChanges(pending);
    return `✅ 提示词已更新！重启后生效。`;
  }

  return '未知提案类型';
}

function rejectProposal(id) {
  const pending = loadPendingChanges();
  const idx = pending.findIndex(p => p.id === id);
  if (idx === -1) return `未找到提案 #${id}`;
  pending[idx].status = 'rejected';
  savePendingChanges(pending);
  return `❌ 提案 #${id} 已拒绝`;
}

function getFullSystemPrompt(basePrompt) {
  const custom = loadCustomPrompt();
  if (custom) {
    return basePrompt + '\n\n=== 自我优化规则 ===\n' + custom;
  }
  return basePrompt;
}

module.exports = {
  loadCustomTools, saveCustomTools,
  proposeNewTool, proposePromptUpdate,
  loadCustomPrompt, saveCustomPrompt,
  listPendingChanges, approveProposal, rejectProposal,
  getFullSystemPrompt
};
