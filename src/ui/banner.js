// src/ui/banner.js - CLI 美化组件
import chalk from 'chalk';

export function printBanner(config) {
  console.log('');
  console.log(`  ${chalk.hex('#FFB347')('⏺')} ${chalk.bold('Ctrl')}  ${chalk.dim('v1.0.0')}`);
  console.log(`  ${chalk.dim('模型')}  ${config.model}  ${chalk.dim('·')}  ${chalk.dim(config.baseURL)}`);
  console.log(chalk.dim('  ─────────────────────────────────────────────'));
  console.log(`  ${chalk.hex('#FFB347')(':new')} ${chalk.dim('|')} ${chalk.hex('#FFB347')(':switch')} ${chalk.dim('|')} ${chalk.hex('#FFB347')(':sessions')} ${chalk.dim('|')} ${chalk.hex('#FFB347')(':delete')} ${chalk.dim('|')} ${chalk.hex('#FFB347')(':help')}    ${chalk.dim('Esc')} 中断  ${chalk.dim('·')}  ${chalk.dim('exit')} 退出`);
  console.log('');
}

function formatToolAction(toolName, args) {
  const a = args || {};

  switch (toolName) {
    case 'read_file':
      return `正在读取  ${chalk.dim(a.filename || '?')}`;
    case 'create_file':
      return `正在创建  ${chalk.dim(a.filename || '?')}`;
    case 'delete_file':
      return `删除了  ${chalk.dim(a.filename || '?')}`;
    case 'edit_file':
      return `正在修改  ${chalk.dim(a.filename || '?')}`;
    case 'read_dir':
      return `列出目录  ${chalk.dim(a.dirname || '.')}`;
    case 'exec_command':
      return `执行  ${chalk.dim((a.command || '').slice(0, 60))}`;
    case 'todo_create':
      return `创建 todo  ${chalk.dim('#' + (a.status || 'pending'))}  ${a.title || ''}`;
    case 'todo_update': {
      const parts = [`更新 todo #${a.id}`];
      if (a.status) parts.push(chalk.dim(`→ ${a.status}`));
      if (a.title) parts.push(a.title);
      return parts.join('  ');
    }
    case 'todo_delete':
      return `删除 todo #${a.id || '?'}`;
    case 'todo_list':
      return a.status ? `列出 todo  ${chalk.dim(a.status)}` : '列出全部 todo';
    case 'memory_store':
      return `记忆  ${chalk.dim((a.content || '').slice(0, 50))}`;
    case 'memory_search':
      return `搜索记忆  ${chalk.dim(a.keyword || '')}`;
    case 'memory_delete':
      return `删除记忆 #${a.id || '?'}`;
    case 'memory_list':
      return '列出全部记忆';
    case 'preference_set':
      return `偏好  ${a.key || ''}  ${chalk.dim('=')}  ${chalk.dim((a.value || '').slice(0, 40))}`;
    case 'preference_list':
      return '列出全部偏好';
    case 'vector_store':
      return `向量记忆  ${chalk.dim((a.summary || '').slice(0, 50))}`;
    case 'vector_search':
      return `搜索向量  ${chalk.dim(a.query || '')}`;
    case 'vector_list':
      return '列出全部向量';
    case 'self_propose_tool':
      return `提案工具  ${chalk.dim(a.tool_name || '')}`;
    case 'self_propose_prompt':
      return `提案提示词  ${chalk.dim((a.reason || '').slice(0, 50))}`;
    case 'self_list_proposals':
      return '列出全部提案';
    case 'self_approve':
      return `批准提案 #${a.id || '?'}`;
    case 'self_reject':
      return `拒绝提案 #${a.id || '?'}`;
    case 'history_clear':
      return '清空对话历史';
    default:
      return `${toolName}  ${chalk.dim(JSON.stringify(a).slice(0, 60))}`;
  }
}

export function printToolCall(toolName, args) {
  process.stderr.write('\r\x1b[K');
  const label = formatToolAction(toolName, args);
  console.log(chalk.hex('#87CEEB')(`  ⚙ `) + label);
}

export function printToolResult(toolName, elapsedMs) {
  const time = elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`;
  console.log(chalk.dim(`     ${toolName}  ${time}`));
}

export function printSessionBanner(session) {
  console.log(chalk.hex('#FFB347')(`  ◉ ${session.name}`) + chalk.dim(`  #${session.id}`));
}
