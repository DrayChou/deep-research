/**
 * 通用 Webhook 通知渠道
 */
import { NotificationChannel, NotificationMessage } from '../types';

export class WebhookChannel implements NotificationChannel {
  name = 'webhook';
  type = 'webhook' as const;
  enabled: boolean;
  private url: string;
  private method: 'POST' | 'PUT';
  private headers: Record<string, string>;
  private retryAttempts: number;

  constructor(config: {
    url: string;
    method?: 'POST' | 'PUT';
    headers?: Record<string, string>;
    enabled?: boolean;
    retryAttempts?: number;
  }) {
    this.url = config.url;
    this.method = config.method || 'POST';
    this.headers = config.headers || {};
    this.enabled = config.enabled ?? true;
    this.retryAttempts = config.retryAttempts ?? 3;
  }

  get config() {
    return {
      url: this.url,
      method: this.method,
      headers: this.headers,
      enabled: this.enabled,
      retryAttempts: this.retryAttempts
    };
  }

  async send(message: NotificationMessage): Promise<boolean> {
    if (!this.enabled || !this.url) {
      return false;
    }

    const payload = this.formatMessage(message);
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await fetch(this.url, {
          method: this.method,
          headers: {
            'Content-Type': 'application/json',
            ...this.headers,
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          return true;
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.warn(`[Webhook] Attempt ${attempt}/${this.retryAttempts} failed:`, error);
        
        if (attempt === this.retryAttempts) {
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    
    return false;
  }

  private formatMessage(message: NotificationMessage) {
    // 标准化的Webhook负载格式
    return {
      // 基本信息
      title: message.title,
      content: message.content,
      level: message.level,
      timestamp: message.timestamp || new Date().toISOString(),
      source: message.source || 'Deep Research',
      
      // 附加信息
      tags: message.tags || [],
      extra: message.extra || {},
      
      // 格式化的显示信息
      formatted: {
        emoji: this.getLevelEmoji(message.level),
        levelName: message.level.toUpperCase(),
        displayTime: message.timestamp || new Date().toLocaleString('zh-CN'),
        fullMessage: this.getFullMessage(message)
      },
      
      // Webhook特定信息
      webhook: {
        version: '1.0',
        type: 'notification',
        id: this.generateId(),
        sentAt: new Date().toISOString()
      }
    };
  }

  private getFullMessage(message: NotificationMessage): string {
    const emoji = this.getLevelEmoji(message.level);
    const timestamp = message.timestamp || new Date().toLocaleString('zh-CN');
    const source = message.source || 'Deep Research';
    
    let fullMessage = `${emoji} ${message.title}\n\n`;
    fullMessage += `级别: ${message.level.toUpperCase()}\n`;
    fullMessage += `时间: ${timestamp}\n`;
    fullMessage += `来源: ${source}\n\n`;
    fullMessage += `详细信息:\n${message.content}\n`;
    
    if (message.tags && message.tags.length > 0) {
      fullMessage += `\n标签: ${message.tags.join(', ')}\n`;
    }
    
    fullMessage += '\n自动发送的系统通知';
    
    return fullMessage;
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

  private generateId(): string {
    return `webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}