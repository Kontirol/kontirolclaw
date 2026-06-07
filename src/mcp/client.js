// mcp/client.js — MCP stdio JSON-RPC 客户端
// 单服务器连接管理
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import process from "node:process";

const isWindows = process.platform === "win32";

export class McpClient {
  constructor(name, command, args = [], env = {}) {
    this.name = name;
    this.command = command;
    this.args = args;
    this.env = { ...process.env, ...env };
    this.process = null;
    this.idCounter = 0;
    this.pending = new Map(); // id -> { resolve, reject }
    this.rl = null;
    this._connected = false;
    this._tools = [];
    this._capabilities = null;
  }

  get connected() { return this._connected; }
  get tools() { return this._tools; }

  /**
   * 启动子进程并完成 MCP 握手
   * @param {number} timeoutMs 首次下载可能很慢，默认 60s
   */
  async start(timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.kill();
        reject(new Error(`连接超时 (${timeoutMs / 1000}s)`));
      }, timeoutMs);

      try {
        if (isWindows) {
          // Windows: 用 shell 执行，拼接为单条命令字符串，避免 args 注入警告
          const cmd = [this.command, ...this.args].join(" ");
          this.process = spawn(cmd, [], {
            stdio: ["pipe", "pipe", "pipe"],
            env: this.env,
            windowsHide: true,
            shell: true,
          });
        } else {
          this.process = spawn(this.command, this.args, {
            stdio: ["pipe", "pipe", "pipe"],
            env: this.env,
          });
        }
      } catch (err) {
        clearTimeout(timer);
        return reject(new Error(`启动失败 - ${err.message}`));
      }

      this.process.on("error", (err) => {
        clearTimeout(timer);
        this._connected = false;
        reject(new Error(`进程错误 - ${err.message}`));
      });

      this.process.on("exit", (code) => {
        this._connected = false;
        for (const [id, { reject: rej }] of this.pending) {
          rej(new Error(`进程意外退出 (code ${code})`));
          this.pending.delete(id);
        }
      });

      // 行级读取 stdout
      this.rl = createInterface({ input: this.process.stdout });
      this.rl.on("line", (line) => {
        try {
          const msg = JSON.parse(line);
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve: res, reject: rej } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
            else res(msg.result);
          }
        } catch { /* 忽略非 JSON 行 */ }
      });

      // stderr 静默
      this.process.stderr.on("data", () => {});

      // 初始化握手
      this._send("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        clientInfo: { name: "Ctrl", version: "1.0.0" },
      })
        .then((result) => {
          clearTimeout(timer);
          this._capabilities = result.capabilities;
          this._notify("notifications/initialized", {});
          this._connected = true;
          return this.listTools();
        })
        .then((tools) => {
          this._tools = tools || [];
          resolve(this._tools);
        })
        .catch((err) => {
          clearTimeout(timer);
          this.kill();
          reject(err);
        });
    });
  }

  async listTools() {
    const result = await this._send("tools/list", {});
    return result?.tools || [];
  }

  async callTool(toolName, args) {
    const result = await this._send("tools/call", {
      name: toolName,
      arguments: args,
    });
    if (result?.content) {
      return result.content.map((c) => c.text || JSON.stringify(c)).join("\n");
    }
    return JSON.stringify(result);
  }

  async stop() {
    this._connected = false;
    this.kill();
  }

  kill() {
    if (this.rl) { try { this.rl.close(); } catch {} this.rl = null; }
    if (this.process) { try { this.process.kill(); } catch {} this.process = null; }
  }

  // === 内部 ===

  async _send(method, params) {
    if (!this.process || this.process.killed) {
      throw new Error(`进程未运行`);
    }
    const id = ++this.idCounter;
    const req = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.process.stdin.write(req);
    });
  }

  _notify(method, params) {
    if (!this.process || this.process.killed) return;
    const req = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
    this.process.stdin.write(req);
  }
}
