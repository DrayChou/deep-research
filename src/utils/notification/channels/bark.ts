/**
 * Bark iOS 推送通知渠道
 */
import { NotificationChannel, NotificationMessage } from '../types';

export class BarkChannel implements NotificationChannel {
  name = 'bark';
  type = 'bark' as const;
  enabled: boolean;
  private server: string;
  private deviceKey: string;
  private retryAttempts: number;

  constructor(config: { server: string; deviceKey: string; enabled?: boolean; retryAttempts?: number }) {
    this.server = config.server.replace(/\/$/, ''); // 移除末尾斜杠
    this.deviceKey = config.deviceKey;
    this.enabled = config.enabled ?? true;
    this.retryAttempts = config.retryAttempts ?? 3;
  }

  get config() {
    return {
      server: this.server,
      deviceKey: this.deviceKey,
      enabled: this.enabled,
      retryAttempts: this.retryAttempts
    };
  }

  async send(message: NotificationMessage): Promise<boolean> {
    if (!this.enabled || !this.server || !this.deviceKey) {
      return false;
    }

    const payload = this.formatMessage(message);
    const url = `${this.server}/${this.deviceKey}`;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.code === 200) {
            return true;
          } else {
            throw new Error(`Bark API error: ${result.message}`);
          }
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.warn(`[Bark] Attempt ${attempt}/${this.retryAttempts} failed:`, error);
        
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
    
    // Bark 消息格式
    const title = `${emoji} ${message.title}`;
    const body = `级别: ${message.level.toUpperCase()}\n时间: ${timestamp}\n来源: ${source}\n\n${message.content}`;
    
    const payload: any = {
      title: title,
      body: body,
      group: message.group || 'deep-research',
      sound: message.sound || this.getLevelSound(message.level),
      icon: message.icon || this.getLevelIcon(message.level),
      level: this.getBarkLevel(message.level),
    };

    // 设置角标
    if (message.badge !== undefined) {
      payload.badge = message.badge;
    }

    // 设置跳转URL
    if (message.url) {
      payload.url = message.url;
    }

    // 添加标签作为副标题
    if (message.tags && message.tags.length > 0) {
      payload.copy = message.tags.join(', ');
    }

    // 根据级别设置特殊处理
    if (message.level === 'critical') {
      // 紧急模式：绕过勿扰模式，强制响铃和显示
      payload.level = 'critical';
      payload.sound = message.sound || 'alarm';
      payload.badge = message.badge || 1;
    } else if (message.level === 'error') {
      // 错误级别：立即显示，点亮屏幕
      payload.level = 'active';
      payload.sound = message.sound || 'multiwayinvitation';
    } else if (message.level === 'warning') {
      // 警告级别：时间敏感通知，可在专注模式下显示
      payload.level = 'timeSensitive';
      payload.sound = message.sound || 'healthnotification';
    } else {
      // 信息级别：被动通知，不点亮屏幕
      payload.level = 'active'; // 对于系统通知，我们还是希望能及时看到
      payload.sound = message.sound || 'birdsong';
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

  private getLevelSound(level: string): string {
    const soundMap = {
      info: 'birdsong',
      warning: 'healthnotification',
      error: 'multiwayinvitation',
      critical: 'alarm'
    };
    return soundMap[level as keyof typeof soundMap] || 'birdsong';
  }

  private getLevelIcon(level: string): string {
    const iconMap = {
      info: 'https://api.iconify.design/mdi:information.png',
      warning: 'https://api.iconify.design/mdi:alert.png',
      error: 'https://api.iconify.design/mdi:alert-circle.png',
      critical: 'https://api.iconify.design/mdi:fire.png'
    };
    return iconMap[level as keyof typeof iconMap] || 'https://api.iconify.design/mdi:bell.png';
  }

  private getBarkLevel(level: string): string {
    const levelMap = {
      info: 'active',           // 信息：立即显示
      warning: 'timeSensitive', // 警告：时间敏感，可在专注模式显示
      error: 'active',          // 错误：立即显示
      critical: 'critical'      // 紧急：绕过勿扰模式
    };
    return levelMap[level as keyof typeof levelMap] || 'active';
  }
}