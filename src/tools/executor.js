// tools/executor.js - 工具执行（精简版，UI 由扩展端管理）
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const vscode = require('vscode');
const { addMemory, searchMemory, listMemory, deleteMemory } = require('../memory/preferences');
const { setPreference, listPreferences } = require('../memory/preferences');
const { addVector, searchVectors, listVectors } = require('../memory/vector');
const { proposeNewTool, proposePromptUpdate, listPendingChanges, approveProposal, rejectProposal } = require('../memory/self-improve');
const { saveCurrentSession } = require('../memory/sessions');

const CTRL_DIR = path.join(os.homedir(), '.ctrl');
const TODO_FILE = path.join(CTRL_DIR, 'todos.json');

const FORBIDDEN_PATTERNS = [
  /rm\s+-rf\s+\//, /format\s+[a-zA-Z]:/, /del\s+\/f\s+\/s\s+\/q/,
  /shutdown\s/, /restart\s/, /net\s+user/, /reg\s+delete/,
];

function isCommandSafe(cmd) { return !FORBIDDEN_PATTERNS.some(p => p.test(cmd.toLowerCase())); }

function getWorkDir() {
  const f = vscode.workspace.workspaceFolders;
  return (f && f.length > 0) ? f[0].uri.fsPath : process.cwd();
}

async function runCommand(command, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const workDir = getWorkDir();
    const isWin = process.platform === 'win32';
    const shell = isWin ? 'powershell.exe' : '/bin/sh';
    const args = isWin ? ['-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command];
    let stdout = '', stderr = '', timedOut = false;
    const child = spawn(shell, args, { cwd: workDir, windowsHide: true });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) resolve(`❌ 超时（${timeoutMs/1000}s）`);
      let r = stdout || '';
      if (code !== 0) { r += r ? `\n⚠️ 退出码: ${code}` : `⚠️ 退出码: ${code}`; if (stderr) r += `\n${stderr}`; }
      else if (!stdout && stderr) r = stderr;
      if (!r) r = '执行成功，无输出';
      resolve(r);
    });
    child.on('error', err => { clearTimeout(timer); resolve(`❌ 启动失败：${err.message}`); });
  });
}

// ===== Todo =====
function ensureCtrlDir() { if (!fs.existsSync(CTRL_DIR)) fs.mkdirSync(CTRL_DIR, { recursive: true }); }
function loadTodos() {
  ensureCtrlDir();
  try { if (fs.existsSync(TODO_FILE)) { const d = JSON.parse(fs.readFileSync(TODO_FILE, 'utf-8')); return { todos: d.todos || [], nextId: d.nextId || 1 }; } } catch {}
  return { todos: [], nextId: 1 };
}
function saveTodos(todos, nextId) { ensureCtrlDir(); fs.writeFileSync(TODO_FILE, JSON.stringify({ todos, nextId }, null, 2), 'utf-8'); }
const SI = { pending: '⬜', in_progress: '🔄', done: '✅', failed: '❌' };

