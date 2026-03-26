export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Session {
  id: string;
  title: string;       // 自动生成（第一条消息摘要）
  messages: SessionMessage[];
  createdAt: number;   // 创建时间戳
  updatedAt: number;   // 最后更新时间戳
  tags: string[];      // 标签（如：work, personal）
}

export interface SessionIndex {
  sessions: SessionMeta[];
  lastActiveSessionId: string | null;
}

export interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  tags: string[];
}