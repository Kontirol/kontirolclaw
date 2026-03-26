import fs from 'fs';
import path from 'path';
import os from 'os';

// 内联类型定义，避免ESM模块解析问题
interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface Session {
  id: string;
  title: string;
  messages: SessionMessage[];
  createdAt: number;
  updatedAt: number;
  tags: string[];
}

interface SessionIndex {
  sessions: SessionMeta[];
  lastActiveSessionId: string | null;
}

interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  tags: string[];
}

export class SessionManager {
  private sessionsDir: string;
  private indexFile: string;
  private currentSession: Session | null = null;

  constructor() {
    // 确定存储目录：用户主目录下的 .kontirolclaw/sessions
    const homeDir = os.homedir();
    this.sessionsDir = path.join(homeDir, '.kontirolclaw', 'sessions');
    this.indexFile = path.join(homeDir, '.kontirolclaw', 'session-index.json');
    
    // 确保目录存在
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  // 生成唯一的会话ID
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 从消息生成会话标题
  private generateTitleFromMessages(messages: SessionMessage[]): string {
    if (messages.length === 0) {
      return '新会话';
    }
    // 查找第一条用户消息
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      const content = firstUserMessage.content.trim();
      // 取前30个字符作为标题
      return content.length > 30 ? content.substring(0, 30) + '...' : content;
    }
    return '新会话';
  }

  // 创建新会话
  createSession(initialMessages: SessionMessage[] = []): Session {
    const id = this.generateSessionId();
    const title = this.generateTitleFromMessages(initialMessages);
    const now = Date.now();
    const session: Session = {
      id,
      title,
      messages: initialMessages,
      createdAt: now,
      updatedAt: now,
      tags: []
    };
    
    this.currentSession = session;
    this.saveSession(session);
    this.updateIndex(session);
    
    return session;
  }

  // 保存会话到文件
  saveSession(session: Session): void {
    const sessionFile = path.join(this.sessionsDir, `${session.id}.json`);
    fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2), 'utf8');
  }

  // 更新索引
  private updateIndex(session: Session): void {
    let index: SessionIndex;
    if (fs.existsSync(this.indexFile)) {
      const data = fs.readFileSync(this.indexFile, 'utf8');
      index = JSON.parse(data);
    } else {
      index = { sessions: [], lastActiveSessionId: null };
    }
    
    // 检查是否已存在该会话的索引
    const existingIndex = index.sessions.findIndex(s => s.id === session.id);
    const sessionMeta: SessionMeta = {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.length,
      tags: session.tags
    };
    
    if (existingIndex >= 0) {
      index.sessions[existingIndex] = sessionMeta;
    } else {
      index.sessions.push(sessionMeta);
    }
    
    // 更新最后活跃会话ID
    index.lastActiveSessionId = session.id;
    
    // 按更新时间倒序排序
    index.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    
    fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2), 'utf8');
  }

  // 加载会话
  loadSession(sessionId: string): Session | null {
    const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
    if (!fs.existsSync(sessionFile)) {
      return null;
    }
    const data = fs.readFileSync(sessionFile, 'utf8');
    const session = JSON.parse(data);
    this.currentSession = session;
    
    // 更新索引中的最后活跃会话
    this.updateLastActiveInIndex(sessionId);
    
    return session;
  }

  // 更新索引中的最后活跃会话
  private updateLastActiveInIndex(sessionId: string): void {
    if (!fs.existsSync(this.indexFile)) {
      return;
    }
    const data = fs.readFileSync(this.indexFile, 'utf8');
    const index = JSON.parse(data);
    index.lastActiveSessionId = sessionId;
    fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2), 'utf8');
  }

  // 获取最后活跃的会话
  getLastActiveSession(): Session | null {
    if (!fs.existsSync(this.indexFile)) {
      return null;
    }
    const data = fs.readFileSync(this.indexFile, 'utf8');
    const index = JSON.parse(data);
    if (!index.lastActiveSessionId) {
      return null;
    }
    return this.loadSession(index.lastActiveSessionId);
  }

  // 获取所有会话的元数据
  getAllSessions(): SessionMeta[] {
    if (!fs.existsSync(this.indexFile)) {
      return [];
    }
    const data = fs.readFileSync(this.indexFile, 'utf8');
    const index = JSON.parse(data);
    return index.sessions;
  }

  // 删除会话
  deleteSession(sessionId: string): void {
    // 删除会话文件
    const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
    if (fs.existsSync(sessionFile)) {
      fs.unlinkSync(sessionFile);
    }
    
    // 从索引中移除
    if (fs.existsSync(this.indexFile)) {
      const data = fs.readFileSync(this.indexFile, 'utf8');
      const index = JSON.parse(data);
      index.sessions = index.sessions.filter((s: SessionMeta) => s.id !== sessionId);
      // 如果删除的是最后活跃会话，则清空最后活跃会话ID
      if (index.lastActiveSessionId === sessionId) {
        index.lastActiveSessionId = null;
      }
      fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2), 'utf8');
    }
  }

  // 更新当前会话（添加消息等）
  updateCurrentSession(messages: SessionMessage[]): void {
    if (!this.currentSession) {
      return;
    }
    
    this.currentSession.messages = messages;
    this.currentSession.updatedAt = Date.now();
    // 如果消息数量变化，可能需要更新标题
    if (messages.length > 0 && this.currentSession.title === '新会话') {
      this.currentSession.title = this.generateTitleFromMessages(messages);
    }
    
    this.saveSession(this.currentSession);
    this.updateIndex(this.currentSession);
  }

  // 获取当前会话
  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  // 设置当前会话（用于切换）
  setCurrentSession(session: Session): void {
    this.currentSession = session;
    this.updateLastActiveInIndex(session.id);
  }

  // 为会话添加标签
  addTag(sessionId: string, tag: string): void {
    const session = this.loadSession(sessionId);
    if (session && !session.tags.includes(tag)) {
      session.tags.push(tag);
      this.saveSession(session);
      this.updateIndex(session);
    }
  }

  // 移除会话标签
  removeTag(sessionId: string, tag: string): void {
    const session = this.loadSession(sessionId);
    if (session) {
      session.tags = session.tags.filter(t => t !== tag);
      this.saveSession(session);
      this.updateIndex(session);
    }
  }

  // 根据标签获取会话
  getSessionsByTag(tag: string): SessionMeta[] {
    const allSessions = this.getAllSessions();
    return allSessions.filter(s => s.tags.includes(tag));
  }

  // 搜索会话（按标题）
  searchSessions(keyword: string): SessionMeta[] {
    const allSessions = this.getAllSessions();
    return allSessions.filter(s => s.title.toLowerCase().includes(keyword.toLowerCase()));
  }
}