// ui/highlight.js
import { highlight } from 'cli-highlight';
const LANG_MAP = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.jsx': 'javascript',
  '.json': 'json',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.vue': 'html',
  '.py': 'python',
  '.rb': 'ruby',
  '.php': 'php',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.go': 'go',
  '.rs': 'rust',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.ps1': 'powershell',
  '.bat': 'bat',
  '.cmd': 'bat',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.md': 'markdown',
  '.sql': 'sql',
  '.xml': 'xml',
  '.svg': 'xml',
  '.dockerfile': 'dockerfile',
  'dockerfile': 'dockerfile',
};

function guessLanguage(filename) {
  if (!filename) return null;
  const lower = filename.toLowerCase();
  // 精确匹配
  if (LANG_MAP[lower]) return LANG_MAP[lower];
  // 扩展名匹配
  const ext = lower.match(/\.[a-z]+$/)?.[0];
  if (ext && LANG_MAP[ext]) return LANG_MAP[ext];
  // Dockerfile 特殊处理
  if (lower.includes('dockerfile')) return 'dockerfile';
  return null;
}

export function highlightCode(code, filename) {
  try {
    const lang = guessLanguage(filename);
    if (lang) {
      return highlight(code, { language: lang, ignoreIllegals: true });
    }
    // 自动检测
    return highlight(code, { languageGuessing: true, ignoreIllegals: true });
  } catch {
    // 高亮失败时返回原文
    return code;
  }
}
