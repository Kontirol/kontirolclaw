/**
 * 会话消息类型定义
 * 用于描述会话中每条消息的结构
 */
export interface SessionMessage {
  /** 消息角色：user-用户、assistant-AI助手、system-系统 */
  role: 'user' | 'assistant' | 'system';
  /** 消息内容 */
  content: string;
}

/**
 * 会话数据类型定义
 * 存储完整的会话信息，包括所有消息和元数据
 */
export interface Session {
  /** 会话唯一标识符，由时间戳和随机字符串组成 */
  id: string;
  /** 会话标题，自动从第一条用户消息生成（截取前30个字符） */
  title: string;
  /** 会话中的所有消息数组，按时间顺序排列 */
  messages: SessionMessage[];
  /** 会话创建时间戳（毫秒） */
  createdAt: number;
  /** 会话最后更新时间戳（毫秒），每次消息更新时都会修改 */
  updatedAt: number;
  /** 会话标签数组，用于分类和检索（如：work, personal） */
  tags: string[];
}

/**
 * 会话索引数据类型定义
 * 用于管理和追踪所有会话的轻量级索引
 */
export interface SessionIndex {
  /** 所有会话的元数据列表 */
  sessions: SessionMeta[];
  /** 最后活跃的会话ID，用于快速恢复最近会话 */
  lastActiveSessionId: string | null;
}

/**
 * 会话元数据类型定义
 * 用于在列表中显示会话的基本信息，不包含完整消息内容
 */
export interface SessionMeta {
  /** 会话唯一标识符 */
  id: string;
  /** 会话标题 */
  title: string;
  /** 会话创建时间戳（毫秒） */
  createdAt: number;
  /** 会话最后更新时间戳（毫秒） */
  updatedAt: number;
  /** 会话中的消息数量 */
  messageCount: number;
  /** 会话标签数组 */
  tags: string[];
}