# ⏺ Ctrl

> DeepSeek-powered CLI developer assistant — an AI partner in your terminal that writes code, debugs, manages files, and remembers things.

Ctrl is a command-line AI assistant. It doesn't just chat — it **reads/writes files**, **executes commands**, **manages TODOs**, **remembers** your preferences long-term, and can even **self-evolve** by proposing new tools and rules for your approval.

---

**中文** | Ctrl 是一个运行在命令行中的 AI 助手。它不只是聊天——它可以读写文件、执行命令、管理待办、长期记忆用户偏好，甚至会自我进化（提出新工具 / 新规则，等你批准）。

---

## Features · 功能

| Capability · 能力 | Description · 说明 |
|---|---|
| 💬 **Chat · 对话** | Streaming conversation via DeepSeek API, with reasoning content display |
| 📁 **File Ops · 文件操作** | Read, create, edit, delete files — with colorized diff on edit |
| ⚡ **Commands · 命令执行** | Execute PowerShell / cmd commands (with safety guard) |
| ✅ **Todos · 待办** | Persistent todo list with `pending` / `in_progress` / `done` / `failed` statuses |
| 🧠 **Memory · 记忆** | User preference learning + keyword memory + vector semantic search |
| 🔄 **Sessions · 多会话** | Create, switch, delete sessions — isolated conversation contexts |
| 🛠 **Self-improve · 自我优化** | AI proposes new tools / rules — takes effect after you approve |
| 🎨 **Pretty CLI · 美化** | Brain spinner animation, colorized diff, icon-rich tool-call display |

---

## Prerequisites · 前置条件

- **Node.js** >= 18
- **DeepSeek API Key** ([get one here](https://platform.deepseek.com/) · [获取地址](https://platform.deepseek.com/))

---

## Install · 安装

```bash
# Clone · 克隆
git clone https://github.com/Kontirol/KontirolClaw.git
cd KontirolClaw

# Install dependencies · 安装依赖
npm install

# Configure API Key (pick one) · 配置 API Key（二选一）
# Option 1: Environment variable (recommended) · 环境变量（推荐）
set CTRL_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxx      # Windows CMD
$env:CTRL_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxxx"    # PowerShell

# Option 2: Config file (writes to ~/.ctrl/config.json) · 配置文件
node -e "import('./src/config.js').then(m=>m.saveConfig({apiKey:'sk-xxx'}))"

# Start · 启动
npm start
```

> 💡 You can also set `CTRL_BASE_URL` (custom API endpoint) and `CTRL_MODEL` (model name). Default model: `deepseek-v4-pro`.
>
> 💡 也可配置 `CTRL_BASE_URL`（自定义 API 地址）和 `CTRL_MODEL`（模型名），默认 `deepseek-v4-pro`。

---

## Usage · 使用

### Basic Chat · 基本对话

```
Ctrl > Write me an Express server
Ctrl > What's wrong with this function?
Ctrl > Remember: I prefer TypeScript
Ctrl > exit
```

### Session Commands · 会话命令

| Command | Action |
|---|---|
| `:new [name]` | Create a new session · 创建新会话 |
| `:switch <ID>` | Switch to a session · 切换到指定会话 |
| `:sessions` / `:list` | List all sessions · 列出所有会话 |
| `:delete <ID>` | Delete a session · 删除会话 |
| `:help` | Show help · 显示帮助 |
| `Esc` | Abort current request · 中断当前请求 |
| `exit` | Quit · 退出 |

### What the AI Can Do · AI 可以做的事

Just ask naturally — Ctrl will invoke the right tool automatically.  
自然对话即可，Ctrl 会自动调用对应工具：

| Ask · 你说 | Tool · 调用的工具 |
|---|---|
| "Read package.json" | `read_file` |
| "Create src/utils.ts" | `create_file` |
| "Change the port in app.ts to 8080" | `edit_file` |
| "Run npm run build" | `exec_command` |
| "Make a todo list" | `todo_create` |
| "Remember: my project is called CineMax" | `memory_store` |

---

## Architecture · 架构

```
Ctrl/
├── src/
│   ├── index.js           # Entry: REPL loop, streaming chat
│   ├── config.js          # Config (env vars / ~/.ctrl/config.json)
│   ├── tools/
│   │   ├── definition.js  # OpenAI tool schemas
│   │   └── executor.js    # Tool execution logic
│   ├── memory/
│   │   ├── preferences.js # User preferences + long-term memory
│   │   ├── vector.js      # Lightweight RAG vector memory
│   │   ├── sessions.js    # Multi-session management
│   │   └── self-improve.js # Custom tools + prompt proposals
│   └── ui/
│       ├── banner.js      # Startup banner, tool-call display
│       ├── spinner.js     # Brain spinner animation (stderr)
│       └── diff.js        # Colorized file diff
├── package.json
└── README.md
```

### Memory System · 记忆系统 (4 layers · 四层)

| Layer · 层级 | Trigger · 触发 | Storage · 存储位置 |
|---|---|---|
| **Preferences · 偏好** | AI auto-learns · AI 自动学习 | `~/.ctrl/preferences.json` |
| **Long-term Memory · 长期记忆** | User says "Remember..." · 用户说「记住...」 | `~/.ctrl/memory.json` |
| **Vector Memory · 向量记忆** | AI auto-summarizes · AI 自动总结 | `~/.ctrl/vectors.json` (with similarity scoring) |
| **Self-improvement · 自我优化** | AI proposes when needed · AI 发现不足时提案 | `~/.ctrl/custom_tools.json` / `custom_prompt.txt` |

---

## Safety · 安全

- Commands are filtered through a **blocklist** (prevents `rm -rf /`, `format`, etc.)
  命令执行有**黑名单**防护
- File operations are **scoped to the current working directory**
  文件操作限制在**当前工作目录**
- Self-improvement proposals require **your explicit approval** before taking effect
  自我优化提案需要**你手动确认**才会生效

---

## License · 许可

ISC © [nijat (Ctrl)](https://github.com/Kontirol)
