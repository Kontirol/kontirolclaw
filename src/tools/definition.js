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
      description: "创建一个新文件，并写入完整内容。也可用于修改已有文件（传入完整新内容即可）。",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "文件名（相对路径）" },
          content: { type: "string", description: "文件的完整内容" }
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
      description: "在当前工作目录下执行一条 PowerShell 或 cmd 命令。默认超时 60 秒，最长 300 秒。",
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
          },
          timeout: {
            type: "number",
            description: "超时时间（秒），默认 60，最大 300"
          }
        },
        required: ["command"]
      }
    }
  },
  // ===== TODO 工具 =====
  {
    type: "function",
    function: {
      name: "todo_create",
      description: "添加一个新的待办任务（支持 status 字段追踪工作流阶段）",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "任务标题" },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "done", "failed"],
            description: "任务状态。pending=待执行, in_progress=正在执行, done=已完成, failed=失败需重试。默认 pending。"
          }
        },
        required: ["title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "todo_list",
      description: "列出当前所有的待办任务，按状态分组显示",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pending", "in_progress", "done", "failed"],
            description: "可选，按状态筛选。不填则显示全部。"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "todo_update",
      description: "更新一个已存在的待办任务（改标题、状态、完成标记等）",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "要更新的任务ID" },
          title: { type: "string", description: "新的标题（可选）" },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "done", "failed"],
            description: "新状态（可选）。执行前改为 in_progress，完成后改为 done，失败改为 failed。"
          },
          completed: { type: "boolean", description: "是否完成（可选，与 status 字段配合使用）" }
        },
        required: ["id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "todo_delete",
      description: "删除一个待办任务",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "要删除的任务ID" }
        },
        required: ["id"]
      }
    }
  },

  // ===== 记忆系统工具（第一~三层） =====
  {
    type: "function",
    function: {
      name: "memory_store",
      description: "存储一条长期记忆。当用户说「记住xxx」或你觉得某个信息值得记住时调用。",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "要记住的内容" },
          tags: { type: "array", items: { type: "string" }, description: "标签（可选），如 ['项目', '偏好']" }
        },
        required: ["content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "memory_search",
      description: "搜索长期记忆",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "搜索关键词" }
        },
        required: ["keyword"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "memory_list",
      description: "列出所有长期记忆",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "memory_delete",
      description: "删除一条长期记忆",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "记忆ID" }
        },
        required: ["id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "preference_set",
      description: "保存一个用户偏好（学到的习惯、喜好、常用设置等）",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "偏好名称" },
          value: { type: "string", description: "偏好值" }
        },
        required: ["key", "value"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "preference_list",
      description: "列出所有已学习的用户偏好",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "vector_store",
      description: "将一段对话总结存入向量记忆库，供未来检索。当对话涉及重要知识、决策或模式时调用。",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "对话摘要，简明扼要" },
          keywords: { type: "array", items: { type: "string" }, description: "关键词列表" }
        },
        required: ["summary"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "vector_search",
      description: "搜索向量记忆库，找到与当前查询相关的历史对话摘要",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索查询" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "vector_list",
      description: "列出所有向量记忆",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },

  // ===== 自我优化工具（第四层） =====
  {
    type: "function",
    function: {
      name: "self_propose_tool",
      description: "提出一个新的自定义工具（需要用户确认后才生效）。当你发现现有工具不够用，需要新能力时使用。",
      parameters: {
        type: "object",
        properties: {
          tool_name: { type: "string", description: "新工具名称" },
          description: { type: "string", description: "工具功能描述" },
          parameters: { type: "string", description: "工具参数的 JSON Schema（字符串格式）" }
        },
        required: ["tool_name", "description", "parameters"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "self_propose_prompt",
      description: "提出修改系统提示词/规则的提案（需要用户确认后才生效）。当你发现规则不够好，想优化自己行为时使用。",
      parameters: {
        type: "object",
        properties: {
          snippet: { type: "string", description: "要添加/修改的提示词片段" },
          reason: { type: "string", description: "修改理由" }
        },
        required: ["snippet", "reason"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "self_list_proposals",
      description: "列出所有待处理的自我优化提案",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "self_approve",
      description: "批准一个自我优化提案（仅用户手动调用）",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "提案ID" }
        },
        required: ["id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "self_reject",
      description: "拒绝一个自我优化提案（仅用户手动调用）",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "提案ID" }
        },
        required: ["id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "history_clear",
      description: "清空对话历史",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
];
