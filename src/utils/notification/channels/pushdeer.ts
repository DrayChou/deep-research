/**
 * PushDeer 推送通知渠道
 */
import { NotificationChannel, NotificationMessage } from '../types';

export class PushDeerChannel implements NotificationChannel {
  name = 'pushdeer';
  type = 'pushdeer' as const;
  enabled: boolean;
  private server: string;
  private pushkey: string;
  private retryAttempts: number;

  constructor(config: { pushkey: string; server?: string; enabled?: boolean; retryAttempts?: number }) {
    this.server = config.server || 'https://api2.pushdeer.com';
    this.pushkey = config.pushkey;
    this.enabled = config.enabled ?? true;
    this.retryAttempts = config.retryAttempts ?? 3;
  }

  get config() {
    return {
      server: this.server,
      pushkey: this.pushkey,
      enabled: this.enabled,
      retryAttempts: this.retryAttempts
    };
  }

  async send(message: NotificationMessage): Promise<boolean> {
    if (!this.enabled || !this.pushkey) {
      return false;
    }

    const payload = this.formatMessage(message);
    const url = `${this.server}/message/push`;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams(payload).toString(),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.code === 0) {
            return true;
          } else {
            throw new Error(`PushDeer API error: ${result.error}`);
          }
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.warn(`[PushDeer] Attempt ${attempt}/${this.retryAttempts} failed:`, error);
        
        if (attempt === this.retryAttempts) {
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    
    return false;
  }

  private formatMessage(message: NotificationMessage) {
    const emoji = this.getLevelEmoji(message.level);
    const timestamp = message.timestamp || new Date().toLocaleString('zh-CN');
    const source = message.source || 'Deep Research';
    
    // PushDeer 支持 Markdown 格式
    const text = `## ${emoji} ${message.title}

**级别**: ${message.level.toUpperCase()}  
**时间**: ${timestamp}  
**来源**: ${source}  

### 详细信息
${message.content}

${message.tags && message.tags.length > 0 ? `**标签**: ${message.tags.join(', ')}` : ''}

---
*自动发送的系统通知*`;

    const payload: any = {
      pushkey: this.pushkey,
      text: text,
      desp: '', // PushDeer 的描述字段，这里留空
      type: 'markdown'
    };

    // 添加扩展参数支持
    if (message.url) {
      // PushDeer 支持在消息中添加链接，会自动识别
      payload.text += `\n\n[查看详情](${message.url})`;
    }

    // 根据级别设置不同的处理
    if (message.level === 'critical') {
      // 紧急消息添加特殊标记
      payload.text = `🚨 **紧急通知** 🚨\n\n${payload.text}`;
    } else if (message.level === 'error') {
      // 错误消息添加特殊标记
      payload.text = `❌ **系统错误** ❌\n\n${payload.text}`;
    }

    return payload;
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
}