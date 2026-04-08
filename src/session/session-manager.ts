/**
 * 会话管理器核心模块
 * 负责会话的创建、存储、加载、更新和删除等全部生命周期管理
 * 数据存储位置：用户主目录下的 ~/.kontirolclaw/ 目录
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// =============================================================
// 内联类型定义（避免ESM模块解析问题）
// 这些类型与 types.ts 中定义的一致
// =============================================================

/**
 * 会话消息结构
 * @description 每条消息包含角色和内容，用于记录对话历史
 */
interface SessionMessage {
  /** 消息发送者角色：user-用户输入、assistant-AI回复、system-系统消息 */
  role: 'user' | 'assistant' | 'system';
  /** 消息的实际文本内容 */
  content: string;
}

/**
 * 完整会话数据结构
 * @description 包含会话的所有信息，包括ID、标题、消息历史、时间戳和标签
 */
interface Session {
  /** 会话唯一标识符，格式：session_${时间戳}_${随机字符串} */
  id: string;
  /** 会话标题，通常自动从第一条用户消息生成 */
  title: string;
  /** 会话中所有消息的数组，按时间顺序排列 */
  messages: SessionMessage[];
  /** 会话创建时间，毫秒级时间戳 */
  createdAt: number;
  /** 会话最后更新时间，毫秒级时间戳，每次消息更新都会修改 */
  updatedAt: number;
  /** 会话标签数组，用于分类管理，如 ['work', 'important'] */
  tags: string[];
}

/**
 * 会话索引结构
 * @description 轻量级的会话列表，用于快速查找和管理所有会话
 */
interface SessionIndex {
  /** 所有会话的元数据列表 */
  sessions: SessionMeta[];
  /** 最后活跃的会话ID，用于会话恢复和快速访问 */
  lastActiveSessionId: string | null;
}

/**
 * 会话元数据结构
 * @description 不包含完整消息内容，仅包含用于列表展示的基本信息
 */
interface SessionMeta {
  /** 会话唯一标识符 */
  id: string;
  /** 会话标题 */
  title: string;
  /** 会话创建时间 */
  createdAt: number;
  /** 会话最后更新时间 */
  updatedAt: number;
  /** 消息数量 */
  messageCount: number;
  /** 标签数组 */
  tags: string[];
}

/**
 * 会话管理器类
 * @description 核心会话管理模块，提供完整的会话生命周期管理功能
 * 
 * 存储结构：
 * - ~/.kontirolclaw/session-index.json - 会话索引文件（所有会话的元数据列表）
 * - ~/.kontirolclaw/sessions/*.json - 每个会话的完整数据文件
 */
export class SessionManager {
  /** 会话文件存储目录 */
  private sessionsDir: string;
  /** 索引文件路径 */
  private indexFile: string;
  /** 当前活跃的会话对象（内存中） */
  private currentSession: Session | null = null;

  /**
   * 构造函数
   * @description 初始化会话管理器，确定存储路径并创建必要的目录
   * 存储位置：用户主目录下的 .kontirolclaw/sessions
   */
  constructor() {
    // 获取当前用户的主目录
    const homeDir = os.homedir();
    // 设置会话存储目录：~/.kontirolclaw/sessions
    this.sessionsDir = path.join(homeDir, '.ctrl', 'sessions');
    // 设置索引文件路径：~/.kontirolclaw/session-index.json
    this.indexFile = path.join(homeDir, '.ctrl', 'session-index.json');
    
    // 确保会话目录存在，如果不存在则递归创建
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /**
   * 生成唯一的会话ID
   * @private
   * @description 使用时间戳+随机字符串生成唯一ID，确保不会重复
   * @returns 格式：session_${时间戳}_${9位随机字符}
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 从消息生成会话标题
   * @private
   * @description 自动提取第一条用户消息的前30个字符作为会话标题
   * 如果没有用户消息，则返回默认标题"新会话"
   * @param messages - 会话消息数组
   * @returns 生成的标题字符串
   */
  private generateTitleFromMessages(messages: SessionMessage[]): string {
    // 空消息数组返回默认标题
    if (messages.length === 0) {
      return '新会话';
    }
    // 查找第一条用户角色（user）的消息
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      const content = firstUserMessage.content.trim();
      // 截取前30个字符，超过则加省略号
      return content.length > 30 ? content.substring(0, 30) + '...' : content;
    }
    return '新会话';
  }

