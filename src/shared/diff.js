// src/shared/diff.js — 文件差异计算（CLI/GUI 共用）
// 轻量级 LCS diff 算法，无外部依赖

const CONTEXT_LINES = 3;
const MAX_LINES_PREVIEW = 200;

function computeEdits(oldLines, newLines) {
  const m = oldLines.length;
  const n = newLines.length;
  if (m === 0 && n === 0) return [];

  if (m * n > 100000) {
    return computeEditsFast(oldLines, newLines);
  }

  const dp = new Array(m + 1);
  for (let i = 0; i <= m; i++) {
    dp[i] = new Uint16Array(n + 1);
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const edits = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      edits.unshift({ type: 'same', oldLine: i, newLine: j, text: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.unshift({ type: 'add', oldLine: null, newLine: j, text: newLines[j - 1] });
      j--;
    } else {
      edits.unshift({ type: 'remove', oldLine: i, newLine: null, text: oldLines[i - 1] });
      i--;
    }
  }

  return edits;
}

function computeEditsFast(oldLines, newLines) {
  const edits = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < oldLines.length && i < newLines.length) {
      if (oldLines[i] === newLines[i]) {
        edits.push({ type: 'same', oldLine: i + 1, newLine: i + 1, text: oldLines[i] });
      } else {
        edits.push({ type: 'remove', oldLine: i + 1, newLine: null, text: oldLines[i] });
        edits.push({ type: 'add', oldLine: null, newLine: i + 1, text: newLines[i] });
      }
    } else if (i < oldLines.length) {
      edits.push({ type: 'remove', oldLine: i + 1, newLine: null, text: oldLines[i] });
    } else {
      edits.push({ type: 'add', oldLine: null, newLine: i + 1, text: newLines[i] });
    }
  }
  return edits;
}

function groupHunks(edits) {
  const hunks = [];
  let hunk = [];
  let sameCount = 0;

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];

    if (edit.type === 'same') {
      if (hunk.length > 0) {
        hunk.push(edit);
        sameCount++;
        if (sameCount >= CONTEXT_LINES * 2 && i < edits.length - 1 && edits[i + 1]?.type === 'same') {
          hunk = hunk.slice(0, -(CONTEXT_LINES));
          hunks.push({ ops: hunk });
          hunk = [];
          sameCount = 0;
        }
      }
    } else {
      if (hunk.length === 0) {
        let ctx = 0, idx = i - 1;
        while (ctx < CONTEXT_LINES && idx >= 0 && edits[idx].type === 'same') {
          hunk.unshift(edits[idx]);
          ctx++;
          idx--;
        }
      }
      hunk.push(edit);
      sameCount = 0;
    }
  }

  if (hunk.length > 0) {
    let idx = edits.indexOf(hunk[hunk.length - 1]) + 1;
    let added = 0;
    while (added < CONTEXT_LINES && idx < edits.length && edits[idx].type === 'same') {
      hunk.push(edits[idx]);
      added++;
      idx++;
    }
    hunks.push({ ops: hunk });
  }

  return hunks;
}

// ====== 公共 API ======

export function computeDiff(oldContent, newContent) {
  const oldLines = oldContent ? oldContent.split('\n') : [];
  const newLines = newContent ? newContent.split('\n') : [];
  const totalLines = oldLines.length + newLines.length;

  let hunks = [];
  if (totalLines <= MAX_LINES_PREVIEW) {
    const edits = computeEdits(oldLines, newLines);
    hunks = groupHunks(edits);
  }

  const added = newLines.length - oldLines.length;
  const removed = oldLines.length - newLines.length;

  return { hunks, added, removed, oldLines, newLines, truncated: totalLines > MAX_LINES_PREVIEW };
}

export function formatDiffText(action, filename, diff) {
  const { hunks, added, removed, oldLines, newLines, truncated } = diff;
  let out = '';

  if (action === 'delete') {
    out += `✕ Delete  ${filename}\n`;
    out += `  -${oldLines.length} lines\n`;
    const preview = oldLines.slice(0, 8);
    for (const line of preview) {
      out += `  - ${line}\n`;
    }
    if (oldLines.length > 8) out += `  ... 共 ${oldLines.length} 行\n`;
    return out;
  }

  if (action === 'create') {
    out += `+ Create  ${filename}\n`;
    out += `  +${newLines.length} lines\n`;
    for (const line of newLines) {
      out += `  + ${line}\n`;
    }
    return out;
  }

  out += `~ Update  ${filename}\n`;
  const parts = [];
  if (added > 0) parts.push(`+${added}`);
  if (removed > 0) parts.push(`-${removed}`);
  if (parts.length > 0) out += `  ${parts.join(' ')} lines\n`;

  if (truncated) {
    out += `  (文件较大，仅显示差异统计)\n`;
    return out;
  }

  for (const hunk of hunks) {
    for (const op of hunk.ops) {
      const prefix = op.type === 'add' ? '+ ' : op.type === 'remove' ? '- ' : '  ';
      out += `${prefix}${op.text}\n`;
    }
  }

  return out;
}

export function formatDiffHtml(action, filename, diff) {
  const { hunks, added, removed, oldLines, newLines, truncated } = diff;

  let html = `<div class="diff-block">`;
  html += `<div class="diff-header">`;

  if (action === 'delete') {
    html += `<span class="diff-symbol delete">✕</span> <span class="diff-action">Delete</span> <span class="diff-file">${escapeHtml(filename)}</span>`;
    html += ` <span class="diff-stat delete">-${oldLines.length}</span>`;
  } else if (action === 'create') {
    html += `<span class="diff-symbol create">+</span> <span class="diff-action">Create</span> <span class="diff-file">${escapeHtml(filename)}</span>`;
    html += ` <span class="diff-stat create">+${newLines.length}</span>`;
  } else {
    html += `<span class="diff-symbol update">~</span> <span class="diff-action">Update</span> <span class="diff-file">${escapeHtml(filename)}</span>`;
    if (added > 0) html += ` <span class="diff-stat create">+${added}</span>`;
    if (removed > 0) html += ` <span class="diff-stat delete">-${removed}</span>`;
  }

  html += `</div>`;

  if (truncated) {
    html += `<div class="diff-truncated">文件较大，仅显示差异统计</div>`;
    html += `</div>`;
    return html;
  }

  if (action === 'delete') {
    html += `<div class="diff-lines">`;
    const preview = oldLines.slice(0, 8);
    for (const line of preview) {
      html += `<div class="diff-line delete"><span class="diff-prefix">-</span>${escapeHtml(line)}</div>`;
    }
    if (oldLines.length > 8) html += `<div class="diff-more">... 共 ${oldLines.length} 行</div>`;
    html += `</div>`;
  } else if (action === 'create') {
    html += `<div class="diff-lines">`;
    for (const line of newLines) {
      html += `<div class="diff-line add"><span class="diff-prefix">+</span>${escapeHtml(line)}</div>`;
    }
    html += `</div>`;
  } else if (hunks.length > 0) {
    html += `<div class="diff-lines">`;
    for (const hunk of hunks) {
      for (const op of hunk.ops) {
        const cls = op.type === 'add' ? 'add' : op.type === 'remove' ? 'remove' : 'same';
        const prefix = op.type === 'add' ? '+' : op.type === 'remove' ? '-' : ' ';
        html += `<div class="diff-line ${cls}"><span class="diff-prefix">${prefix}</span>${escapeHtml(op.text) || '&nbsp;'}</div>`;
      }
    }
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
