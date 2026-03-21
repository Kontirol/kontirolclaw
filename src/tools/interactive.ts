import * as os from 'node:os';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import treeKill from 'tree-kill';

// 颜色常量
const reset = "\x1b[0m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const red = "\x1b[31m";

// ==============================
// 交互式命令检测
// ==============================

// 需要交互式输入的命令模式
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
 */
export function isInteractiveCommand(command: string): boolean {
  return INTERACTIVE_PATTERNS.some(pattern => pattern.test(command.trim()));
}

// ==============================
// 长期运行进程检测
// ==============================

// 长期运行进程的命令模式（不会自动退出）
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
 */
export function isLongRunningCommand(command: string): boolean {
  return LONG_RUNNING_PATTERNS.some(pattern => pattern.test(command.trim()));
}

// ==============================
// 交互式命令执行器
// ==============================

export interface InteractiveOptions {
  /** 超时时间（毫秒），默认30秒 */
  timeout?: number;
  /** 终端列数 */
  cols?: number;
  /** 终端行数 */
  rows?: number;
  /** 自动响应规则 */
  autoResponses?: AutoResponse[];
  /** 是否显示输出到控制台 */
  showOutput?: boolean;
  /** 工作目录 */
  cwd?: string;
}

export interface AutoResponse {
  /** 匹配模式（字符串或正则） */
  pattern: string | RegExp;
  /** 自动响应内容 */
  response: string;
  /** 是否等待用户确认（显示提示但不自动响应） */
  waitForUser?: boolean;
}

/**
 * 执行交互式命令
 * @returns 包含输出和是否需要用户输入的结果
 */
export async function execInteractive(
  command: string, 
  options: InteractiveOptions = {}
): Promise<{ output: string; needsInput: boolean; ptyProcess?: any }> {
  const {
    timeout = 30000,
    cols = 120,
    rows = 30,
    autoResponses = [],
    showOutput = true,
    cwd = process.cwd()
  } = options;

  // 选择shell
  const shell = os.platform() === 'win32' 
    ? (process.env.ComSpec || 'powershell.exe')
    : 'bash';

  return new Promise((resolve, reject) => {
    let output = '';
    let resolved = false;
    let ptyProcess: any = null;

    // 超时处理
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

      // 处理输出
      ptyProcess.onData((data: string) => {
        output += data;
        if (showOutput) {
          process.stdout.write(data);
        }

        // 检查自动响应
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

      // 发送命令
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
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==============================
// 交互式会话管理器
// ==============================

export class InteractiveSession {
  private ptyProcess: any;
  private output: string = '';
  private closed: boolean = false;
  private command: string;
  private onResponse: (output: string) => void;
  private cwd: string;

  constructor(command: string, onResponse: (output: string) => void, cwd?: string) {
    this.command = command;
    this.onResponse = onResponse;
    this.cwd = cwd || process.cwd();
  }

  /**
   * 启动交互式会话
   */
  async start(): Promise<void> {
    const shell = os.platform() === 'win32' 
      ? (process.env.ComSpec || 'powershell.exe')
      : 'bash';

    this.ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: this.cwd,
      env: process.env as { [key: string]: string },
    });

    this.ptyProcess.onData((data: string) => {
      this.output += data;
      this.onResponse(data);
    });

    this.ptyProcess.onExit(() => {
      this.closed = true;
    });

    // 发送命令
    this.ptyProcess.write(this.command + '\r');
  }

  /**
   * 发送输入到进程
   */
  write(data: string): void {
    if (!this.closed && this.ptyProcess) {
      this.ptyProcess.write(data);
    }
  }

  /**
   * 获取当前输出
   */
  getOutput(): string {
    return this.output;
  }

  /**
   * 关闭会话
   */
  close(): void {
    if (!this.closed && this.ptyProcess) {
      safeKill(this.ptyProcess, this.ptyProcess.pid);
      this.closed = true;
    }
  }

  /**
   * 检查会话是否已关闭
   */
  isClosed(): boolean {
    return this.closed;
  }
}

// ==============================
// 常用交互式命令的自动响应配置
// ==============================

export const COMMON_AUTO_RESPONSES: Record<string, AutoResponse[]> = {
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
  'npm init vite': [
    { pattern: 'Project name:', response: 'my-vite-app' },
    { pattern: 'Select a framework:', response: 'vue' },
    { pattern: 'Select a variant:', response: 'typescript' },
  ],
};

/**
 * 获取命令的自动响应配置
 */
export function getAutoResponses(command: string): AutoResponse[] {
  for (const [pattern, responses] of Object.entries(COMMON_AUTO_RESPONSES)) {
    if (command.includes(pattern)) {
      return responses;
    }
  }
  return [];
}