  /**
   * 创建新会话
   * @description 创建全新的会话，会自动生成ID和标题，并保存到文件系统
   * @param initialMessages - 可选的初始消息数组，通常包含系统消息
   * @returns 创建的会话对象
   */
  createSession(initialMessages: SessionMessage[] = []): Session {
    // 生成唯一会话ID
    const id = this.generateSessionId();
    // 从初始消息生成标题
    const title = this.generateTitleFromMessages(initialMessages);
    // 获取当前时间戳
    const now = Date.now();
    
    // 构建会话对象
    const session: Session = {
      id,
      title,
      messages: initialMessages,
      createdAt: now,
      updatedAt: now,
      tags: []
    };
    
    // 设置为当前会话并保存
    this.currentSession = session;
    this.saveSession(session);
    this.updateIndex(session);
    
    return session;
  }

  /**
   * 保存会话到文件
   * @private
   * @description 将完整的会话对象序列化为JSON写入文件
   * 文件名格式：{sessionId}.json
   * @param session - 要保存的会话对象
   */
  saveSession(session: Session): void {
    const sessionFile = path.join(this.sessionsDir, `${session.id}.json`);
    fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2), 'utf8');
  }

  /**
   * 更新会话索引
   * @private
   * @description 维护session-index.json文件，包含所有会话的元数据和最后活跃会话ID
   * 会自动按更新时间倒序排列会话
   * @param session - 要更新索引的会话
   */
  private updateIndex(session: Session): void {
    let index: SessionIndex;
    
    // 读取现有索引或创建新索引
    if (fs.existsSync(this.indexFile)) {
      const data = fs.readFileSync(this.indexFile, 'utf8');
      index = JSON.parse(data);
    } else {
      index = { sessions: [], lastActiveSessionId: null };
    }
    
    // 检查是否已存在该会话的索引
    const existingIndex = index.sessions.findIndex(s => s.id === session.id);
    
    // 构建会话元数据
    const sessionMeta: SessionMeta = {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.length,
      tags: session.tags
    };
    
    // 更新或添加会话元数据
    if (existingIndex >= 0) {
      index.sessions[existingIndex] = sessionMeta;
    } else {
      index.sessions.push(sessionMeta);
    }
    
    // 更新最后活跃会话ID
    index.lastActiveSessionId = session.id;
    
    // 按更新时间倒序排序（最新的在前）
    index.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    
    // 写入索引文件
    fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2), 'utf8');
  }

  /**
   * 加载会话
   * @description 根据会话ID从文件读取完整会话数据
   * @param sessionId - 要加载的会话ID
   * @returns 加载的会话对象，如果不存在则返回null
   */
  loadSession(sessionId: string): Session | null {
    const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
    // 文件不存在返回null
    if (!fs.existsSync(sessionFile)) {
      return null;
    }
    // 读取并解析会话文件
    const data = fs.readFileSync(sessionFile, 'utf8');
    const session = JSON.parse(data);
    this.currentSession = session;
    
    // 更新索引中的最后活跃会话
    this.updateLastActiveInIndex(sessionId);
    
    return session;
  }

  /**
   * 更新索引中的最后活跃会话ID
   * @private
   * @description 专门用于更新lastActiveSessionId字段
   * @param sessionId - 要设为活跃的会话ID
   */
  private updateLastActiveInIndex(sessionId: string): void {
    if (!fs.existsSync(this.indexFile)) {
      return;
    }
    const data = fs.readFileSync(this.indexFile, 'utf8');
    const index = JSON.parse(data);
    index.lastActiveSessionId = sessionId;
    fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2), 'utf8');
  }

  /**
   * 获取最后活跃的会话
   * @description 从索引中读取lastActiveSessionId并加载对应会话
   * 用于应用启动时恢复最近使用的会话
   * @returns 最后活跃的会话对象，如果不存在则返回null
   */
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

  /**
   * 获取所有会话的元数据列表
   * @description 从索引中读取所有会话的概要信息，用于展示会话列表
   * @returns SessionMeta数组，包含所有会话的基本信息
   */
  getAllSessions(): SessionMeta[] {
    if (!fs.existsSync(this.indexFile)) {
      return [];
    }
    const data = fs.readFileSync(this.indexFile, 'utf8');
    const index = JSON.parse(data);
    return index.sessions;
  }

  /**
   * 删除会话
   * @description 从文件系统和索引中删除指定会话
   * 如果删除的是最后活跃会话，会同时清空lastActiveSessionId
   * @param sessionId - 要删除的会话ID
   */
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
      // 过滤掉要删除的会话
      index.sessions = index.sessions.filter((s: SessionMeta) => s.id !== sessionId);
      // 如果删除的是最后活跃会话，清空该字段
      if (index.lastActiveSessionId === sessionId) {
        index.lastActiveSessionId = null;
      }
      fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2), 'utf8');
    }
  }

  /**
   * 更新当前会话
   * @description 用于在对话过程中实时保存/更新会话内容
   * 会自动更新消息数组、最后更新时间，并根据需要更新标题
   * @param messages - 更新后的消息数组
   */
  updateCurrentSession(messages: SessionMessage[]): void {
    if (!this.currentSession) {
      return;
    }
    
    // 更新消息和最后时间
    this.currentSession.messages = messages;
    this.currentSession.updatedAt = Date.now();
    
    // 如果消息数量变化且标题还是默认的"新会话"，则重新生成标题
    if (messages.length > 0 && this.currentSession.title === '新会话') {
      this.currentSession.title = this.generateTitleFromMessages(messages);
    }
    
    // 保存到文件和更新索引
    this.saveSession(this.currentSession);
    this.updateIndex(this.currentSession);
  }

  /**
   * 获取当前会话
   * @description 返回内存中当前活跃的会话对象
   * @returns 当前会话对象，如果没有则为null
   */
  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  /**
   * 设置当前会话
   * @description 用于切换到另一个会话，会更新内存中的当前会话引用
   * @param session - 要切换到的会话对象
   */
  setCurrentSession(session: Session): void {
    this.currentSession = session;
    this.updateLastActiveInIndex(session.id);
  }

  /**
   * 为会话添加标签
   * @description 给指定会话添加一个标签，如果标签已存在则不重复添加
   * @param sessionId - 目标会话ID
   * @param tag - 要添加的标签
   */
  addTag(sessionId: string, tag: string): void {
    const session = this.loadSession(sessionId);
    // 加载会话并检查标签是否已存在
    if (session && !session.tags.includes(tag)) {
      session.tags.push(tag);
      this.saveSession(session);
      this.updateIndex(session);
    }
  }

  /**
   * 移除会话标签
   * @description 从指定会话中移除一个标签
   * @param sessionId - 目标会话ID
   * @param tag - 要移除的标签
   */
  removeTag(sessionId: string, tag: string): void {
    const session = this.loadSession(sessionId);
    if (session) {
      // 过滤掉要移除的标签
      session.tags = session.tags.filter(t => t !== tag);
      this.saveSession(session);
      this.updateIndex(session);
    }
  }

  /**
   * 根据标签获取会话
   * @description 筛选出包含指定标签的所有会话
   * @param tag - 要筛选的标签
   * @returns 符合条件的会话元数据数组
   */
  getSessionsByTag(tag: string): SessionMeta[] {
    const allSessions = this.getAllSessions();
    return allSessions.filter(s => s.tags.includes(tag));
  }

  /**
   * 搜索会话
   * @description 按标题关键词搜索会话（不区分大小写）
   * @param keyword - 搜索关键词
   * @returns 匹配的会话元数据数组
   */
  searchSessions(keyword: string): SessionMeta[] {
    const allSessions = this.getAllSessions();
    return allSessions.filter(s => s.title.toLowerCase().includes(keyword.toLowerCase()));
  }
}