/**
 * Telegram 通知渠道
 */
import { NotificationChannel, NotificationMessage } from '../types';

export class TelegramChannel implements NotificationChannel {
  name = 'telegram';
  type = 'telegram' as const;
  enabled: boolean;
  private botToken: string;
  private chatId: string;
  private retryAttempts: number;

  constructor(config: { botToken: string; chatId: string; enabled?: boolean; retryAttempts?: number }) {
    this.botToken = config.botToken;
    this.chatId = config.chatId;
    this.enabled = config.enabled ?? true;
    this.retryAttempts = config.retryAttempts ?? 3;
  }

  get config() {
    return {
      botToken: this.botToken,
      chatId: this.chatId,
      enabled: this.enabled,
      retryAttempts: this.retryAttempts
    };
  }

  async send(message: NotificationMessage): Promise<boolean> {
    if (!this.enabled || !this.botToken || !this.chatId) {
      return false;
    }

    const { text } = this.formatMessage(message);
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const payload: any = {
          chat_id: this.chatId,
          text: text,
          parse_mode: 'Markdown',
          disable_web_page_preview: !message.url // 如果有URL则显示预览
        };

        // 添加级别相关的特殊处理
        if (message.level === 'critical') {
          // 紧急消息：禁用通知静音
          payload.disable_notification = false;
        } else if (message.level === 'info') {
          // 信息消息：静默发送，不打扰用户
          payload.disable_notification = true;
        }

        // 添加内联键盘（如果有URL）
        if (message.url) {
          payload.reply_markup = {
            inline_keyboard: [[
              {
                text: '🔗 查看详情',
                url: message.url
              }
            ]]
          };
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.ok) {
            return true;
          } else {
            throw new Error(`Telegram API error: ${result.description}`);
          }
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.warn(`[Telegram] Attempt ${attempt}/${this.retryAttempts} failed:`, error);
        
        if (attempt === this.retryAttempts) {
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    
    return false;
  }

  private formatMessage(message: NotificationMessage): { text: string; options?: any } {
    const emoji = this.getLevelEmoji(message.level);
    const timestamp = message.timestamp || new Date().toLocaleString('zh-CN');
    const source = message.source || 'Deep Research';
    
    // 根据级别添加特殊前缀
    let levelPrefix = '';
    if (message.level === 'critical') {
      levelPrefix = '🚨 *紧急通知* 🚨\n\n';
    } else if (message.level === 'error') {
      levelPrefix = '❌ *系统错误* ❌\n\n';
    } else if (message.level === 'warning') {
      levelPrefix = '⚠️ *重要警告* ⚠️\n\n';
    }
    
    let text = `${levelPrefix}${emoji} *${this.escapeMarkdown(message.title)}*\n\n`;
    text += `*级别*: \`${message.level.toUpperCase()}\`\n`;
    text += `*时间*: \`${timestamp}\`\n`;
    text += `*来源*: \`${source}\`\n`;
    
    // 添加分组信息
    if (message.group) {
      text += `*分组*: \`${message.group}\`\n`;
    }
    
    text += `\n*详细信息*:\n${this.escapeMarkdown(message.content)}\n`;
    
    if (message.tags && message.tags.length > 0) {
      text += `\n*标签*: ${message.tags.map(tag => `\`${tag}\``).join(', ')}\n`;
    }
    
    // 如果没有URL，在文本中添加链接信息
    if (message.url && !message.url.startsWith('http')) {
      text += `\n*链接*: \`${this.escapeMarkdown(message.url)}\`\n`;
    }
    
    text += '\n_自动发送的系统通知_';
    
    return { text };
  }

  private getLevelEmoji(level: string): string {
    const emojiMap = {
      info: '📝',
      warning: '⚠️',
      error: '❌',
      critical: '🚨'
    };
    return emojiMap[level as keyof typeof emojiMap] || '📝';
  }

  private escapeMarkdown(text: string): string {
    // Escape special characters in Telegram Markdown
    return text.replace(/[_*\[\]()~`>#+=|{}\.!-]/g, '\\$&');
  }
}