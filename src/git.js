// git.js - Git 仓库感知
import { execSync } from 'child_process';
import fs from 'node:fs';
import path from 'node:path';

let _cached = null;
let _cachedDir = null;

function git(args, cwd) {
  try {
    return execSync(`git ${args}`, { cwd, encoding: 'utf-8', timeout: 3000, windowsHide: true }).trim();
  } catch {
    return null;
  }
}

/** 向上查找 .git 目录 */
function findGitRoot(startDir) {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

export function getGitContext(cwd = process.cwd()) {
  // 缓存当前目录的结果
  if (_cached && _cachedDir === cwd) return _cached;

  const gitRoot = findGitRoot(cwd);
  if (!gitRoot) {
    _cached = null;
    _cachedDir = cwd;
    return null;
  }

  const parts = [];

  // 分支
  const branch = git('branch --show-current', gitRoot);
  if (branch) {
    parts.push(`当前分支: ${branch}`);
  } else {
    // detached HEAD
    const head = git('rev-parse --short HEAD', gitRoot);
    if (head) parts.push(`HEAD: ${head} (detached)`);
  }

  // 状态
  const status = git('status --short', gitRoot);
  if (status) {
    const lines = status.split('\n').filter(Boolean);
    const maxShow = 30;
    const preview = lines.slice(0, maxShow).join('\n');
    parts.push(`文件变更:\n${preview}`);
    if (lines.length > maxShow) {
      parts.push(`... 还有 ${lines.length - maxShow} 个文件`);
    }
    // 统计
    const staged = lines.filter(l => !l.startsWith(' ') && l[1] !== '?').length;
    const unstaged = lines.filter(l => l.startsWith(' ') || l[1] !== '?' && l[0] === ' ').length;
    const untracked = lines.filter(l => l.startsWith('??')).length;
    const stats = [];
    if (staged) stats.push(`${staged} 已暂存`);
    if (unstaged) stats.push(`${unstaged} 未暂存`);
    if (untracked) stats.push(`${untracked} 未跟踪`);
    if (stats.length) parts.push(`统计: ${stats.join(', ')}`);
  }

  // 最近提交
  const log = git('log --oneline -5', gitRoot);
  if (log) {
    parts.push(`最近提交:\n${log}`);
  }

  // 远程仓库
  const remote = git('remote get-url origin', gitRoot);
  if (remote) {
    parts.push(`远程: ${remote}`);
  }

  const context = parts.join('\n\n');
  _cached = context;
  _cachedDir = cwd;
  return context;
}

// 用于在每次用户输入前刷新缓存（文件变更后）
export function clearGitCache() {
  _cached = null;
  _cachedDir = null;
}
