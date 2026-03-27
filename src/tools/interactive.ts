/**
 * 交互式命令执行工具模块
 * 用于处理需要用户交互的命令（如 npm create、git commit 等）
 * 以及长时间运行的进程（如开发服务器）
 */

import * as os from 'node:os';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import treeKill from 'tree-kill';

// 终端输出颜色常量
const reset = "\x1b[0m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const red = "\x1b[31m";

// =============================================================
// 交互式命令检测
// =============================================================

/**
 * 需要交互式输入的命令模式列表
 * 这些命令在执行过程中会暂停等待用户输入
 */
const INTERACTIVE_PATTERNS = [
  // npm create/init 系列
  /^npm\s+create\s+/i,
  /^npm\s+init\s+(?!-y)/i,  // npm init 但不是 npm init -y
  /^npx\s+create-/i,
  /^yarn\s+create\s+/i,
  /^pnpm\s+create\s+/i,
  
  // 框架CLI
  /^ng\s+new\s+/i,
  /^dotnet\s+new\s+/i,
  /^rails\s+new\s+/i,
  /^cargo\s+new\s+/i,
  
  // Git交互式命令
  /^git\s+commit\s*$/i,  // 没有 -m 参数
  /^git\s+rebase\s+-i/i,
  /^git\s+add\s+-p/i,
  /^git\s+bisect/i,
  
  // 数据库/远程连接
  /^ssh\s+/i,
  /^mysql\s+/i,
  /^psql\s+/i,
  /^redis-cli/i,
];

/**
 * 检测命令是否需要交互式输入
 * @param command - 要检测的命令字符串
 * @returns true表示命令需要交互式输入，false表示普通命令
 */
export function isInteractiveCommand(command: string): boolean {
  return INTERACTIVE_PATTERNS.some(pattern => pattern.test(command.trim()));
}

// =============================================================
// 长期运行进程检测
// =============================================================

/**
 * 长期运行进程的命令模式列表
 * 这些命令会持续运行，不会自动退出（如开发服务器）
 */
const LONG_RUNNING_PATTERNS = [
  // 开发服务器
  /npm\s+run\s+(dev|serve|start|watch)/i,
  /yarn\s+(dev|serve|start|watch)/i,
  /pnpm\s+(dev|serve|start|watch)/i,
  /ng\s+(serve|start)/i,
  /vite/i,
  /webpack-dev-server/i,
  /nodemon/i,
  /node\s+--watch/i,
  
  // 构建监听
  /npm\s+run\s+build\s+--\s*--watch/i,
  /tsc\s+--watch/i,
  /rollup\s+--watch/i,
  
  // 服务器
  /node\s+.*server/i,
  /express/i,
  /http-server/i,
  /live-server/i,
];

/**
 * 检测命令是否是长期运行进程
 * @param command - 要检测的命令字符串
 * @returns true表示命令会长期运行，false表示普通命令
 */
export function isLongRunningCommand(command: string): boolean {
  return LONG_RUNNING_PATTERNS.some(pattern => pattern.test(command.trim()));
}

// =============================================================
// 交互式命令执行器
// =============================================================

/**
 * 交互式命令执行选项
 */
export interface InteractiveOptions {
  /** 超时时间（毫秒），默认30秒 */
  timeout?: number;
  /** 终端列数 */
  cols?: number;
  /** 终端行数 */
  rows?: number;
  /** 自动响应规则数组 */
  autoResponses?: AutoResponse[];
  /** 是否显示输出到控制台 */
  showOutput?: boolean;
  /** 工作目录 */
  cwd?: string;
}

/**
 * 自动响应规则
 * 用于在检测到特定输出时自动输入内容
 */
export interface AutoResponse {
  /** 匹配模式（字符串或正则表达式） */
  pattern: string | RegExp;
  /** 自动响应内容 */
  response: string;
  /** 是否等待用户确认（显示提示但不自动响应） */
  waitForUser?: boolean;
}

/**
 * 执行交互式命令
 * 使用PTY（伪终端）在后台执行命令，支持交互式输入
 * @param command - 要执行的命令
 * @param options - 执行选项
 * @returns 包含输出和是否需要用户输入的结果对象
 * 
 * @example
 * // 执行需要交互的命令
 * const result = await execInteractive('npm create vue@latest my-app', {
 *   timeout: 60000,
 *   showOutput: true,
 *   autoResponses: [
 *     { pattern: 'Project name:', response: 'my-app' }
 *   ]
 * });
 */
export async function execInteractive(
  command: string, 
  options: InteractiveOptions = {}
): Promise<{ output: string; needsInput: boolean; ptyProcess?: any }> {
  // 解构配置项，设置默认值
  const {
    timeout = 30000,
    cols = 120,
    rows = 30,
    autoResponses = [],
    showOutput = true,
    cwd = process.cwd()
  } = options;

  // 选择合适的shell：Windows用cmd或powershell，其他用bash
  const shell = os.platform() === 'win32' 
    ? (process.env.ComSpec || 'powershell.exe')
    : 'bash';

  // 返回Promise以便异步执行
  return new Promise((resolve, reject) => {
    let output = '';
    let resolved = false;
    let ptyProcess: any = null;

    // 超时定时器
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (ptyProcess) {
          safeKill(ptyProcess, ptyProcess.pid);
        }
        reject(new Error(`⏰ 命令执行超时 (${timeout}ms)\n命令: ${command}\n\n提示：交互式命令可能需要更长时间，可以尝试增加超时时间。`));
      }
    }, timeout);

    try {
      // 创建PTY进程
      ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: cwd,
        env: process.env as { [key: string]: string },
      });

      // 处理命令输出
      ptyProcess.onData((data: string) => {
        output += data;
        if (showOutput) {
          process.stdout.write(data);
        }

        // 检查自动响应规则
        for (const rule of autoResponses) {
          const pattern = typeof rule.pattern === 'string'
            ? new RegExp(escapeRegex(rule.pattern), 'i')
            : rule.pattern;
          
          if (pattern.test(output) && !rule.waitForUser) {
            setTimeout(() => {
              ptyProcess.write(rule.response + '\r');
            }, 100);
          }
        }
      });

      // 进程退出处理
      ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          
          if (exitCode === 0) {
            resolve({ output, needsInput: false });
          } else {
            reject(new Error(`命令执行失败，退出码: ${exitCode}\n输出: ${output}`));
          }
        }
      });

      // 发送命令到PTY
      ptyProcess.write(command + '\r');

      // 检测是否需要用户输入（等待2秒后检查）
      setTimeout(() => {
        if (!resolved && needsUserInput(output)) {
          resolved = true;
          clearTimeout(timer);
          // 不杀死进程，让用户可以继续交互
          resolve({ output, needsInput: true, ptyProcess });
        }
      }, 2000);

    } catch (err: any) {
      clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        reject(new Error(`创建PTY进程失败: ${err.message}`));
      }
    }
  });
}

