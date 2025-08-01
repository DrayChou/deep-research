/**
 * 通知系统类型定义
 * 独立可复用的通知服务，支持多种通知渠道
 */

export interface NotificationMessage {
  title: string;
  content: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  timestamp?: string;
  source?: string;
  tags?: string[];
  extra?: Record<string, any>;
  // 扩展参数，各渠道可以使用
  sound?: string;           // 声音文件名或URL
  icon?: string;            // 图标URL
  group?: string;           // 分组名称
  badge?: number;           // 角标数字
  url?: string;             // 点击跳转URL
}

export interface NotificationChannel {
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  config: Record<string, any>;
  send(message: NotificationMessage): Promise<boolean>;
}

export type NotificationChannelType = 
  | 'wechat-work'    // 企业微信
  | 'feishu'         // 飞书
  | 'telegram'       // Telegram
  | 'bark'           // Bark (iOS)
  | 'pushdeer'       // PushDeer
  | 'email'          // 邮件
  | 'webhook';       // 通用Webhook

export interface NotificationConfig {
  // 全局配置
  enabled: boolean;
  retryAttempts: number;
  retryDelay: number;
  deduplication: {
    enabled: boolean;
    windowMinutes: number;
    keyGenerator?: (message: NotificationMessage) => string;
  };
  
  // 渠道配置
  channels: {
    wechatWork?: {
      enabled: boolean;
      webhook: string;
      retryAttempts?: number;
    };
    feishu?: {
      enabled: boolean;
      webhook: string;
      retryAttempts?: number;
    };
    telegram?: {
      enabled: boolean;
      botToken: string;
      chatId: string;
      retryAttempts?: number;
    };
    bark?: {
      enabled: boolean;
      server: string;
      deviceKey: string;
      retryAttempts?: number;
    };
    pushdeer?: {
      enabled: boolean;
      server?: string;
      pushkey: string;
      retryAttempts?: number;
    };
    email?: {
      enabled: boolean;
      smtp: {
        host: string;
        port: number;
        secure: boolean;
        user: string;
        password: string;
      };
      from: string;
      to: string[];
      retryAttempts?: number;
    };
    webhook?: {
      enabled: boolean;
      url: string;
      method?: 'POST' | 'PUT';
      headers?: Record<string, string>;
      retryAttempts?: number;
    };
  };
}

export interface NotificationResult {
  success: boolean;
  channel: string;
  message?: string;
  error?: string;
  timestamp: string;
}

export interface DeduplicationEntry {
  key: string;
  timestamp: number;
  count: number;
}