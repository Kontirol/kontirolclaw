import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 自动获取项目根目录（安全沙箱目录）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const SAFE_ROOT = path.resolve(__dirname, '../'); // 项目根目录 = 安全范围

// ==============================
// 安全检查：禁止访问上级目录 / 系统盘
// ==============================
function validateSafePath(filePath: string): string {
  const resolved = path.resolve(SAFE_ROOT, filePath);
  if (!resolved.startsWith(SAFE_ROOT)) {
    throw new Error(`❌ 安全限制：禁止访问项目外的路径：${filePath}`);
  }
  return resolved;
}

// ==============================
// 工具1：读取文件内容
// ==============================
export async function readFile(filePath: string): Promise<string> {
  try {
    const safePath = validateSafePath(filePath);
    const content = await fs.readFile(safePath, 'utf8');
    return `✅ 已读取文件：${filePath}\n内容：\n${content}`;
  } catch (e: any) {
    return `❌ 读取文件失败：${e.message}`;
  }
}

// ==============================
// 工具2：创建文件（不存在则创建，已存在返回提示）
// ==============================
export async function createFile(filePath: string, content = ''): Promise<string> {
  try {
    const safePath = validateSafePath(filePath);
    if (fsSync.existsSync(safePath)) {
      return `⚠️ 文件已存在：${filePath}，请使用 editFile 修改`;
    }
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content, 'utf8');
    return `✅ 文件已创建：${filePath}`;
  } catch (e: any) {
    return `❌ 创建文件失败：${e.message}`;
  }
}

// ==============================
// 工具3：编辑/覆盖文件（强制写入）
// ==============================
export async function editFile(filePath: string, content: string): Promise<string> {
  try {
    const safePath = validateSafePath(filePath);
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content, 'utf8');
    return `✅ 文件已修改：${filePath}`;
  } catch (e: any) {
    return `❌ 编辑文件失败：${e.message}`;
  }
}

// ==============================
// 工具4：删除文件
// ==============================
export async function deleteFile(filePath: string): Promise<string> {
  try {
    const safePath = validateSafePath(filePath);
    await fs.unlink(safePath);
    return `✅ 文件已删除：${filePath}`;
  } catch (e: any) {
    return `❌ 删除文件失败：${e.message}`;
  }
}

// ==============================
// 工具5：读取目录（查看文件列表）
// ==============================
export async function readDir(dirPath = './'): Promise<string> {
  try {
    const safePath = validateSafePath(dirPath);
    const files = await fs.readdir(safePath, { withFileTypes: true });
    const list = files.map(f => `${f.isDirectory() ? '[文件夹]' : '[文件]'} ${f.name}`).join('\n');
    return `✅ 目录 ${dirPath} 内容：\n${list}`;
  } catch (e: any) {
    return `❌ 读取目录失败：${e.message}`;
  }
}