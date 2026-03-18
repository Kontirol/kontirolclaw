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

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) first.

欢迎贡献！请先阅读我们的 [贡献指南](CONTRIBUTING.md)。

### Ways to Contribute | 贡献方式

- 🐛 Report bugs | 报告bug
- 💡 Submit feature requests | 提交功能建议
- 📝 Improve documentation | 改进文档
- 🔧 Submit pull requests | 提交拉取请求

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
