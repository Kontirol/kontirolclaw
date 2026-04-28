// tools/executor.js
import * as fs from 'node:fs';
import * as path from 'node:path';
import { exec } from "node:child_process";

const WORK_DIR = process.cwd(); // 限定操作范围，避免安全问题

// 危险命令黑名单（可根据需要扩充）
const FORBIDDEN_PATTERNS = [
  /rm\s+-rf\s+\//,             // 删除根目录
  /format\s+[a-zA-Z]:/,       // 格式化磁盘
  /del\s+\/f\s+\/s\s+\/q/,    // 强制递归删除
  /shutdown\s/,               // 关机
  /restart\s/,                // 重启
  /net\s+user/,               // 操作用户
  /reg\s+delete/,             // 删除注册表
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
        timeout: 30000,          // 30 秒超时
        maxBuffer: 1024 * 500,   // 500KB 输出上限
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          // 超时或执行错误
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

    // 额外保险：如果 30 秒到了还没结束，强制杀死
    setTimeout(() => {
      if (!child.killed) {
        child.kill();
      }
    }, 30000);
  });
}

  let todos = [];           // 每个任务对象：{ id, title, completed, createdAt, due? }
  let nextId = 1;

export async function executeToolCall(toolName, args) {
  // 统一处理路径并安全检查
  const fullPath = path.resolve(WORK_DIR, args.filename || '');
  if (!fullPath.startsWith(WORK_DIR)) {
    return `❌ 安全限制：不能操作当前目录以外的路径`;
  }

  /**
   * todo部分
   */
  /**
     * todo部分
     */

  
  switch (toolName) {
    case 'read_file': {
      try {
          console.log('\x1b[34m%s\x1b[0m', `正在读取${fullPath}`);
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
      // edit 本质上和 create 一样都是覆盖写入
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
        const options = { withFileTypes: args.dirname || false };
        const files = fs.readdirSync(fullPath, options);
        console.log('\x1b[34m%s\x1b[0m', `查看目录: ${fullPath,options}`);
        return JSON.stringify(files);
      } catch (error) {
        return `读取文件失败：${err.message}`;
      }
    }
    case "exec_command": {
      const command = args.command;
      if (!command) return "❌ 没有提供要执行的命令";

      if (!isCommandSafe(command)) {
        return "❌ 安全限制：该命令被禁止执行";
      }

      const shell = args.shell || "powershell";
      console.log('\x1b[32m%s\x1b[0m', `执行命令: ${command}`);
      return await runCommand(command, shell);
    }
    case "todo_create": {
      try {
        const todo = { id: nextId++, title: args.title, completed: false, createdAt: new Date().toISOString() }
        todos.push(todo)
        console.log('\x1b[34m%s\x1b[0m',`创建 todo ID:${todo.id} ,title: ${args.title}完成`);
        return `创建 todo ID:${todo.id} ,title: ${args.title}完成`;
      } catch (error) {
        return `创建todo 失败 ${error.message}`;
      }
    }
    case "todo_list": {
      try {
        if (todos.length === 0) {
          return "暂无待办任务"
        }
        let result = "📋 待办列表：\n";
        for (let i = 0; i < todos.length; i++) {
          const t = todos[i];
          const status = t.completed ? true : false;
          result += `${t.id}. [${status}] ${t.title}\n`;
        }
        console.log('\x1b[34m%s\x1b[0m',result);
        return result;
      } catch (error) {
        return `失败 ${error.message}`
      }
    }
    case "todo_update": {
      try {
        const index = todos.findIndex(t => t.id === args.id);
        if (index === -1) {
          return `❌ 未找到 ID 为 ${id} 的任务`;
        }
        const todo = todos[index];
        // 更新标题（如果提供了）
        if (args.title !== undefined) {
          todo.title = args.title;
        }
        // 更新完成状态（如果提供了且为布尔值）
        if (typeof args.completed === "boolean") {
          todo.completed = args.completed;
        }
        // 更新截止日期（如果提供了，可选功能）
        if (args.due !== undefined) {
          todo.due = args.due;
        }
        console.log('\x1b[34m%s\x1b[0m',`任务 #${id} 已更新`);
        return `任务 #${id} 已更新`;
      } catch (error) {
        return `更新任务失败: ${error.message}`;
      }
    }
    case "todo_delete": {
      try {
        const id = args.id;
        const index = todos.findIndex(t => t.id === id);
        if (index === -1) {
          return `❌ 未找到 ID 为 ${id} 的任务`;
        }
        const deleted = todos.splice(index, 1)[0];
        console.log('\x1b[34m%s\x1b[0m',`✅ 已删除任务 #${id}: "${deleted.title}"`);
        return `✅ 已删除任务 #${id}: "${deleted.title}"`;
      } catch (error) {
        return `❌ 删除任务失败: ${error.message}`;
      }
    }
    default:
      return `未知工具：${toolName}`;
  }
}