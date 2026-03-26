// 会话工具函数
export function formatSessionTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

export function convertToSessionMessage(message: any): any {
  // 将OpenAI格式的消息转换为我们的SessionMessage格式
  return {
    role: message.role,
    content: message.content
  };
}