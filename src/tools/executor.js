// tools/executor.js
import * as fs from 'node:fs';
import * as path from 'node:path';
import { exec } from "node:child_process";
import { addMemory, searchMemory, listMemory, deleteMemory, loadMemory } from "../memory/preferences.js";
import { setPreference, listPreferences } from "../memory/preferences.js";
import { addVector, searchVectors, listVectors, deleteVector } from "../memory/vector.js";
import { proposeNewTool, proposePromptUpdate, listPendingChanges, approveProposal, rejectProposal } from "../memory/self-improve.js";
import { clearHistory } from "../memory/history.js";

const WORK_DIR = process.cwd();

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

async function runCommand(command, shell = "powershell") {
  return new Promise((resolve) => {
    const shellPath = shell === "cmd" ? "cmd.exe" : "powershell.exe";
    const shellFlag = shell === "cmd" ? "/c" : "-Command";

    const child = exec(
      `${shellPath} ${shellFlag} "${command.replace(/"/g, '\\"')}"`,
      {
        cwd: WORK_DIR,
        timeout: 30000,
        maxBuffer: 1024 * 500,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          if (error.killed) {
            resolve(`❌ 命令执行超时（30秒）`);
          } else {
            resolve(`❌ 命令执行失败：${error.message}\n${stderr}`);
          }
        } else {
          resolve(stdout || stderr || "命令执行成功，无输出");
        }
      }
    );

    setTimeout(() => {
      if (!child.killed) child.kill();
    }, 30000);
  });
}

// TODO 本地状态
let todos = [];
let nextId = 1;

export async function executeToolCall(toolName, args) {
  // 路径类工具安全检查
  const fullPath = args.filename ? path.resolve(WORK_DIR, args.filename) : WORK_DIR;
  if (args.filename && !fullPath.startsWith(WORK_DIR)) {
    return `❌ 安全限制：不能操作当前目录以外的路径`;
  }

  switch (toolName) {
    // ===== 文件操作 =====
    case 'read_file': {
      try {
        console.log('\x1b[34m%s\x1b[0m', `正在读取 ${fullPath}`);
        return fs.readFileSync(fullPath, 'utf-8');
      } catch (err) {
        return `读取文件失败：${err.message}`;
      }
    }
    case 'create_file': {
      try {
        console.log('\x1b[34m%s\x1b[0m', `正在创建 ${fullPath}`);
        fs.writeFileSync(fullPath, args.content || '', 'utf-8');
        return `文件 ${args.filename} 创建/更新成功`;
      } catch (err) {
        return `创建文件失败：${err.message}`;
      }
    }
    case 'delete_file': {
      try {
        console.log('\x1b[31m%s\x1b[0m', `删除了 ${fullPath}`);
        fs.unlinkSync(fullPath);
        return `文件 ${args.filename} 已删除`;
      } catch (err) {
        return `删除文件失败：${err.message}`;
      }
    }
    case 'edit_file': {
      try {
        console.log('\x1b[34m%s\x1b[0m', `修改 ${fullPath}`);
        fs.writeFileSync(fullPath, args.content || '', 'utf-8');
        return `文件 ${args.filename} 已修改`;
      } catch (err) {
        return `修改文件失败：${err.message}`;
      }
    }
    case 'read_dir': {
      try {
        const dir = args.dirname ? path.resolve(WORK_DIR, args.dirname) : WORK_DIR;
        const files = fs.readdirSync(dir);
        console.log('\x1b[34m%s\x1b[0m', `查看目录: ${dir}`);
        return JSON.stringify(files);
      } catch (err) {
        return `读取目录失败：${err.message}`;
      }
    }
    case 'exec_command': {
      const command = args.command;
      if (!command) return "❌ 没有提供要执行的命令";
      if (!isCommandSafe(command)) return "❌ 安全限制：该命令被禁止执行";
      const shell = args.shell || "powershell";
      console.log('\x1b[32m%s\x1b[0m', `执行命令: ${command}`);
      return await runCommand(command, shell);
    }

    // ===== TODO 工具 =====
    case 'todo_create': {
      try {
        const todo = { id: nextId++, title: args.title, completed: false, createdAt: new Date().toISOString() };
        todos.push(todo);
        console.log('\x1b[34m%s\x1b[0m', `创建 todo ID:${todo.id}, title: ${args.title}`);
        return `创建 todo ID:${todo.id}, title: ${args.title} 完成`;
      } catch (error) {
        return `创建 todo 失败: ${error.message}`;
      }
    }
    case 'todo_list': {
      try {
        if (todos.length === 0) return "暂无待办任务";
        let result = "📋 待办列表：\n";
        for (const t of todos) {
          const status = t.completed ? '✅' : '⬜';
          result += `${t.id}. [${status}] ${t.title}\n`;
        }
        console.log('\x1b[34m%s\x1b[0m', result);
        return result;
      } catch (error) {
        return `失败: ${error.message}`;
      }
    }
    case 'todo_update': {
      try {
        const idx = todos.findIndex(t => t.id === args.id);
        if (idx === -1) return `❌ 未找到 ID 为 ${args.id} 的任务`;
        if (args.title !== undefined) todos[idx].title = args.title;
        if (typeof args.completed === "boolean") todos[idx].completed = args.completed;
        console.log('\x1b[34m%s\x1b[0m', `任务 #${args.id} 已更新`);
        return `任务 #${args.id} 已更新`;
      } catch (error) {
        return `更新任务失败: ${error.message}`;
      }
    }
    case 'todo_delete': {
      try {
        const idx = todos.findIndex(t => t.id === args.id);
        if (idx === -1) return `❌ 未找到 ID 为 ${args.id} 的任务`;
        const deleted = todos.splice(idx, 1)[0];
        console.log('\x1b[34m%s\x1b[0m', `✅ 已删除任务 #${args.id}: "${deleted.title}"`);
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
      return clearHistory();
    }

    default:
      return `未知工具：${toolName}`;
  }
}
