/**
 * 邮件通知渠道
 * 注意：此实现需要在 Node.js 环境中运行，浏览器环境需要通过 API 代理
 */
import { NotificationChannel, NotificationMessage } from '../types';

export class EmailChannel implements NotificationChannel {
  name = 'email';
  type = 'email' as const;
  enabled: boolean;
  private smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
  };
  private from: string;
  private to: string[];
  private retryAttempts: number;

  constructor(config: {
    smtp: { host: string; port: number; secure: boolean; user: string; password: string };
    from: string;
    to: string[];
    enabled?: boolean;
    retryAttempts?: number;
  }) {
    this.smtp = config.smtp;
    this.from = config.from;
    this.to = config.to;
    this.enabled = config.enabled ?? true;
    this.retryAttempts = config.retryAttempts ?? 3;
  }

  get config() {
    return {
      smtp: {
        ...this.smtp,
        password: '***' // 隐藏密码
      },
      from: this.from,
      to: this.to,
      enabled: this.enabled,
      retryAttempts: this.retryAttempts
    };
  }

  async send(message: NotificationMessage): Promise<boolean> {
    if (!this.enabled || !this.smtp.host || this.to.length === 0) {
      return false;
    }

    // 检查是否在 Node.js 环境中
    if (typeof window !== 'undefined') {
      // 浏览器环境，尝试通过 API 发送
      return this.sendViaAPI(message);
    }

    // Node.js 环境，直接发送
    return this.sendViaSMTP(message);
  }

  private async sendViaSMTP(message: NotificationMessage): Promise<boolean> {
    try {
      // 动态导入 nodemailer（仅在 Node.js 环境中可用）
      const nodemailer = await eval('import("nodemailer")').catch(() => null);
      if (!nodemailer) {
        console.warn('nodemailer not available in this environment');
        return false;
      }
      
      const transporter = nodemailer.createTransporter({
        host: this.smtp.host,
        port: this.smtp.port,
        secure: this.smtp.secure,
        auth: {
          user: this.smtp.user,
          pass: this.smtp.password,
        },
      });

      const { subject, html } = this.formatMessage(message);

      for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
        try {
          await transporter.sendMail({
            from: this.from,
            to: this.to.join(', '),
            subject: subject,
            html: html,
          });
          
          return true;
        } catch (error) {
          console.warn(`[Email] Attempt ${attempt}/${this.retryAttempts} failed:`, error);
          
          if (attempt === this.retryAttempts) {
            throw error;
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
      
      return false;
    } catch (error) {
      console.error('[Email] SMTP sending failed:', error);
      return false;
    }
  }

  private async sendViaAPI(message: NotificationMessage): Promise<boolean> {
    // 通过API发送邮件（需要后端支持）
    const { subject, html } = this.formatMessage(message);
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await fetch('/api/send-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: this.from,
            to: this.to,
            subject: subject,
            html: html,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            return true;
          } else {
            throw new Error(`Email API error: ${result.error}`);
          }
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.warn(`[Email] API attempt ${attempt}/${this.retryAttempts} failed:`, error);
        
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
    const levelColor = this.getLevelColor(message.level);
    
    const subject = `${emoji} ${message.title}`;
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${subject}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${levelColor}; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .footer { background: #eee; padding: 10px; border-radius: 0 0 5px 5px; font-size: 12px; color: #666; }
        .info-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        .info-table td { padding: 8px; border-bottom: 1px solid #ddd; }
        .info-table td:first-child { font-weight: bold; width: 80px; }
        .tags { background: #e7f3ff; padding: 10px; border-radius: 3px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h2>${emoji} ${message.title}</h2>
    </div>
    
    <div class="content">
        <table class="info-table">
            <tr>
                <td>级别</td>
                <td><strong style="color: ${levelColor}">${message.level.toUpperCase()}</strong></td>
            </tr>
            <tr>
                <td>时间</td>
                <td>${timestamp}</td>
            </tr>
            <tr>
                <td>来源</td>
                <td>${source}</td>
            </tr>
        </table>
        
        <h3>详细信息</h3>
        <div style="background: white; padding: 15px; border-radius: 3px; white-space: pre-wrap;">${message.content}</div>
        
        ${message.tags && message.tags.length > 0 ? `
        <div class="tags">
            <strong>标签:</strong> ${message.tags.join(', ')}
        </div>
        ` : ''}
    </div>
    
    <div class="footer">
        自动发送的系统通知 - ${new Date().toLocaleString('zh-CN')}
    </div>
</body>
</html>`;

    return { subject, html };
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
      info: '#007bff',
      warning: '#ffc107',
      error: '#dc3545',
      critical: '#721c24'
    };
    return colorMap[level as keyof typeof colorMap] || '#007bff';
  }
}