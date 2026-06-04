// tools/executor.js
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn } from "node:child_process";
import { printFileDiff } from "../ui/diff.js";
import { addMemory, searchMemory, listMemory, deleteMemory, loadMemory } from "../memory/preferences.js";
import { setPreference, listPreferences } from "../memory/preferences.js";
import { addVector, searchVectors, listVectors, deleteVector } from "../memory/vector.js";
import { proposeNewTool, proposePromptUpdate, listPendingChanges, approveProposal, rejectProposal } from "../memory/self-improve.js";
import { saveCurrentSession } from "../memory/sessions.js";

const WORK_DIR = process.cwd();
const CTRL_DIR = path.join(os.homedir(), '.ctrl');
const TODO_FILE = path.join(CTRL_DIR, 'todos.json');
const FILE_SIZE_LIMIT = 100 * 1024; // read_file 上限 100KB

// 危险命令黑名单
const FORBIDDEN_PATTERNS = [
  /rm\s+-rf\s+\//,
  /format\s+[a-zA-Z]:/,
  /del\s+\/f\s+\/s\s+\/q/,
  /shutdown\s/,
  /restart\s/,
  /net\s+user/,
  /reg\s+delete/,
];

function isCommandSafe(command) {
  const lower = command.toLowerCase();
  return !FORBIDDEN_PATTERNS.some(pattern => pattern.test(lower));
}

async function runCommand(command, shell = "powershell", timeoutMs = 60000) {
  return new Promise((resolve) => {
    const isPowerShell = shell !== 'cmd';
    const shellPath = isPowerShell ? 'powershell.exe' : 'cmd.exe';
    const args = isPowerShell
      ? ['-NoProfile', '-NonInteractive', '-Command', command]
      : ['/c', command];

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(shellPath, args, {
      cwd: WORK_DIR,
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (timedOut) {
        resolve(
          `❌ 命令执行超时（${timeoutMs / 1000}秒）\n` +
          (stdout ? `已输出的内容（末 2000 字符）：\n${stdout.slice(-2000)}\n` : '')
        );
        return;
      }

      let result = '';
      if (stdout) result += stdout;

      if (code !== 0) {
        const errorInfo = `⚠️ 命令退出码: ${code}`;
        result += result ? `\n${errorInfo}` : errorInfo;
        if (stderr) result += `\n--- stderr ---\n${stderr}`;
      } else if (!stdout && stderr) {
        result = stderr;
      }

      if (!result) result = '命令执行成功，无输出';
      resolve(result);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve(`❌ 命令启动失败：${err.message}`);
    });
  });
}

// ===== Todo 持久化 =====
function ensureCtrlDir() {
  if (!fs.existsSync(CTRL_DIR)) fs.mkdirSync(CTRL_DIR, { recursive: true });
}

function loadTodos() {
  ensureCtrlDir();
  try {
    if (fs.existsSync(TODO_FILE)) {
      const data = JSON.parse(fs.readFileSync(TODO_FILE, 'utf-8'));
      return { todos: data.todos || [], nextId: data.nextId || 1 };
    }
  } catch { /* ignore */ }
  return { todos: [], nextId: 1 };
}

function saveTodos(todos, nextId) {
  ensureCtrlDir();
  fs.writeFileSync(TODO_FILE, JSON.stringify({ todos, nextId }, null, 2), 'utf-8');
}

const STATUS_ICONS = {
  pending: '⬜',
  in_progress: '🔄',
  done: '✅',
  failed: '❌'
};