/**
 * 检测输出是否需要用户输入
 * @private
 * 通过检测输出中的常见交互提示来判断
 * @param output - 命令输出内容
 * @returns 是否需要用户输入
 */
function needsUserInput(output: string): boolean {
  const inputIndicators = [
    /\?.*:.*$/m,           // "? Project name:"
    /请输入/i,
    /选择.*:/i,
    /\[.*\]\s*$/,          // "[Y/n]"
    /continue\?/i,
    /\(y\/n\)/i,
    /enter.*:/i,
    />?\s*$/m,             // 以 > 或空白结尾的提示
  ];
  
  return inputIndicators.some(pattern => pattern.test(output));
}

/**
 * 安全杀死进程（包括子进程树）
 * @private
 * 在Windows上需要使用tree-kill杀死整个进程树
 * @param ptyProcess - PTY进程对象
 * @param pid - 进程ID
 */
function safeKill(ptyProcess: any, pid: number): void {
  try {
    if (os.platform() === 'win32') {
      // Windows需要杀死整个进程树
      treeKill(pid, 'SIGTERM', (err) => {
        if (err) {
          // 如果tree-kill失败，尝试直接kill
          try {
            ptyProcess.kill();
          } catch {}
        }
      });
    } else {
      ptyProcess.kill();
    }
  } catch (err) {
    console.error('杀死进程失败:', err);
  }
}

