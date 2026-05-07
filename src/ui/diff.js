// src/ui/diff.js - 文件变更差异显示
import chalk from 'chalk';

const CONTEXT_LINES = 3;
const MAX_DELETE_PREVIEW = 3; // delete 时只显示开头几行

function computeEdits(oldLines, newLines) {
  const m = oldLines.length;
  const n = newLines.length;

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

function groupHunks(edits, context) {
  const hunks = [];
  let hunk = [];
  let sameCount = 0;

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];

    if (edit.type === 'same') {
      if (hunk.length > 0) {
        hunk.push(edit);
        sameCount++;
        if (sameCount >= context * 2 && i < edits.length - 1 && edits[i + 1]?.type === 'same') {
          hunk = hunk.slice(0, -(context));
          hunks.push(hunk);
          hunk = [];
          sameCount = 0;
        }
      }
    } else {
      if (hunk.length === 0) {
        let ctx = 0, idx = i - 1;
        while (ctx < context && idx >= 0 && edits[idx].type === 'same') {
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
    while (added < context && idx < edits.length && edits[idx].type === 'same') {
      hunk.push(edits[idx]);
      added++;
      idx++;
    }
    hunks.push(hunk);
  }

  return hunks;
}

function padToWidth(text, width) {
  const plain = chalk.stripColor ? chalk.stripColor(text) : text;
  const pad = Math.max(0, width - plain.length);
  return text + ' '.repeat(pad);
}

export function printFileDiff(action, filename, oldContent, newContent) {
  const oldLines = oldContent ? oldContent.split('\n') : [];
  const newLines = newContent ? newContent.split('\n') : [];

  // 头部
  const actionLabel = action === 'create' ? 'Write' : action === 'delete' ? 'Delete' : 'Update';
  const actionColor = action === 'create' ? chalk.green : action === 'delete' ? chalk.red : chalk.hex('#87CEEB');
  const symbol = action === 'create' ? '+' : action === 'delete' ? '✕' : '~';
  console.log('');
  console.log(`  ${actionColor(symbol + ' ' + actionLabel)} ${chalk.dim(filename)}`);

  // 统计
  const addedN = newLines.length - oldLines.length;
  const removedN = oldLines.length - newLines.length;
  const parts = [];
  if (addedN > 0) parts.push(chalk.green(`+${addedN}`));
  if (removedN > 0) parts.push(chalk.red(`-${removedN}`));
  if (parts.length > 0) {
    console.log(`  ${chalk.dim('⎿')}  ${parts.join(' ')} lines`);
  }
  console.log('');

  if (oldLines.length === 0 && newLines.length === 0) return;

  const numWidth = String(Math.max(oldLines.length, newLines.length)).length;
  const termWidth = Math.min(process.stdout.columns || 100, 100);
  const prefixWidth = numWidth + 3; // "  -  " or "  +  " or "     "

  // delete 文件：只显示前几行预览
  if (action === 'delete') {
    const preview = oldLines.slice(0, MAX_DELETE_PREVIEW);
    for (let i = 0; i < preview.length; i++) {
      const num = String(i + 1).padStart(numWidth);
      const line = `${num}  ${preview[i]}`;
      console.log(`  ${chalk.bgRed.white(padToWidth(`- ${line}`, termWidth - 2))}`);
    }
    if (oldLines.length > MAX_DELETE_PREVIEW) {
      console.log(chalk.dim(`  ... 共 ${oldLines.length} 行`));
    }
    console.log('');
    return;
  }

  // create 文件：全部绿色背景显示
  if (action === 'create') {
    for (let i = 0; i < newLines.length; i++) {
      const num = String(i + 1).padStart(numWidth);
      const line = `${num}  ${newLines[i]}`;
      console.log(`  ${chalk.bgGreen.white(padToWidth(`+ ${line}`, termWidth - 2))}`);
    }
    console.log('');
    return;
  }

  // edit 文件：只显示改动的 hunks
  const edits = computeEdits(oldLines, newLines);
  const hunks = groupHunks(edits, CONTEXT_LINES);

  for (const hunk of hunks) {
    for (const op of hunk) {
      const lineNum = (op.oldLine || op.newLine || 0).toString().padStart(numWidth);
      const line = `${lineNum}  ${op.text}`;
      if (op.type === 'remove') {
        console.log(`  ${chalk.bgRed.white(padToWidth(`- ${line}`, termWidth - 2))}`);
      } else if (op.type === 'add') {
        console.log(`  ${chalk.bgGreen.black(padToWidth(`+ ${line}`, termWidth - 2))}`);
      } else {
        console.log(chalk.dim(`    ${line}`));
      }
    }
  }

  console.log('');
}
