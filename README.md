# KontirolClaw

<div align="center">

[![License: ISC](https://img.shields.io/badge/License-ISC-green.svg)](https://opensource.org/licenses/ISC)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-blue.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6.svg)](https://www.typescriptlang.org/)

*English | [中文](#中文)*

A powerful AI-powered CLI agent that executes commands through natural language interaction.

</div>

---

## ✨ Features | 特性

| English | 中文 |
|---------|------|
| **Natural Language to Command** - Describe what you want in plain English, and KontirolClaw executes it | **自然语言转命令** - 用自然语言描述需求，KontirolClaw自动执行 |
| **Dual Backend Support** - Works with OpenAI API (Moonshot) or local Ollama models | **双后端支持** - 支持OpenAI API (Moonshot) 或本地Ollama模型 |
| **Plugin System** - Extensible skill architecture for custom capabilities | **插件系统** - 可扩展的技能架构，按需扩展功能 |
| **Interactive REPL** - Continuous conversation loop with command history | **交互式REPL** - 持续对话循环，保留命令历史 |
| **Multi-Model Support** - Switch between different AI models easily | **多模型支持** - 轻松切换不同的AI模型 |

---

## 🚀 Quick Start | 快速开始

### Prerequisites | 环境要求

- Node.js >= 18
- npm or yarn

### Installation | 安装

```bash
# Clone the repository | 克隆仓库
git clone https://github.com/your-username/KontirolClaw.git
cd KontirolClaw

# Install dependencies | 安装依赖
npm install
```

### Configuration | 配置

Create a `.env` file based on your backend choice:

根据你的后端选择，创建 `.env` 文件：

#### Option 1: OpenAI API (Moonshot) | 方式一：OpenAI API (Moonshot)

```env
OPENAI—API_KEY=your-api-key
OPENAI_BASE_URL=https://api.moonshot.cn/v1
```

#### Option 2: Local Ollama | 方式二：本地Ollama

```bash
# Install Ollama first | 先安装Ollama
# https://ollama.ai
```

No additional configuration needed for Ollama.
Ollama无需额外配置。

---

## 📖 Usage | 使用方法

### OpenAI/Moonshot Mode | OpenAI/Moonshot 模式

```bash
npm run start
```

### Ollama Mode | Ollama 模式

```bash
npm run ollama
```

### Example Session | 示例会话

```
请输入您的问题(输入 "exit" 退出)：列出当前目录下的所有文件
执行命令：dir
AI回复：...

-----------------------------
请输入您的问题(输入 "exit" 退出)：创建一个名为 test.txt 的文件
执行命令：echo. > test.txt
AI回复：文件已创建

-----------------------------
```

---

## 🔌 Plugin System | 插件系统

KontirolClaw uses a flexible skill/plugin architecture. Add custom capabilities by creating directories in `skills/`.

KontirolClaw使用灵活的技能/插件架构。在 `skills/` 目录下创建目录即可添加自定义功能。

### Creating a Skill | 创建技能

```
skills/
└── your_skill/
    ├── index.js      # Skill implementation | 技能实现
    └── README.md     # Skill documentation | 技能文档
```

### Example: Weather Skill | 示例：天气技能

```markdown
### Skill Name: get_weather
- Function: Get current weather for a city
- Parameters: {city: "city name, e.g. Beijing"}
- Returns: {"temperature": "22"}
```

---

## 🛠️ Architecture | 架构

```
KontirolClaw/
├── src/
│   ├── index.ts      # OpenAI API entry point | OpenAI API入口
│   └── ollama.ts     # Ollama entry point | Ollama入口
├── skills/           # Plugin directory | 插件目录
├── .env              # Environment configuration | 环境配置
└── package.json      # Project metadata | 项目元数据
```

### Core Flow | 核心流程

```
User Input → AI Model → Intent Recognition → Command Execution → Result → AI Response → User
用户输入 → AI模型 → 意图识别 → 命令执行 → 结果 → AI回复 → 用户
```

---

## 🤝 Contributing | 贡献指南

We warmly welcome contributions from developers worldwide! Whether you're a seasoned pro or just getting started, there's a place for you in KontirolClaw.

我们热忱欢迎全球开发者的参与！无论你是资深大佬还是初学者，KontirolClaw都有你的位置。

### How to Contribute | 如何贡献

| English | 中文 |
|---------|------|
| 1. **Fork** this repository | 1. **Fork** 本项目 |
| 2. **Create** your feature branch: `git checkout -b feature/awesome-feature` | 2. **创建**功能分支：`git checkout -b feature/你的功能` |
| 3. **Commit** your changes: `git commit -m 'Add some awesome feature'` | 3. **提交**修改：`git commit -m '添加很棒的功能'` |
| 4. **Push** to the branch: `git push origin feature/awesome-feature` | 4. **推送**到分支：`git push origin feature/你的功能` |
| 5. **Open** a Pull Request and wait for review 🎉 | 5. **打开** Pull Request 并等待审核 🎉 |

### Ways to Contribute | 贡献方式

| English | 中文 | Priority |
|--------|------|----------|
| 🐛 Report bugs and issues | 报告bug和问题 | 🔴 High |
| 💡 Suggest new features | 提出新功能建议 | 🟡 Medium |
| 🧩 Develop new plugins/skills | 开发新插件/技能 | 🔴 High |
| 📝 Improve documentation | 改进文档 | 🟡 Medium |
| 🔧 Fix bugs and optimize code | 修复bug和优化代码 | 🔴 High |
| 🧪 Add tests | 添加测试 | 🟡 Medium |
| 🌐 Translate documentation | 翻译文档 | 🟢 Low |

### What We Need Most | 我们最需要什么

```
🔥 Hot Issues:
  - Better error handling and retry mechanisms
  - Configuration file support (not just .env)
  - Comprehensive test coverage
  - More plugin examples (file operations, git, etc.)
  - Windows/Mac/Linux cross-platform optimization
  - AI model response streaming
```

```
🔥 热门议题：
  - 更好的错误处理和重试机制
  - 配置文件支持（不仅仅是.env）
  - 全面的测试覆盖
  - 更多插件示例（文件操作、git等）
  - Windows/Mac/Linux 跨平台优化
  - AI模型响应流式输出
```

### Code Style | 代码风格

- Use **TypeScript** for new code | 新代码请使用 **TypeScript**
- Follow existing code patterns | 遵循现有代码风格
- Add comments for complex logic | 复杂逻辑请添加注释
- Run `npm run lint` before submitting | 提交前请运行 `npm run lint`

### Discussion | 讨论交流

- 💬 Open an Issue for bugs/features | 对于bug/功能请开Issue
- 🐦 Follow us on X/Twitter | 在X/Twitter上关注我们
- 📧 Contact: kontirolclaw@example.com | 邮箱联系：kontirolclaw@example.com

**Every contribution matters! Thank you for making KontirolClaw better.**

**每一次贡献都很重要！感谢你让KontirolClaw变得更好。**

---

## 📄 License | 许可证

This project is licensed under the ISC License.

本项目基于ISC许可证开源。

---

## 🙏 Acknowledgments | 致谢

- [Moonshot AI](https://www.moonshot.cn/) - Kimi Model | Kimi模型
- [Ollama](https://ollama.ai/) - Local AI Models | 本地AI模型
- [OpenAI](https://openai.com/) - API Design Inspiration | API设计参考

---

<div align="center">

**Star us on GitHub | 在GitHub上给我们加星**

</div>

---

## 中文

# KontirolClaw

<div align="center">

一个强大的AI驱动的CLI代理，通过自然语言交互执行命令。

</div>

### 核心特性

- 🌐 **自然语言交互** - 用日常语言描述需求，AI自动转换为命令执行
- 🔄 **双后端支持** - 兼容OpenAI API (Moonshot) 和本地Ollama
- 🧩 **插件系统** - 简单的目录结构即可扩展AI能力
- 💬 **持续对话** - 保留上下文的多轮对话体验
- ⚡ **轻量高效** - 基于Node.js，随时可用

### 开始使用

```bash
# 克隆项目
git clone https://github.com/your-username/KontirolClaw.git
cd KontirolClaw

# 安装依赖
npm install

# 配置环境变量
# 编辑 .env 文件

# 启动 (OpenAI/Moonshot模式)
npm run start

# 或启动 (Ollama模式)
npm run ollama
```

### 插件开发

在 `skills/` 目录下创建子目录即可添加新技能：

```
skills/
├── 你的技能/
│   ├── index.js      # 技能实现代码
│   └── README.md     # 技能说明文档
```

### 技术栈

- **Runtime**: Node.js
- **Language**: TypeScript
- **AI Providers**: OpenAI API, Ollama
- **Package Manager**: npm

### 许可证

ISC License - 开源免费，欢迎贡献！

---

Made with ❤️ by KontirolClaw Team
