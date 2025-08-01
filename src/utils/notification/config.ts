/**
 * 通知系统配置
 * 从环境变量读取配置，支持多种通知渠道
 */

import { NotificationConfig } from './types';

// 检测是否为浏览器环境
function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof process === 'undefined';
}

// 安全获取环境变量（浏览器环境下返回 undefined）
function getEnvVar(key: string): string | undefined {
  if (isBrowserEnvironment()) {
    return undefined;
  }
  return process.env[key];
}

// 从环境变量读取配置的辅助函数
function getEnvBoolean(key: string, defaultValue: boolean = false): boolean {
  const value = getEnvVar(key);
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = getEnvVar(key);
  return value ? parseInt(value, 10) : defaultValue;
}

function parseEnvJson(key: string, defaultValue: any = {}): any {
  const value = getEnvVar(key);
  if (!value) return defaultValue;
  try {
    return JSON.parse(value);
  } catch {
    console.warn(`[NotificationConfig] Failed to parse JSON from ${key}, using default`);
    return defaultValue;
  }
}

function getEnabledChannels(): string[] {
  const channels = getEnvVar('NOTIFICATION_CHANNELS');
  if (!channels) return [];
  
  return channels
    .split(',')
    .map(channel => channel.trim().toLowerCase())
    .filter(channel => channel);
}

function isChannelEnabled(channelName: string, hasConfig: boolean): boolean {
  if (!hasConfig) return false;
  
  const enabledChannels = getEnabledChannels();
  // 如果没有设置 NOTIFICATION_CHANNELS，且有配置，则默认启用
  if (enabledChannels.length === 0) return true;
  
  return enabledChannels.includes(channelName.toLowerCase());
}

// 通知系统配置
export const notificationConfig: NotificationConfig = {
  // 全局配置
  enabled: getEnvBoolean('NOTIFICATION_ENABLED', true),
  retryAttempts: getEnvNumber('NOTIFICATION_RETRY_ATTEMPTS', 3),
  retryDelay: getEnvNumber('NOTIFICATION_RETRY_DELAY', 1000),
  
  // 去重配置
  deduplication: {
    enabled: getEnvBoolean('NOTIFICATION_DEDUP_ENABLED', true),
    windowMinutes: getEnvNumber('NOTIFICATION_DEDUP_WINDOW', 30)
  },
  
  // 通知渠道配置
  channels: {
    // 企业微信 Webhook
    wechatWork: {
      enabled: isChannelEnabled('wechat-work', !!getEnvVar('WECHAT_WORK_WEBHOOK')),
      webhook: getEnvVar('WECHAT_WORK_WEBHOOK') || '',
      retryAttempts: getEnvNumber('WECHAT_WORK_RETRY_ATTEMPTS', 3)
    },
    
    // 飞书 Webhook
    feishu: {
      enabled: isChannelEnabled('feishu', !!getEnvVar('FEISHU_WEBHOOK')),
      webhook: getEnvVar('FEISHU_WEBHOOK') || '',
      retryAttempts: getEnvNumber('FEISHU_RETRY_ATTEMPTS', 3)
    },
    
    // Telegram Bot
    telegram: {
      enabled: isChannelEnabled('telegram', !!(getEnvVar('TELEGRAM_BOT_TOKEN') && getEnvVar('TELEGRAM_CHAT_ID'))),
      botToken: getEnvVar('TELEGRAM_BOT_TOKEN') || '',
      chatId: getEnvVar('TELEGRAM_CHAT_ID') || '',
      retryAttempts: getEnvNumber('TELEGRAM_RETRY_ATTEMPTS', 3)
    },
    
    // Bark (iOS 推送)
    bark: {
      enabled: isChannelEnabled('bark', !!(getEnvVar('BARK_DEVICE_KEY'))),
      server: getEnvVar('BARK_SERVER') || 'https://api.day.app',
      deviceKey: getEnvVar('BARK_DEVICE_KEY') || '',
      retryAttempts: getEnvNumber('BARK_RETRY_ATTEMPTS', 3)
    },
    
    // PushDeer (跨平台推送)
    pushdeer: {
      enabled: isChannelEnabled('pushdeer', !!getEnvVar('PUSHDEER_PUSH_KEY')),
      server: getEnvVar('PUSHDEER_SERVER') || 'https://api2.pushdeer.com',
      pushkey: getEnvVar('PUSHDEER_PUSH_KEY') || '',
      retryAttempts: getEnvNumber('PUSHDEER_RETRY_ATTEMPTS', 3)
    },
    
    // 邮件通知
    email: {
      enabled: isChannelEnabled('email', !!(getEnvVar('SMTP_HOST') && getEnvVar('SMTP_USER') && getEnvVar('EMAIL_TO'))),
      smtp: {
        host: getEnvVar('SMTP_HOST') || '',
        port: getEnvNumber('SMTP_PORT', 587),
        secure: getEnvBoolean('SMTP_SECURE', false),
        user: getEnvVar('SMTP_USER') || '',
        password: getEnvVar('SMTP_PASSWORD') || ''
      },
      from: getEnvVar('EMAIL_FROM') || getEnvVar('SMTP_USER') || '',
      to: (getEnvVar('EMAIL_TO') || '').split(',').map(email => email.trim()).filter(email => email),
      retryAttempts: getEnvNumber('EMAIL_RETRY_ATTEMPTS', 3)
    },
    
    // 通用 Webhook
    webhook: {
      enabled: isChannelEnabled('webhook', !!getEnvVar('WEBHOOK_URL')),
      url: getEnvVar('WEBHOOK_URL') || '',
      method: (getEnvVar('WEBHOOK_METHOD') as 'POST' | 'PUT') || 'POST',
      headers: parseEnvJson('WEBHOOK_HEADERS', {}),
      retryAttempts: getEnvNumber('WEBHOOK_RETRY_ATTEMPTS', 3)
    }
  }
};

// 日志配置状态（仅在开发模式下）
if (getEnvVar('NODE_ENV') === 'development') {
  const enabledChannels = Object.entries(notificationConfig.channels)
    .filter(([, config]) => config?.enabled)
    .map(([name]) => name);
    
  console.log('[NotificationConfig] Loaded configuration:', {
    enabled: notificationConfig.enabled,
    enabledChannels,
    deduplication: notificationConfig.deduplication.enabled,
    retryAttempts: notificationConfig.retryAttempts
  });
}