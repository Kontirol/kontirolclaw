# KontirolClaw 技术文档

## 项目概述

KontirolClaw 是一个强大的 AI 驱动的 CLI 代理应用，通过自然语言与用户交互，将用户的自然语言请求转换为系统命令执行。该项目支持双后端模式：OpenAI API (Moonshot) 和本地 Ollama 模型。

## 项目结构

```
KontirolClaw/
├── src/                          # 源代码目录
│   ├── index.ts                  # OpenAI API 模式入口
│   ├── ollama.ts                 # Ollama 本地模型模式入口
│   ├── session/                  # 会话管理模块
│   │   ├── types.ts              # 会话数据类型定义
│   │   ├── session-manager.ts    # 会话管理器核心
│   │   └── session-utils.ts      # 会话工具函数
│   └── tools/                    # 工具模块
│       ├── file.ts               # 文件操作工具
│       ├── todo.ts               # 待办事项管理工具
│       └── interactive.ts        # 交互式命令处理工具
├── skills/                       # 技能插件目录
├── package.json                 # 项目配置
└── todo.json                    # 待办事项数据文件
```

## 模块详解

### 一、会话管理模块 (session/)

#### 1.1 types.ts - 数据类型定义

本文件定义了会话系统所需的所有 TypeScript 接口，是整个会话模块的基础。

**核心类型：**

- **SessionMessage**：单条消息结构
  - `role`: 消息角色 (`'user' | 'assistant' | 'system'`)
  - `content`: 消息内容

- **Session**：完整会话结构
  - `id`: 唯一标识符
  - `title`: 标题（自动从第一条用户消息生成）
  - `messages`: 消息数组
  - `createdAt`: 创建时间戳
  - `updatedAt`: 更新时间戳
  - `tags`: 标签数组

- **SessionIndex**：会话索引（轻量级列表）
  - `sessions`: 所有会话的元数据列表
  - `lastActiveSessionId`: 最后活跃会话ID

- **SessionMeta**：会话元数据（用于列表展示）
  - 包含 id、title、时间戳、消息数量、标签

#### 1.2 session-manager.ts - 会话管理器核心

这是整个会话系统的核心模块，负责会话的完整生命周期管理。

**核心功能：**

1. **会话存储位置**：
   - 数据存储在用户主目录：`~/.kontirolclaw/`
   - `session-index.json`：会话索引文件
   - `sessions/*.json`：每个会话的完整数据

2. **核心方法：**
   - `createSession(initialMessages)`: 创建新会话
   - `loadSession(sessionId)`: 加载指定会话
   - `getLastActiveSession()`: 获取最后活跃会话（用于恢复）
   - `getAllSessions()`: 获取所有会话列表
   - `updateCurrentSession(messages)`: 更新当前会话
   - `deleteSession(sessionId)`: 删除会话

3. **自动保存机制**：
   - 每隔5条消息自动保存一次
   - 避免频繁的IO操作影响性能

4. **会话恢复逻辑**：
   - 启动时优先恢复上次会话
   - 如果没有历史会话，创建新会话

#### 1.3 session-utils.ts - 会话工具函数

提供辅助函数：

- `formatSessionTime(timestamp)`: 格式化时间戳为中文日期时间
- `truncateString(str, maxLength)`: 截断字符串（添加省略号）
- `convertToSessionMessage(message)`: 转换消息格式

---

### 二、工具模块 (tools/)

#### 2.1 file.ts - 文件操作工具

提供5个文件操作函数，AI模型可以直接调用：

| 函数 | 功能 | 示例 |
|------|------|------|
| `readFile(path)` | 读取文件内容 | `readFile("test.txt")` |
| `createFile(path)` | 创建空文件 | `createFile("notes.md")` |
| `editFile(path, content)` | 写入/覆盖文件 | `editFile("notes.md", "# 内容")` |
| `deleteFile(path)` | 删除文件 | `deleteFile("old.txt")` |
| `readDir(path)` | 读取目录列表 | `readDir("./")` |

**注意**：安全检查函数 `validateSafePath` 目前已禁用，可以访问任意路径。

#### 2.2 todo.ts - 待办事项管理工具

提供5个待办事项管理函数，用于AI跟踪任务进度：

| 函数 | 功能 | 示例 |
|------|------|------|
| `createTodoList(json)` | 批量创建任务 | `createTodoList('[{"id":"1","content":"任务A","status":"pending"}]')` |
| `updateTodoStatus(id, status)` | 更新任务状态 | `updateTodoStatus("1", "completed")` |
| `getTodos()` | 获取任务列表 | `getTodos()` |
| `addTodo(content, priority)` | 添加任务 | `addTodo("新任务", "high")` |
| `deleteTodo(id)` | 删除任务 | `deleteTodo("1")` |

**数据结构：**
- `status`: `pending` | `in_progress` | `completed`
- `priority`: `high` | `medium` | `low`

**数据存储**：项目根目录的 `todo.json` 文件

#### 2.3 interactive.ts - 交互式命令处理

处理需要用户交互的命令和长时间运行的进程。

**核心功能：**

1. **交互式命令检测** (`isInteractiveCommand`)
   - 检测需要用户输入的命令
   - 包括：npm create、npm init、git commit 无 -m、ssh 等

2. **长期运行进程检测** (`isLongRunningCommand`)
   - 检测开发服务器等持续运行的命令
   - 包括：npm run dev、vite、nodemon 等

3. **PTY 模式执行** (`execInteractive`)
   - 使用伪终端（PTY）执行交互式命令
   - 支持自动响应配置
   - 支持超时控制

4. **后台进程处理** (主入口中)
   - 使用 `spawn` 在后台启动长期进程
   - 收集初始输出后分离进程
   - 返回 PID 供用户管理

