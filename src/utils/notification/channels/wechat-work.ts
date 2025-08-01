/**
 * 企业微信通知渠道
 */
import { NotificationChannel, NotificationMessage } from '../types';

export class WeChatWorkChannel implements NotificationChannel {
  name = 'wechat-work';
  type = 'wechat-work' as const;
  enabled: boolean;
  private webhook: string;
  private retryAttempts: number;

  constructor(config: { webhook: string; enabled?: boolean; retryAttempts?: number }) {
    this.webhook = config.webhook;
    this.enabled = config.enabled ?? true;
    this.retryAttempts = config.retryAttempts ?? 3;
  }

  get config() {
    return {
      webhook: this.webhook,
      enabled: this.enabled,
      retryAttempts: this.retryAttempts
    };
  }

  async send(message: NotificationMessage): Promise<boolean> {
    if (!this.enabled || !this.webhook) {
      return false;
    }

    const payload = this.formatMessage(message);
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await fetch(this.webhook, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.errcode === 0) {
            return true;
          } else {
            throw new Error(`WeChat Work API error: ${result.errmsg}`);
          }
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.warn(`[WeChatWork] Attempt ${attempt}/${this.retryAttempts} failed:`, error);
        
        if (attempt === this.retryAttempts) {
          throw error;
        }
        
        // 延迟重试
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    
    return false;
  }

  private formatMessage(message: NotificationMessage) {
    const emoji = this.getLevelEmoji(message.level);
    const color = this.getLevelColor(message.level);
    const timestamp = message.timestamp || new Date().toLocaleString('zh-CN');
    const source = message.source || 'Deep Research';
    
    // 根据级别添加特殊标记
    let levelPrefix = '';
    if (message.level === 'critical') {
      levelPrefix = '🚨 **紧急通知** 🚨\n\n';
    } else if (message.level === 'error') {
      levelPrefix = '❌ **系统错误** ❌\n\n';
    } else if (message.level === 'warning') {
      levelPrefix = '⚠️ **重要警告** ⚠️\n\n';
    }
    
    let content = `${levelPrefix}## ${emoji} ${message.title}

**级别**: <font color="${color}">${message.level.toUpperCase()}</font>
**时间**: ${timestamp}
**来源**: ${source}`;

    // 添加分组信息
    if (message.group) {
      content += `\n**分组**: ${message.group}`;
    }

    content += `\n\n### 详细信息
${message.content}`;

    // 添加标签
    if (message.tags && message.tags.length > 0) {
      content += `\n\n**标签**: ${message.tags.join(', ')}`;
    }

    // 添加链接
    if (message.url) {
      content += `\n\n**相关链接**: [查看详情](${message.url})`;
    }

    content += '\n\n---\n*自动发送的系统通知*';
    
    return {
      msgtype: 'markdown',
      markdown: {
        content: content
      }
    };
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

  private getLevelColor(level: string): string {
    const colorMap = {
      info: 'info',
      warning: 'warning',
      error: 'red',
      critical: 'red'
    };
    return colorMap[level as keyof typeof colorMap] || 'info';
  }
}