/**
 * 文件操作工具模块
 * 提供安全的文件读写、创建、删除和目录浏览功能
 * 注意：已禁用安全检查（validateSafePath），可访问任意路径
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前模块的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 项目根目录 = 安全范围根目录
export const SAFE_ROOT = path.resolve(__dirname, '../');

// =============================================================
// 安全检查函数（已禁用）
// 原本用于限制只能访问项目根目录内的文件
// 当前实现直接返回原路径，不做任何限制
// =============================================================
function validateSafePath(filePath: string): string {
  // const resolved = path.resolve(SAFE_ROOT, filePath);
  // if (!resolved.startsWith(SAFE_ROOT)) {
  //   throw new Error(`❌ 安全限制：禁止访问项目外的路径：${filePath}`);
  // }
  // return resolved;
  return filePath;
}

// =============================================================
// 工具1：读取文件内容
// =============================================================
/**
 * 读取指定文件的全部内容
 * @param filePath - 文件路径（支持相对路径和绝对路径）
 * @returns 成功返回文件内容，失败返回错误信息
 */
export async function readFile(filePath: string): Promise<string> {
  try {
    const safePath = validateSafePath(filePath);
    const content = await fs.readFile(safePath, 'utf8');
    const ext = path.extname(safePath).toLowerCase().slice(1);
    const language = ext || 'text';

    // 生成行号（自动宽度对齐）
    const lines = content.split('\n');
    const lineNumWidth = lines.length.toString().length;
    const numberedLines = lines
      .map((line, idx) => {
        const num = (idx + 1).toString().padStart(lineNumWidth, ' ');
        return `${num} │ ${line}`;
      })
      .join('\n');

    // 编辑器风格 + 行号 + 语言 + 状态
    return `
📄 文件：${filePath}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${numberedLines}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`语言：${language}    总行数：${lines.length}\`
✅ 读取完成
    `.trim();
  } catch (e: any) {
    return `
❌ 读取失败
文件：${filePath}
错误：${e.message}
    `.trim();
  }
}

// =============================================================
// 工具2：创建文件（不存在则创建，已存在返回提示）
// =============================================================
/**
 * 创建新文件，如果文件已存在则返回提示信息
 * @param filePath - 文件路径
 * @param content - 文件初始内容（默认空字符串）
 * @returns 成功或已存在的提示信息
 */
// =============================================================
// 工具2：创建新文件（不存在则创建，已存在则提示）
// =============================================================
export async function createFile(filePath: string, content = ''): Promise<string> {
  try {
    const safePath = validateSafePath(filePath);

    if (fsSync.existsSync(safePath)) {
      return `
⚠️ 文件已存在，无法创建
文件：${filePath}
提示：请使用 editFile 命令修改
      `.trim();
    }

    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content, 'utf8');

    const ext = path.extname(safePath).toLowerCase().slice(1);
    const language = ext || 'text';
    const lines = content.split('\n');
    const lineCount = lines.length;

    return `
✅ 文件创建成功
📄 ${filePath}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`${language}
${content || '(空文件)'}
\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
语言：${language} ｜ 总行数：${lineCount}
    `.trim();
  } catch (e: any) {
    return `
❌ 创建文件失败
文件：${filePath}
错误：${e.message}
    `.trim();
  }
}

// =============================================================
// 工具3：编辑/覆盖文件（强制写入）
// =============================================================
export async function editFile(filePath: string, content: string): Promise<string> {
  try {
    const safePath = validateSafePath(filePath);
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content, 'utf8');

    const ext = path.extname(safePath).toLowerCase().slice(1);
    const language = ext || 'text';
    const lines = content.split('\n');
    const lineCount = lines.length;

    return `
✅ 文件修改成功
📄 ${filePath}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`${language}
${content}
\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
语言：${language} ｜ 总行数：${lineCount}
    `.trim();
  } catch (e: any) {
    return `
❌ 编辑文件失败
文件：${filePath}
错误：${e.message}
    `.trim();
  }
}

// =============================================================
// 工具4：删除文件
// =============================================================
/**
 * 删除指定文件
 * @param filePath - 要删除的文件路径
 * @returns 成功或失败的提示信息
 */
export async function deleteFile(filePath: string): Promise<string> {
  try {
    const safePath = validateSafePath(filePath);
    await fs.unlink(safePath);
    return `✅ 文件已删除：${filePath}`;
  } catch (e: any) {
    return `❌ 删除文件失败：${e.message}`;
  }
}

// =============================================================
// 工具5：读取目录（查看文件列表）
// =============================================================
/**
 * 读取指定目录的内容，列出所有文件和子目录
 * @param dirPath - 目录路径（默认当前目录）
 * @returns 目录内容列表，失败返回错误信息
 */
export async function readDir(dirPath = './'): Promise<string> {
  try {
    const safePath = validateSafePath(dirPath);
    // 读取目录内容，包含文件类型信息
    const files = await fs.readdir(safePath, { withFileTypes: true });
    // 格式化输出：标记文件或文件夹
    const list = files.map(f => `${f.isDirectory() ? '[文件夹]' : '[文件]'} ${f.name}`).join('\n');
    return `✅ 目录 ${dirPath} 内容：\n${list}`;
  } catch (e: any) {
    return `❌ 读取目录失败：${e.message}`;
  }
}