/**
 * 转义正则表达式特殊字符
 * @private
 * @param str - 要转义的字符串
 * @returns 转义后的字符串
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================================
// 交互式会话管理器
// =============================================================

/**
 * 交互式会话类
 * 用于管理需要长时间交互的终端会话
 * 可以发送输入、获取输出、关闭会话
 */
export class InteractiveSession {
  /** PTY进程对象 */
  private ptyProcess: any;
  /** 累积的输出内容 */
  private output: string = '';
  /** 会话是否已关闭 */
  private closed: boolean = false;
  /** 要执行的命令 */
  private command: string;
  /** 输出回调函数 */
  private onResponse: (output: string) => void;
  /** 工作目录 */
  private cwd: string;

  /**
   * 构造函数
   * @param command - 要执行的命令
   * @param onResponse - 处理输出的回调函数
   * @param cwd - 工作目录（可选，默认当前目录）
   */
  constructor(command: string, onResponse: (output: string) => void, cwd?: string) {
    this.command = command;
    this.onResponse = onResponse;
    this.cwd = cwd || process.cwd();
  }

  /**
   * 启动交互式会话
   * 创建PTY进程并执行命令
   */
  async start(): Promise<void> {
    const shell = os.platform() === 'win32' 
      ? (process.env.ComSpec || 'powershell.exe')
      : 'bash';

    // 创建PTY进程
    this.ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: this.cwd,
      env: process.env as { [key: string]: string },
    });

    // 监听数据输出
    this.ptyProcess.onData((data: string) => {
      this.output += data;
      this.onResponse(data);
    });

    // 监听进程退出
    this.ptyProcess.onExit(() => {
      this.closed = true;
    });

    // 发送命令
    this.ptyProcess.write(this.command + '\r');
  }

  /**
   * 发送输入到进程
   * 用于在会话运行过程中向进程发送数据
   * @param data - 要发送的数据
   */
  write(data: string): void {
    if (!this.closed && this.ptyProcess) {
      this.ptyProcess.write(data);
    }
  }

  /**
   * 获取当前输出
   * 返回会话至今的所有输出累积
   * @returns 输出字符串
   */
  getOutput(): string {
    return this.output;
  }

  /**
   * 关闭会话
   * 终止PTY进程，结束交互式会话
   */
  close(): void {
    if (!this.closed && this.ptyProcess) {
      safeKill(this.ptyProcess, this.ptyProcess.pid);
      this.closed = true;
    }
  }

  /**
   * 检查会话是否已关闭
   * @returns 会话是否已关闭
   */
  isClosed(): boolean {
    return this.closed;
  }
}

// =============================================================
// 常用交互式命令的自动响应配置
// =============================================================

/**
 * 预定义的常用命令自动响应规则
 * 包含一些常见CLI工具的默认交互选项
 */
export const COMMON_AUTO_RESPONSES: Record<string, AutoResponse[]> = {
  // Vue项目创建
  'npm create vue@latest': [
    { pattern: 'Project name:', response: 'my-vue-app' },
    { pattern: 'Add TypeScript?', response: 'Yes' },
    { pattern: 'Add JSX Support?', response: 'Yes' },
    { pattern: 'Add Vue Router?', response: 'Yes' },
    { pattern: 'Add Pinia?', response: 'Yes' },
    { pattern: 'Add Vitest?', response: 'No' },
    { pattern: 'Add ESLint?', response: 'No' },
    { pattern: 'Add Prettier?', response: 'No' },
  ],
  // Vite项目创建
  'npm init vite': [
    { pattern: 'Project name:', response: 'my-vite-app' },
    { pattern: 'Select a framework:', response: 'vue' },
    { pattern: 'Select a variant:', response: 'typescript' },
  ],
};

/**
 * 获取命令的自动响应配置
 * 根据命令内容匹配预定义的自动响应规则
 * @param command - 要执行的命令
 * @returns 匹配到的自动响应规则数组，如果没有则返回空数组
 */
export function getAutoResponses(command: string): AutoResponse[] {
  for (const [pattern, responses] of Object.entries(COMMON_AUTO_RESPONSES)) {
    if (command.includes(pattern)) {
      return responses;
    }
  }
  return [];
}
