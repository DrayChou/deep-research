/**
 * 飞书通知渠道
 */
import { NotificationChannel, NotificationMessage } from '../types';

export class FeishuChannel implements NotificationChannel {
  name = 'feishu';
  type = 'feishu' as const;
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
          if (result.code === 0) {
            return true;
          } else {
            throw new Error(`Feishu API error: ${result.msg}`);
          }
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.warn(`[Feishu] Attempt ${attempt}/${this.retryAttempts} failed:`, error);
        
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
    const color = this.getLevelColor(message.level);
    const timestamp = message.timestamp || new Date().toLocaleString('zh-CN');
    const source = message.source || 'Deep Research';
    
    // 构建字段数组
    const fields = [
      {
        is_short: true,
        text: {
          content: `**级别**\n<font color='${color}'>${message.level.toUpperCase()}</font>`,
          tag: 'lark_md'
        }
      },
      {
        is_short: true,
        text: {
          content: `**时间**\n${timestamp}`,
          tag: 'lark_md'
        }
      },
      {
        is_short: true,
        text: {
          content: `**来源**\n${source}`,
          tag: 'lark_md'
        }
      }
    ];

    // 添加分组信息
    if (message.group) {
      fields.push({
        is_short: true,
        text: {
          content: `**分组**\n${message.group}`,
          tag: 'lark_md'
        }
      });
    }

    const elements: any[] = [
      {
        tag: 'div',
        text: {
          content: `**${emoji} ${message.title}**`,
          tag: 'lark_md'
        }
      },
      {
        tag: 'hr'
      },
      {
        tag: 'div',
        fields: fields
      },
      {
        tag: 'div',
        text: {
          content: `**详细信息**\n${message.content}`,
          tag: 'lark_md'
        }
      }
    ];

    // 添加标签
    if (message.tags && message.tags.length > 0) {
      elements.push({
        tag: 'div',
        text: {
          content: `**标签**: ${message.tags.join(', ')}`,
          tag: 'lark_md'
        }
      });
    }

    // 添加链接按钮
    if (message.url) {
      elements.push({
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: {
              content: '🔗 查看详情',
              tag: 'plain_text'
            },
            url: message.url,
            type: 'default'
          }
        ]
      });
    }

    // 添加底部注释
    elements.push({
      tag: 'note',
      elements: [
        {
          tag: 'plain_text',
          content: '自动发送的系统通知'
        }
      ]
    });

    // 根据级别设置不同的标题和颜色
    let headerTitle = `${emoji} 系统通知`;
    let headerTemplate = 'blue';
    
    if (message.level === 'critical') {
      headerTitle = `🚨 紧急通知`;
      headerTemplate = 'red';
    } else if (message.level === 'error') {
      headerTitle = `❌ 系统错误`;
      headerTemplate = 'red';
    } else if (message.level === 'warning') {
      headerTitle = `⚠️ 重要警告`;
      headerTemplate = 'orange';
    }
    
    return {
      msg_type: 'interactive',
      card: {
        elements: elements,
        header: {
          title: {
            content: headerTitle,
            tag: 'plain_text'
          },
          template: headerTemplate
        }
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
      info: 'blue',
      warning: 'orange',
      error: 'red',
      critical: 'red'
    };
    return colorMap[level as keyof typeof colorMap] || 'blue';
  }
}