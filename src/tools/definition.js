// tools/definition.js
export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取一个文件的内容",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "要读取的文件名（相对路径）" }
        },
        required: ["filename"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_file",
      description: "创建一个新文件，并写入内容。如果文件已存在则覆盖。",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "文件名（相对路径）" },
          content: { type: "string", description: "要写入的内容" }
        },
        required: ["filename", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "删除一个文件（不可恢复）",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "要删除的文件名（相对路径）" }
        },
        required: ["filename"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "修改一个**已存在**的文件，将整个文件内容替换为新内容。如果文件不存在，请使用 create_file",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "文件名（相对路径）" },
          content: { type: "string", description: "新的完整内容" }
        },
        required: ["filename", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_dir",
      description: "列出指定目录下的所有文件和子目录名称。不包含子目录内部的内容。",
      parameters: {
        type: "object",
        properties: {
          dirname: { type: "string", description: "要列出的目录名（相对路径），默认为当前目录" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "exec_command",
      description: "在当前工作目录下执行一条 PowerShell 或 cmd 命令。命令执行超时时间为 30 秒。",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "要执行的命令，例如 'dir' 或 'npm create vue@latest'"
          },
          shell: {
            type: "string",
            enum: ["cmd", "powershell"],
            description: "使用的 shell 类型，默认为 powershell"
          }
        },
        required: ["command"]
      }
    }
  }
];