// memory/vector.js - 轻量级 RAG 向量记忆
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CTRL_DIR = path.join(os.homedir(), '.ctrl');
const VECTOR_FILE = path.join(CTRL_DIR, 'vectors.json');

function ensureDir() {
  if (!fs.existsSync(CTRL_DIR)) {
    fs.mkdirSync(CTRL_DIR, { recursive: true });
  }
}

export function loadVectors() {
  ensureDir();
  try {
    if (fs.existsSync(VECTOR_FILE)) {
      return JSON.parse(fs.readFileSync(VECTOR_FILE, 'utf-8'));
    }
  } catch (err) {
    console.warn('⚠️ 加载向量记忆失败:', err.message);
  }
  return [];
}

function saveVectors(vectors) {
  ensureDir();
  fs.writeFileSync(VECTOR_FILE, JSON.stringify(vectors, null, 2), 'utf-8');
}

// 添加一个会话摘要向量
export function addVector(summary, keywords = [], conversationSnippet = '') {
  const vectors = loadVectors();
  const v = {
    id: Date.now(),
    summary,
    keywords: Array.isArray(keywords) ? keywords : [],
    conversationSnippet,
    createdAt: new Date().toISOString(),
    accessCount: 0,
    lastAccessed: null
  };
  vectors.push(v);
  if (vectors.length > 500) vectors.shift();
  saveVectors(vectors);
  return v;
}

// 搜索相关记忆
export function searchVectors(query, topK = 5) {
  const all = loadVectors();
  if (all.length === 0) return [];

  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 1);

  const scored = all.map(v => {
    let score = 0;
    const summaryLower = v.summary.toLowerCase();
    const keywordsLower = (v.keywords || []).map(k => k.toLowerCase());

    if (summaryLower.includes(queryLower)) score += 10;

    for (const word of queryWords) {
      if (summaryLower.includes(word)) score += 3;
      for (const kw of keywordsLower) {
        if (kw.includes(word) || word.includes(kw)) score += 5;
      }
    }

    if (v.accessCount > 0) score += Math.log(v.accessCount + 1);
    if (v.lastAccessed) {
      const daysAgo = (Date.now() - new Date(v.lastAccessed).getTime()) / (1000 * 60 * 60 * 24);
      if (daysAgo < 7) score += 2;
    }

    return { ...v, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const results = scored.filter(s => s.score > 0).slice(0, topK);

  // 更新访问记录
  if (results.length > 0) {
    const vectors = loadVectors();
    for (const r of results) {
      const original = vectors.find(v => v.id === r.id);
      if (original) {
        original.accessCount++;
        original.lastAccessed = new Date().toISOString();
      }
    }
    saveVectors(vectors);
  }

  return results;
}

// 获取上下文文本
export function getVectorContext(query) {
  const results = searchVectors(query, 3);
  if (results.length === 0) return '';
  return '\n=== 相关历史记忆 ===\n' +
    results.map((r, i) => `${i + 1}. ${r.summary}`).join('\n');
}

// 列出所有向量
export function listVectors() {
  const all = loadVectors();
  if (all.length === 0) return '暂无记忆向量';
  return all.map(v => `[#${v.id}] ${v.summary} (访问:${v.accessCount}次)`).join('\n');
}

// 删除向量
export function deleteVector(id) {
  const vectors = loadVectors();
  const idx = vectors.findIndex(v => v.id === id);
  if (idx === -1) return `未找到向量 #${id}`;
  const deleted = vectors.splice(idx, 1)[0];
  saveVectors(vectors);
  return `已删除记忆 #${id}: "${deleted.summary}"`;
}

// 由 AI 调用：压缩当前对话为摘要并存储
export function summarizeAndStore(conversationText, keywords = []) {
  const summary = conversationText.length > 300
    ? conversationText.slice(0, 300) + '...'
    : conversationText;
  return addVector(summary, keywords, conversationText.slice(0, 500));
}
