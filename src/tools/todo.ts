import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// todo.json 文件路径（存储在项目根目录）
const TODO_FILE = path.resolve(__dirname, '../../todo.json');

// 任务状态类型
type TodoStatus = 'pending' | 'in_progress' | 'completed';
type TodoPriority = 'high' | 'medium' | 'low';

// 任务数据结构
interface Todo {
  id: string;
  content: string;
  status: TodoStatus;
  priority: TodoPriority;
}

// ==============================
// 读取todo列表
// ==============================
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

// ==============================
// 写入todo列表
// ==============================
async function writeTodos(todos: Todo[]): Promise<void> {
  try {
    await fs.writeFile(TODO_FILE, JSON.stringify(todos, null, 2), 'utf8');
  } catch (e: any) {
    throw new Error(`写入todo文件失败: ${e.message}`);
  }
}

// ==============================
// 工具1：创建/更新整个todo列表
// ==============================
export async function createTodoList(todosJson: string): Promise<string> {
  try {
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

// ==============================
// 工具2：更新单个任务状态
// ==============================
export async function updateTodoStatus(id: string, status: TodoStatus): Promise<string> {
  try {
    const todos = await readTodos();
    const todo = todos.find(t => t.id === id);
    
    if (!todo) {
      return `❌ 未找到ID为 ${id} 的任务`;
    }
    
    const oldStatus = todo.status;
    todo.status = status;
    await writeTodos(todos);
    
    return `✅ 任务 "${todo.content}" 状态已更新: ${oldStatus} → ${status}`;
  } catch (e: any) {
    return `❌ 更新任务状态失败: ${e.message}`;
  }
}

// ==============================
// 工具3：获取当前todo列表
// ==============================
export async function getTodos(): Promise<string> {
  try {
    const todos = await readTodos();
    
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
    
    // 进行中的任务
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

// ==============================
// 工具4：添加单个任务
// ==============================
export async function addTodo(content: string, priority: TodoPriority = 'medium'): Promise<string> {
  try {
    const todos = await readTodos();
    
    // 生成简单ID（时间戳+随机数）
    const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    const newTodo: Todo = {
      id,
      content,
      status: 'pending',
      priority
    };
    
    todos.push(newTodo);
    await writeTodos(todos);
    
    return `✅ 已添加任务: "${content}" (ID: ${id})`;
  } catch (e: any) {
    return `❌ 添加任务失败: ${e.message}`;
  }
}

// ==============================
// 工具5：删除任务
// ==============================
export async function deleteTodo(id: string): Promise<string> {
  try {
    const todos = await readTodos();
    const index = todos.findIndex(t => t.id === id);
    
    if (index === -1) {
      return `❌ 未找到ID为 ${id} 的任务`;
    }
    
    const deleted = todos.splice(index, 1)[0];
    await writeTodos(todos);
    
    return `✅ 已删除任务: "${deleted.content}"`;
  } catch (e: any) {
    return `❌ 删除任务失败: ${e.message}`;
  }
}