export async function executeToolCall(toolName, args) {
  const fullPath = args.filename ? path.resolve(WORK_DIR, args.filename) : WORK_DIR;
  if (args.filename && !fullPath.startsWith(WORK_DIR)) {
    return `❌ 安全限制：不能操作当前目录以外的路径`;
  }

  switch (toolName) {
    // ===== 文件操作 =====
    case 'read_file': {
      try {
        const stat = fs.statSync(fullPath);
        const fileSize = stat.size;
        if (fileSize > FILE_SIZE_LIMIT) {
          const fd = fs.openSync(fullPath, 'r');
          const buf = Buffer.alloc(FILE_SIZE_LIMIT);
          fs.readSync(fd, buf, 0, FILE_SIZE_LIMIT, 0);
          fs.closeSync(fd);
          return buf.toString('utf-8') +
            `\n\n⚠️ 文件过大（${(fileSize / 1024).toFixed(1)}KB），仅读取了前 ${(FILE_SIZE_LIMIT / 1024).toFixed(0)}KB。如需完整内容请用 exec_command 读取指定行。`;
        }
        return fs.readFileSync(fullPath, 'utf-8');
      } catch (err) {
        return `读取文件失败：${err.message}`;
      }
    }
    case 'create_file': {
      try {
        const isNew = !fs.existsSync(fullPath);
        const oldContent = isNew ? '' : fs.readFileSync(fullPath, 'utf-8');
        fs.writeFileSync(fullPath, args.content || '', 'utf-8');
        printFileDiff(isNew ? 'create' : 'edit', args.filename, oldContent, args.content || '');
        return `文件 ${args.filename} ${isNew ? '创建' : '更新'}成功`;
      } catch (err) {
        return `创建文件失败：${err.message}`;
      }
    }
    case 'edit_file': {
      try {
        if (!fs.existsSync(fullPath)) {
          return `❌ 文件 ${args.filename} 不存在。请先用 create_file 创建。`;
        }
        const oldContent = fs.readFileSync(fullPath, 'utf-8');
        const lines = oldContent.split('\n');
        const totalLines = lines.length;

        let startLine = typeof args.startLine === 'number' ? args.startLine : 1;
        let endLine = typeof args.endLine === 'number' ? args.endLine : startLine;

        // 1-indexed 校验
        if (startLine < 1) startLine = 1;
        if (endLine < 1) endLine = 1;
        if (endLine > totalLines) endLine = totalLines;
        if (startLine > totalLines) {
          // 在末尾追加
          startLine = totalLines + 1;
          endLine = totalLines;
        }
        if (startLine > endLine && startLine <= totalLines) {
          endLine = startLine;
        }

        const newContent = args.newContent || '';
        const newLines = newContent.split('\n');

        // 构建新文件
        const beforeLines = lines.slice(0, startLine - 1);
        const afterLines = lines.slice(endLine); // endLine is inclusive, so slice from endLine
        const resultLines = [...beforeLines, ...newLines, ...afterLines];
        const resultContent = resultLines.join('\n');

        // 安全检查：如果编辑后文件大小变化超过 90%，拒绝（防止 AI 误覆盖）
        const sizeRatio = oldContent.length > 0 ? resultContent.length / oldContent.length : 2;
        if (sizeRatio < 0.1) {
          return `❌ 编辑拒绝：新内容仅为原文件的 ${(sizeRatio * 100).toFixed(0)}%，这很可能是个错误。请检查 startLine/endLine/newContent 参数。原文件有 ${totalLines} 行。`;
        }

        fs.writeFileSync(fullPath, resultContent, 'utf-8');
        printFileDiff('edit', args.filename, oldContent, resultContent);

        const changedLines = endLine - startLine + 1;
        const detail = startLine === endLine
          ? `第 ${startLine} 行`
          : `第 ${startLine}~${endLine} 行`;
        return `文件 ${args.filename} ${detail}已更新（${totalLines} 行 → ${resultLines.length} 行）`;
      } catch (err) {
        return `编辑文件失败：${err.message}`;
      }
    }
    case 'delete_file': {
      try {
        let oldContent = '';
        try { oldContent = fs.readFileSync(fullPath, 'utf-8'); } catch {}
        fs.unlinkSync(fullPath);
        printFileDiff('delete', args.filename, oldContent, '');
        return `文件 ${args.filename} 已删除`;
      } catch (err) {
        return `删除文件失败：${err.message}`;
      }
    }
    case 'read_dir': {
      try {
        const dir = args.dirname ? path.resolve(WORK_DIR, args.dirname) : WORK_DIR;
        const files = fs.readdirSync(dir);
        return JSON.stringify(files);
      } catch (err) {
        return `读取目录失败：${err.message}`;
      }
    }
    case 'exec_command': {
      const command = args.command;
      if (!command) return "❌ 没有提供要执行的命令";
      if (!isCommandSafe(command)) {
        return "❌ 安全限制：该命令被禁止执行";
      }
      const shell = args.shell || "powershell";
      const timeout = Math.min(args.timeout || 60, 300) * 1000;
      return await runCommand(command, shell, timeout);
    }

    // ===== TODO 工具（文件持久化） =====
    case 'todo_create': {
      try {
        const { todos, nextId } = loadTodos();
        const status = args.status || 'pending';
        const todo = {
          id: nextId,
          title: args.title,
          status,
          completed: status === 'done',
          createdAt: new Date().toISOString()
        };
        todos.push(todo);
        saveTodos(todos, nextId + 1);
        return `创建 todo #${todo.id} [${STATUS_ICONS[status]}] ${args.title}`;
      } catch (error) {
        return `创建 todo 失败: ${error.message}`;
      }
    }
    case 'todo_list': {
      try {
        const { todos } = loadTodos();
        const filterStatus = args.status;
        let filtered = filterStatus
          ? todos.filter(t => t.status === filterStatus)
          : todos;

        if (filtered.length === 0) {
          return filterStatus
            ? `暂无状态为 "${filterStatus}" 的任务`
            : '暂无待办任务';
        }

        const order = ['in_progress', 'pending', 'failed', 'done'];
        filtered.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));

        let result = '📋 待办列表：\n';
        for (const t of filtered) {
          result += `  #${t.id} [${STATUS_ICONS[t.status]} ${t.status}] ${t.title}\n`;
        }

        const counts = {};
        for (const t of todos) {
          counts[t.status] = (counts[t.status] || 0) + 1;
        }
        if (!filterStatus) {
          result += `\n📊 统计: `;
          const parts = [];
          for (const [s, n] of Object.entries(counts)) {
            parts.push(`${STATUS_ICONS[s]} ${s}: ${n}`);
          }
          result += parts.join(' | ');
          result += ` | 总计: ${todos.length}`;
        }

        return result;
      } catch (error) {
        return `失败: ${error.message}`;
      }
    }
    case 'todo_update': {
      try {
        const { todos, nextId } = loadTodos();
        const idx = todos.findIndex(t => t.id === args.id);
        if (idx === -1) return `❌ 未找到 ID 为 ${args.id} 的任务`;

        const old = todos[idx];
        if (args.title !== undefined) todos[idx].title = args.title;
        if (args.status !== undefined) {
          todos[idx].status = args.status;
          todos[idx].completed = (args.status === 'done');
        }
        if (typeof args.completed === 'boolean') {
          todos[idx].completed = args.completed;
          if (args.status === undefined) {
            todos[idx].status = args.completed ? 'done' : 'pending';
          }
        }
        saveTodos(todos, nextId);

        const icon = STATUS_ICONS[todos[idx].status];
        return `任务 #${args.id} 已更新 [${icon}] ${todos[idx].title}`;
      } catch (error) {
        return `更新任务失败: ${error.message}`;
      }
    }
    case 'todo_delete': {
      try {
        const { todos, nextId } = loadTodos();
        const idx = todos.findIndex(t => t.id === args.id);
        if (idx === -1) return `❌ 未找到 ID 为 ${args.id} 的任务`;
        const deleted = todos.splice(idx, 1)[0];
        saveTodos(todos, nextId);
        return `✅ 已删除任务 #${args.id}: "${deleted.title}"`;
      } catch (error) {
        return `❌ 删除任务失败: ${error.message}`;
      }
    }

    // ===== 记忆系统 =====
    case 'memory_store': {
      return addMemory(args.content, args.tags || []);
    }
    case 'memory_search': {
      return searchMemory(args.keyword);
    }
    case 'memory_list': {
      return listMemory();
    }
    case 'memory_delete': {
      return deleteMemory(args.id);
    }
    case 'preference_set': {
      return setPreference(args.key, args.value);
    }
    case 'preference_list': {
      return listPreferences();
    }

    // ===== 向量记忆 =====
    case 'vector_store': {
      const v = addVector(args.summary, args.keywords || []);
      return `向量记忆 #${v.id} 已存储: "${args.summary}"`;
    }
    case 'vector_search': {
      const results = searchVectors(args.query, 5);
      if (results.length === 0) return '未找到相关记忆';
      return results.map((r, i) => `${i + 1}. [相似度:${r.score.toFixed(1)}] ${r.summary}`).join('\n');
    }
    case 'vector_list': {
      return listVectors();
    }

    // ===== 自我优化 =====
    case 'self_propose_tool': {
      let params;
      try {
        params = JSON.parse(args.parameters);
      } catch {
        params = { type: "object", properties: {}, description: args.parameters };
      }
      return proposeNewTool(args.tool_name, args.description, params);
    }
    case 'self_propose_prompt': {
      return proposePromptUpdate(args.snippet, args.reason);
    }
    case 'self_list_proposals': {
      return listPendingChanges();
    }
    case 'self_approve': {
      return approveProposal(args.id);
    }
    case 'self_reject': {
      return rejectProposal(args.id);
    }
    case 'history_clear': {
      saveCurrentSession([]);
      return '当前会话历史已清空';
    }

    default:
      return `未知工具：${toolName}`;
  }
}
