// mcp/manager.js — 多 MCP 服务器管理
// 配置持久化到 ~/.ctrl/mcp_servers.json
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import chalk from "chalk";
import { McpClient } from "./client.js";

const CTRL_DIR = path.join(os.homedir(), ".ctrl");
const CONFIG_FILE = path.join(CTRL_DIR, "mcp_servers.json");

class McpManager {
  constructor() {
    this.clients = new Map();    // name -> McpClient
    this._started = false;
  }

  // === 配置 CRUD ===

  _ensureDir() {
    if (!fs.existsSync(CTRL_DIR)) fs.mkdirSync(CTRL_DIR, { recursive: true });
  }

  loadConfig() {
    this._ensureDir();
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      }
    } catch { /* ignore */ }
    return [];
  }

  saveConfig(servers) {
    this._ensureDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(servers, null, 2), "utf-8");
  }

  addServer(name, command, args = [], env = {}) {
    const servers = this.loadConfig();
    const existing = servers.findIndex(s => s.name === name);
    const entry = { name, command, args, env };
    if (existing >= 0) {
      servers[existing] = entry;
    } else {
      servers.push(entry);
    }
    this.saveConfig(servers);
    return `MCP 服务器 "${name}" 已保存`;
  }

  removeServer(name) {
    let servers = this.loadConfig();
    const before = servers.length;
    servers = servers.filter(s => s.name !== name);
    if (servers.length === before) return `未找到 MCP 服务器 "${name}"`;
    this.saveConfig(servers);

    // 如果已连接则断开
    const client = this.clients.get(name);
    if (client) {
      client.stop();
      this.clients.delete(name);
    }
    return `MCP 服务器 "${name}" 已移除`;
  }

  listServers() {
    const configs = this.loadConfig();
    if (configs.length === 0) return "⚠ 未配置任何 MCP 服务器。使用 :mcp add <名称> <命令> 添加";

    let out = "";
    for (const s of configs) {
      const client = this.clients.get(s.name);
      const status = client?.connected
        ? chalk.green("● 已连接")
        : chalk.red("○ 未连接");
      const toolCount = client?.tools?.length || 0;
      out += `  ${status} ${chalk.bold(s.name)} — ${s.command} ${(s.args || []).join(" ")}`;
      if (client?.connected) out += chalk.dim(`  [${toolCount} 个工具]`);
      out += "\n";
    }
    return out.trim();
  }

  listMCPTools() {
    let out = "";
    for (const [name, client] of this.clients) {
      if (!client.connected) continue;
      out += `\n📦 ${chalk.bold(name)}:\n`;
      for (const t of client.tools) {
        out += `  - ${t.name}: ${t.description || "(无描述)"}\n`;
      }
    }
    return out.trim() || "⚠ 没有已连接的 MCP 服务器";
  }

  // === 生命周期 ===

  async startAll(verbose = true) {
    if (this._started) return;
    this._started = true;

    const configs = this.loadConfig();
    if (configs.length === 0) {
      if (verbose) console.log(chalk.dim("  🔌 MCP: 未配置服务器"));
      return;
    }

    const results = await Promise.allSettled(
      configs.map(cfg => this._connectOne(cfg))
    );

    if (verbose) {
      let totalTools = 0;
      for (const [name, client] of this.clients) {
        if (client.connected) totalTools += client.tools.length;
      }
      if (totalTools > 0) {
        console.log(chalk.dim(`  🔌 MCP: ${this.clients.size} 个服务器, ${totalTools} 个工具`));
      }
    }
  }

  async _connectOne(cfg) {
    const client = new McpClient(cfg.name, cfg.command, cfg.args || [], cfg.env || {});
    try {
      await client.start();
      this.clients.set(cfg.name, client);
      console.log(chalk.green(`  ✅ MCP "${cfg.name}": ${client.tools.length} 个工具已加载`));
    } catch (err) {
      console.log(chalk.yellow(`  ⚠ MCP "${cfg.name}": ${err.message}，已跳过`));
      this.clients.delete(cfg.name);
    }
  }

  async stopAll() {
    for (const client of this.clients.values()) {
      await client.stop();
    }
    this.clients.clear();
    this._started = false;
  }

  // === 工具集成 ===

  /**
   * 获取所有 MCP 工具的 OpenAI function calling 定义
   * 命名规则: mcp_<server>_<tool>
   */
  getToolDefinitions() {
    const defs = [];
    for (const [serverName, client] of this.clients) {
      if (!client.connected) continue;
      for (const tool of client.tools) {
        const mcpName = `mcp_${serverName}_${tool.name}`;
        // 转换 JSON Schema: 确保是 object 类型
        const inputSchema = tool.inputSchema || { type: "object", properties: {} };
        defs.push({
          type: "function",
          function: {
            name: mcpName,
            description: `[MCP:${serverName}] ${tool.description || tool.name}`,
            parameters: inputSchema,
          },
        });
      }
    }
    return defs;
  }

  /**
   * 执行 MCP 工具调用
   * @param {string} fullName — mcp_<server>_<tool>
   */
  async executeToolCall(fullName, args) {
    // 解析: mcp_filesystem_read_file -> server="filesystem", tool="read_file"
    const match = fullName.match(/^mcp_(.+?)_(.+)$/);
    if (!match) return `❌ MCP 工具名格式错误: ${fullName}`;

    const [, serverName, toolName] = match;
    const client = this.clients.get(serverName);
    if (!client?.connected) {
      return `❌ MCP 服务器 "${serverName}" 未连接`;
    }

    try {
      return await client.callTool(toolName, args);
    } catch (err) {
      return `❌ MCP 调用失败: ${err.message}`;
    }
  }

  /**
   * 判断是否 MCP 工具名
   */
  isMcpTool(toolName) {
    return toolName.startsWith("mcp_");
  }
}

// 单例
export const mcpManager = new McpManager();
