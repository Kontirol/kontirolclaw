/**
 * 会话工具函数模块
 * 提供会话相关的辅助函数，用于格式化、转换等操作
 */

/**
 * 格式化时间戳为可读的中文日期时间字符串
 * @param timestamp - 时间戳（毫秒）
 * @returns 格式化的日期时间字符串，格式如：2024/01/15 14:30:25
 */
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

/**
 * 截断字符串到指定最大长度
 * 如果字符串长度超过最大长度，会在末尾添加省略号
 * @param str - 要截断的字符串
 * @param maxLength - 最大长度限制
 * @returns 截断后的字符串（如果超长则添加...）
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

/**
 * 将任意格式的消息转换为SessionMessage格式
 * 主要用于将OpenAI API返回的消息格式转换为系统内部使用的格式
 * @param message - 原始消息对象（包含role和content字段）
 * @returns 标准化后的SessionMessage对象
 */
export function convertToSessionMessage(message: any): any {
  // 将OpenAI格式的消息转换为我们的SessionMessage格式
  return {
    role: message.role,
    content: message.content
  };
}