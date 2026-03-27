/**
 * 待办事项（Todo）管理工具模块
 * 提供任务的创建、读取、更新、删除等完整功能
 * 数据持久化存储在项目根目录的 todo.json 文件中
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// todo.json 文件路径（存储在项目根目录）
const TODO_FILE = path.resolve(__dirname, '../../todo.json');

// =============================================================
// 类型定义
// =============================================================

/** 任务状态枚举 */
type TodoStatus = 'pending' | 'in_progress' | 'completed';

/** 任务优先级枚举 */
type TodoPriority = 'high' | 'medium' | 'low';

/**
 * 任务数据结构
 * @description 每个待办事项的完整信息
 */
interface Todo {
  /** 任务唯一标识符（自动生成） */
  id: string;
  /** 任务描述内容 */
  content: string;
  /** 任务状态：pending-待办、in_progress-进行中、completed-已完成 */
  status: TodoStatus;
  /** 任务优先级：high-高、medium-中、low-低 */
  priority: TodoPriority;
}

// =============================================================
// 私有函数：读取todo列表
// =============================================================

/**
 * 从文件读取所有待办事项
 * @private
 * @returns Todo对象数组，如果文件不存在则返回空数组
 */
async function readTodos(): Promise<Todo[]> {
  try {
    if (!fsSync.existsSync(TODO_FILE)) {
      return [];
    }
    const content = await fs.readFile(TODO_FILE, 'utf8');
    return JSON.parse(content) || [];
  } catch (e: any) {
    console.error(`读取todo文件失败: ${e.message}`);
    return [];
  }
}

// =============================================================
// 私有函数：写入todo列表
// =============================================================

/**
 * 将待办事项数组写入文件
 * @private
 * @param todos - 要保存的Todo数组
 * @throws 如果写入失败会抛出错误
 */
async function writeTodos(todos: Todo[]): Promise<void> {
  try {
    await fs.writeFile(TODO_FILE, JSON.stringify(todos, null, 2), 'utf8');
  } catch (e: any) {
    throw new Error(`写入todo文件失败: ${e.message}`);
  }
}

// =============================================================
// 工具1：创建/更新整个todo列表
// =============================================================

/**
 * 创建或完全覆盖整个待办事项列表
 * 用于AI代理批量创建任务列表
 * @param todosJson - JSON格式的任务数组字符串
 * @returns 操作结果的描述信息
 * 
 * @example
 * // 输入格式
 * createTodoList('[{"id":"1","content":"完成任务A","status":"pending","priority":"high"}]')
 */
export async function createTodoList(todosJson: string): Promise<string> {
  try {
    // 解析JSON字符串
    const todos: Todo[] = JSON.parse(todosJson);
    
    // 验证每个todo的必填字段
    for (const todo of todos) {
      if (!todo.id || !todo.content) {
        return `❌ 任务缺少必填字段（id或content）`;
      }
      // 设置默认值
      todo.status = todo.status || 'pending';
      todo.priority = todo.priority || 'medium';
    }
    
    // 写入文件
    await writeTodos(todos);
    
    // 统计各状态数量
    const stats = {
      pending: todos.filter(t => t.status === 'pending').length,
      in_progress: todos.filter(t => t.status === 'in_progress').length,
      completed: todos.filter(t => t.status === 'completed').length,
    };
    
    return `✅ 已创建todo列表，共 ${todos.length} 个任务\n` +
           `   待办: ${stats.pending} | 进行中: ${stats.in_progress} | 已完成: ${stats.completed}`;
  } catch (e: any) {
    return `❌ 创建todo列表失败: ${e.message}`;
  }
}

// =============================================================
// 工具2：更新单个任务状态
// =============================================================

/**
 * 更新指定任务的执行状态
 * @param id - 任务ID
 * @param status - 新状态（pending/in_progress/completed）
 * @returns 操作结果描述
 * 
 * @example
 * updateTodoStatus("1", "completed")
 */