async function executeToolCall(toolName, args) {
  const workDir = getWorkDir();
  const fullPath = args.filename ? path.resolve(workDir, args.filename) : workDir;
  if (args.filename && !fullPath.startsWith(workDir)) return `❌ 安全限制：不能操作工作目录以外的路径`;

  switch (toolName) {
    case 'read_file': {
      try { return fs.readFileSync(fullPath, 'utf-8'); }
      catch (e) { return `读取失败：${e.message}`; }
    }

    case 'create_file': {
      try {
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, args.content || '', 'utf-8');
        // diff + 流式已在 agent 生成阶段由 extension 处理
        return `文件 ${args.filename} 创建/更新成功`;
      } catch (e) { return `创建失败：${e.message}`; }
    }

    case 'delete_file': {
      try { fs.unlinkSync(fullPath); return `已删除 ${args.filename}`; }
      catch (e) { return `删除失败：${e.message}`; }
    }

    case 'open_file': {
      try {
        if (!fs.existsSync(fullPath)) return `文件不存在：${args.filename}`;
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
        await vscode.window.showTextDocument(doc, { preview: false });
        return `已打开 ${args.filename}`;
      } catch (e) { return `打开失败：${e.message}`; }
    }

    case 'read_dir': {
      try {
        const d = args.dirname ? path.resolve(workDir, args.dirname) : workDir;
        return JSON.stringify(fs.readdirSync(d));
      } catch (e) { return `读取目录失败：${e.message}`; }
    }

    case 'exec_command': {
      if (!args.command) return "❌ 没有提供命令";
      if (!isCommandSafe(args.command)) return "❌ 该命令被禁止执行";
      return await runCommand(args.command, Math.min(args.timeout || 60, 300) * 1000);
    }

    // ===== TODO =====
    case 'todo_create': {
      try {
        const { todos, nextId } = loadTodos();
        const s = args.status || 'pending';
        todos.push({ id: nextId, title: args.title, status: s, completed: s === 'done', createdAt: new Date().toISOString() });
        saveTodos(todos, nextId + 1);
        return `创建 todo #${nextId} [${SI[s]}] ${args.title}`;
      } catch (e) { return `失败: ${e.message}`; }
    }
    case 'todo_list': {
      try {
        const { todos } = loadTodos();
        let f = args.status ? todos.filter(t => t.status === args.status) : todos;
        if (f.length === 0) return args.status ? `暂无 "${args.status}" 任务` : '暂无待办';
        f.sort((a, b) => ['in_progress','pending','failed','done'].indexOf(a.status) - ['in_progress','pending','failed','done'].indexOf(b.status));
        let r = '📋 待办列表：\n';
        for (const t of f) r += `  #${t.id} [${SI[t.status]} ${t.status}] ${t.title}\n`;
        if (!args.status) {
          const c = {}; for (const t of todos) c[t.status] = (c[t.status] || 0) + 1;
          r += '\n📊 统计: ' + Object.entries(c).map(([s, n]) => `${SI[s]} ${s}: ${n}`).join(' | ') + ` | 总计: ${todos.length}`;
        }
        return r;
      } catch (e) { return `失败: ${e.message}`; }
    }
    case 'todo_update': {
      try {
        const { todos, nextId } = loadTodos();
        const i = todos.findIndex(t => t.id === args.id);
        if (i === -1) return `❌ 未找到 #${args.id}`;
        if (args.title !== undefined) todos[i].title = args.title;
        if (args.status !== undefined) { todos[i].status = args.status; todos[i].completed = args.status === 'done'; }
        if (typeof args.completed === 'boolean') { todos[i].completed = args.completed; if (args.status === undefined) todos[i].status = args.completed ? 'done' : 'pending'; }
        saveTodos(todos, nextId);
        return `任务 #${args.id} 已更新 [${SI[todos[i].status]}] ${todos[i].title}`;
      } catch (e) { return `失败: ${e.message}`; }
    }
    case 'todo_delete': {
      try {
        const { todos, nextId } = loadTodos();
        const i = todos.findIndex(t => t.id === args.id);
        if (i === -1) return `❌ 未找到 #${args.id}`;
        const d = todos.splice(i, 1)[0]; saveTodos(todos, nextId);
        return `✅ 已删除 #${args.id}: "${d.title}"`;
      } catch (e) { return `失败: ${e.message}`; }
    }

    // ===== 记忆 =====
    case 'memory_store': return addMemory(args.content, args.tags || []);
    case 'memory_search': return searchMemory(args.keyword);
    case 'memory_list': return listMemory();
    case 'memory_delete': return deleteMemory(args.id);
    case 'preference_set': return setPreference(args.key, args.value);
    case 'preference_list': return listPreferences();

    // ===== 向量 =====
    case 'vector_store': { const v = addVector(args.summary, args.keywords || []); return `向量记忆 #${v.id} 已存储`; }
    case 'vector_search': {
      const r = searchVectors(args.query, 5);
      return r.length === 0 ? '未找到' : r.map((x, i) => `${i+1}. [${x.score.toFixed(1)}] ${x.summary}`).join('\n');
    }
    case 'vector_list': return listVectors();

    // ===== 自我优化 =====
    case 'self_propose_tool': {
      let p; try { p = JSON.parse(args.parameters); } catch { p = { type:"object", properties:{}, description:args.parameters }; }
      return proposeNewTool(args.tool_name, args.description, p);
    }
    case 'self_propose_prompt': return proposePromptUpdate(args.snippet, args.reason);
    case 'self_list_proposals': return listPendingChanges();
    case 'self_approve': return approveProposal(args.id);
    case 'self_reject': return rejectProposal(args.id);
    case 'history_clear': saveCurrentSession([]); return '已清空';

    default: return `未知工具：${toolName}`;
  }
}

module.exports = { executeToolCall };
