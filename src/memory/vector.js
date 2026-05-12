// memory/vector.js - 轻量级 RAG 向量记忆（CommonJS 版本）
const fs = require('fs');
const path = require('path');
const os = require('os');

const CTRL_DIR = path.join(os.homedir(), '.ctrl');
const VECTOR_FILE = path.join(CTRL_DIR, 'vectors.json');

function ensureDir() {
  if (!fs.existsSync(CTRL_DIR)) {
    fs.mkdirSync(CTRL_DIR, { recursive: true });
  }
}

function loadVectors() {
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

function addVector(summary, keywords = [], conversationSnippet = '') {
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

function searchVectors(query, topK = 5) {
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

function listVectors() {
  const all = loadVectors();
  if (all.length === 0) return '暂无记忆向量';
  return all.map(v => `[#${v.id}] ${v.summary} (访问:${v.accessCount}次)`).join('\n');
}

function summarizeAndStore(conversationText, keywords = []) {
  const summary = conversationText.length > 300
    ? conversationText.slice(0, 300) + '...'
    : conversationText;
  return addVector(summary, keywords, conversationText.slice(0, 500));
}

module.exports = {
  loadVectors, addVector, searchVectors, listVectors, summarizeAndStore
};