export async function updateTodoStatus(id: string, status: TodoStatus): Promise<string> {
  try {
    // 读取现有任务
    const todos = await readTodos();
    const todo = todos.find(t => t.id === id);
    
    if (!todo) {
      return `❌ 未找到ID为 ${id} 的任务`;
    }
    
    // 记录旧状态用于显示
    const oldStatus = todo.status;
    // 更新状态
    todo.status = status;
    // 保存
    await writeTodos(todos);
    
    return `✅ 任务 "${todo.content}" 状态已更新: ${oldStatus} → ${status}`;
  } catch (e: any) {
    return `❌ 更新任务状态失败: ${e.message}`;
  }
}

// =============================================================
// 工具3：获取当前todo列表
// =============================================================

/**
 * 获取并格式化显示当前所有待办事项
 * 会按状态分组显示：进行中 → 待办 → 已完成
 * @returns 格式化的任务列表字符串
 */
export async function getTodos(): Promise<string> {
  try {
    const todos = await readTodos();
    
    // 无任务时返回提示
    if (todos.length === 0) {
      return '📋 当前没有待办任务';
    }
    
    // 按状态分组
    const grouped = {
      in_progress: todos.filter(t => t.status === 'in_progress'),
      pending: todos.filter(t => t.status === 'pending'),
      completed: todos.filter(t => t.status === 'completed'),
    };
    
    let result = '📋 当前任务列表:\n\n';
    
    // 进行中的任务（最优先显示）
    if (grouped.in_progress.length > 0) {
      result += '🔴 进行中:\n';
      grouped.in_progress.forEach(t => {
        result += `  - [${t.id}] ${t.content} (${t.priority})\n`;
      });
      result += '\n';
    }
    
    // 待办任务
    if (grouped.pending.length > 0) {
      result += '🟡 待办:\n';
      grouped.pending.forEach(t => {
        result += `  - [${t.id}] ${t.content} (${t.priority})\n`;
      });
      result += '\n';
    }
    
    // 已完成任务
    if (grouped.completed.length > 0) {
      result += '🟢 已完成:\n';
      grouped.completed.forEach(t => {
        result += `  - [${t.id}] ${t.content}\n`;
      });
    }
    
    // 统计信息
    const stats = {
      total: todos.length,
      completed: grouped.completed.length,
      progress: Math.round((grouped.completed.length / todos.length) * 100)
    };
    
    result += `\n📊 进度: ${stats.completed}/${stats.total} (${stats.progress}%)`;
    
    return result;
  } catch (e: any) {
    return `❌ 获取todo列表失败: ${e.message}`;
  }
}

// =============================================================
// 工具4：添加单个任务
// =============================================================

/**
 * 添加一个新的待办事项
 * 自动生成唯一ID（时间戳+随机数）
 * @param content - 任务描述内容（必填）
 * @param priority - 优先级，可选值：high/medium/low（默认medium）
 * @returns 操作结果描述，包含新生成的ID
 * 
 * @example
 * addTodo("完成代码注释", "high")
 */
export async function addTodo(content: string, priority: TodoPriority = 'medium'): Promise<string> {
  try {
    // 读取现有任务
    const todos = await readTodos();
    
    // 生成唯一ID（时间戳+5位随机字符）
    const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    // 创建新任务对象
    const newTodo: Todo = {
      id,
      content,
      status: 'pending',
      priority
    };
    
    // 添加到数组并保存
    todos.push(newTodo);
    await writeTodos(todos);
    
    return `✅ 已添加任务: "${content}" (ID: ${id})`;
  } catch (e: any) {
    return `❌ 添加任务失败: ${e.message}`;
  }
}

// =============================================================
// 工具5：删除任务
// =============================================================

/**
 * 删除指定的待办事项
 * @param id - 要删除的任务ID
 * @returns 操作结果描述
 * 
 * @example
 * deleteTodo("task_1234567890_abcde")
 */
export async function deleteTodo(id: string): Promise<string> {
  try {
    // 读取任务列表
    const todos = await readTodos();
    // 查找任务索引
    const index = todos.findIndex(t => t.id === id);
    
    // 未找到
    if (index === -1) {
      return `❌ 未找到ID为 ${id} 的任务`;
    }
    
    // 移除并保存
    const deleted = todos.splice(index, 1)[0];
    await writeTodos(todos);
    
    return `✅ 已删除任务: "${deleted.content}"`;
  } catch (e: any) {
    return `❌ 删除任务失败: ${e.message}`;
  }
}