---

### 三、入口文件

#### 3.1 index.ts - OpenAI API 模式

使用 Moonshot/OpenAI API 作为 AI 后端。

**核心流程：**

1. **初始化阶段**
   - 加载技能文档（skills/SKILL.md）
   - 初始化 OpenAI 客户端
   - 初始化会话管理器
   - 解析命令行参数

2. **会话管理**
   - 支持 `--new-session` 创建新会话
   - 支持 `--list` 列出所有会话
   - 支持 `--session=xxx` 切换会话
   - 默认恢复上次会话

3. **主循环**
   - 获取用户输入
   - 调用 AI 模型
   - 解析 AI 响应（JSON格式）
   - 如果是 exec 命令，执行并循环
   - 如果是 text 返回，输出并继续
   - 自动保存会话

4. **命令执行** (`executeToolCommand`)
   - 文件操作工具
   - 待办事项工具
   - 检测交互式命令
   - 检测长期运行进程
   - 普通 shell 命令

#### 3.2 ollama.ts - Ollama 本地模型模式

与 `index.ts` 功能几乎完全相同，区别在于：

- 使用本地 Ollama 模型（`ollama` 库）
- 默认模型：`qwen2.5:7b`
- 模型参数：`temperature: 0.2, top_p: 0.8, num_ctx: 4096`

---

## 代码依赖关系

### 依赖关系图

```
index.ts / ollama.ts (主入口)
    │
    ├──▶ session/session-manager.ts
    │       └── session/types.ts (类型定义)
    │
    ├──▶ tools/file.ts
    │
    ├──▶ tools/todo.ts
    │
    └──▶ tools/interactive.ts
            └── (依赖 node-pty, tree-kill)
```

### 模块间调用顺序

1. **启动时**：
   ```
   index.ts → SessionManager 初始化
            → 加载/创建会话
            → 加载技能文档
   ```

2. **处理用户请求时**：
   ```
   index.ts → AI模型调用
            → 解析响应
            → executeToolCommand
               ├── file.ts (文件操作)
               ├── todo.ts (待办事项)
               └── interactive.ts (交互式命令)
   ```

3. **会话保存时**：
   ```
   index.ts → autoSaveSession
            → SessionManager.updateCurrentSession
            → 写入 ~/.kontirolclaw/sessions/*.json
            → 更新 session-index.json
   ```

---

## 会话系统详解（重点）

### 什么是会话？

会话（Session）是 KontirolClaw 保存对话历史的方式。每次你和 AI 的对话都会被保存，下次启动时可以恢复，继续之前的对话。

### 会话的数据结构

```json
{
  "id": "session_1700000000000_abc123def",
  "title": "帮我写一个排序算法",
  "messages": [
    { "role": "system", "content": "你是 KontirolClaw..." },
    { "role": "user", "content": "帮我写一个排序算法" },
    { "role": "assistant", "content": "{\"exec\":\"code...\"}" },
    { "role": "user", "content": "命令执行结果..." },
    { "role": "assistant", "content": "{\"text\":\"好的...\"}" }
  ],
  "createdAt": 1700000000000,
  "updatedAt": 1700000100000,
  "tags": []
}
```

### 会话如何工作？

1. **启动时恢复**：
   - 读取 `~/.kontirolclaw/session-index.json`
   - 获取 `lastActiveSessionId`
   - 加载对应的会话文件
   - 将历史消息传递给 AI 模型

2. **对话过程中**：
   - 用户输入 → 添加到 messages
   - AI 响应 → 添加到 messages
   - 命令执行结果 → 添加到 messages
   - 每5次交互自动保存

3. **退出时**：
   - 最后一次保存会话
   - 更新 `updatedAt` 时间
   - 更新索引文件

### 如何使用会话功能？

```bash
# 启动（恢复上次会话或创建新会话）
npm run start

# 创建全新会话
npm run start:new

# 列出所有会话
npm run start:list

# 切换到指定会话
npm run start:session=session_xxx
```

### 会话文件位置

- **Windows**: `C:\Users\用户名\.kontirolclaw\`
- **Mac/Linux**: `~/.kontirolclaw/`

包含文件：
- `session-index.json` - 索引文件
- `sessions/` 目录 - 各会话数据文件

---

## AI 响应格式

KontirolClaw 要求 AI 返回特定格式的 JSON：

### 两种响应类型

1. **执行命令** (`exec`)：
   ```json
   {"exec": "dir"}
   {"exec": "readFile(\"test.txt\")"}
   {"exec": "createTodoList([...])"}
   ```

2. **文本回复** (`text`)：
   ```json
   {"text": "好的，我已经完成了..."}
   ```

### 执行循环

当 AI 返回 `exec` 时：
1. 系统执行命令
2. 将执行结果返回给 AI
3. AI 根据结果判断是否继续执行
4. 循环直到 AI 返回 `text`

---

## 技能（Skills）系统

### 什么是技能？

技能是扩展 KontirolClaw 功能的方式，每个技能是一个目录，包含：
- `index.js` - 技能实现代码
- `SKILL.md` - 技能说明文档

### 内置工具（无需技能）

AI 可以直接调用这些工具：
- 文件操作：readFile, createFile, editFile, deleteFile, readDir
- 待办事项：createTodoList, updateTodoStatus, getTodos, addTodo, deleteTodo

---

## 总结

KontirolClaw 的核心架构：

1. **双入口**：index.ts (API) 和 ollama.ts (本地)
2. **会话管理**：自动保存/恢复对话历史
3. **工具系统**：文件操作、待办事项、交互式命令
4. **AI 交互**：通过 JSON 格式控制命令执行
5. **插件扩展**：通过 skills 目录添加新功能

整个系统设计简洁模块化，易于扩展和维护。