/**
 * 通知系统配置示例
 * 复制此文件为 config.ts 并根据需要修改配置
 */

import { NotificationConfig } from './types';

export const notificationConfig: NotificationConfig = {
  // 全局配置
  enabled: true,
  retryAttempts: 3,
  retryDelay: 1000,
  
  // 去重配置
  deduplication: {
    enabled: true,
    windowMinutes: 30, // 30分钟内相同消息只发送一次
    keyGenerator: (message) => `${message.title}-${message.level}-${message.source}` // 自定义去重key生成
  },
  
  // 通知渠道配置
  channels: {
    // 企业微信 Webhook
    wechatWork: {
      enabled: false, // 设置为 true 启用
      webhook: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY',
      retryAttempts: 3
    },
    
    // 飞书 Webhook
    feishu: {
      enabled: false, // 设置为 true 启用
      webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_HOOK_ID',
      retryAttempts: 3
    },
    
    // Telegram Bot
    telegram: {
      enabled: false, // 设置为 true 启用
      botToken: 'YOUR_BOT_TOKEN', // 从 @BotFather 获取
      chatId: 'YOUR_CHAT_ID', // 可以是个人ID或群组ID
      retryAttempts: 3
    },
    
    // Bark (iOS 推送)
    bark: {
      enabled: false, // 设置为 true 启用
      server: 'https://api.day.app', // 或自建服务器地址
      deviceKey: 'YOUR_DEVICE_KEY', // Bark app 中的设备key
      retryAttempts: 3
    },
    
    // PushDeer (跨平台推送)
    pushdeer: {
      enabled: false, // 设置为 true 启用
      server: 'https://api2.pushdeer.com', // 或自建服务器
      pushkey: 'YOUR_PUSH_KEY', // PushDeer 中的推送key
      retryAttempts: 3
    },
    
    // 邮件通知
    email: {
      enabled: false, // 设置为 true 启用
      smtp: {
        host: 'smtp.gmail.com', // SMTP服务器地址
        port: 587, // SMTP端口
        secure: false, // 是否使用SSL
        user: 'your-email@gmail.com', // 发送邮箱
        password: 'your-app-password' // 邮箱密码或应用密码
      },
      from: 'Deep Research <your-email@gmail.com>', // 发件人
      to: ['admin@example.com', 'ops@example.com'], // 收件人列表
      retryAttempts: 3
    },
    
    // 通用 Webhook
    webhook: {
      enabled: false, // 设置为 true 启用
      url: 'https://your-webhook-endpoint.com/notify',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer YOUR_TOKEN',
        'X-Custom-Header': 'value'
      },
      retryAttempts: 3
    }
  }
};

// 环境变量配置 (推荐方式)
export function getNotificationConfigFromEnv(): NotificationConfig {
  return {
    enabled: process.env.NOTIFICATION_ENABLED !== 'false',
    retryAttempts: parseInt(process.env.NOTIFICATION_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.NOTIFICATION_RETRY_DELAY || '1000'),
    
    deduplication: {
      enabled: process.env.NOTIFICATION_DEDUP_ENABLED !== 'false',
      windowMinutes: parseInt(process.env.NOTIFICATION_DEDUP_WINDOW || '30')
    },
    
    channels: {
      wechatWork: {
        enabled: !!process.env.WECHAT_WORK_WEBHOOK,
        webhook: process.env.WECHAT_WORK_WEBHOOK || ''
      },
      
      feishu: {
        enabled: !!process.env.FEISHU_WEBHOOK,
        webhook: process.env.FEISHU_WEBHOOK || ''
      },
      
      telegram: {
        enabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
        botToken: process.env.TELEGRAM_BOT_TOKEN || '',
        chatId: process.env.TELEGRAM_CHAT_ID || ''
      },
      
      bark: {
        enabled: !!(process.env.BARK_SERVER && process.env.BARK_DEVICE_KEY),
        server: process.env.BARK_SERVER || 'https://api.day.app',
        deviceKey: process.env.BARK_DEVICE_KEY || ''
      },
      
      pushdeer: {
        enabled: !!process.env.PUSHDEER_PUSH_KEY,
        server: process.env.PUSHDEER_SERVER || 'https://api2.pushdeer.com',
        pushkey: process.env.PUSHDEER_PUSH_KEY || ''
      },
      
      email: {
        enabled: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.EMAIL_TO),
        smtp: {
          host: process.env.SMTP_HOST || '',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          user: process.env.SMTP_USER || '',
          password: process.env.SMTP_PASSWORD || ''
        },
        from: process.env.EMAIL_FROM || process.env.SMTP_USER || '',
        to: (process.env.EMAIL_TO || '').split(',').filter(email => email.trim())
      },
      
      webhook: {
        enabled: !!process.env.WEBHOOK_URL,
        url: process.env.WEBHOOK_URL || '',
        method: (process.env.WEBHOOK_METHOD as 'POST' | 'PUT') || 'POST',
        headers: process.env.WEBHOOK_HEADERS ? JSON.parse(process.env.WEBHOOK_HEADERS) : {}
      }
    }
  };
}

// 使用示例
export const exampleUsage = `
// 1. 基本使用
import { NotificationService } from './utils/notification';
import { notificationConfig } from './utils/notification/config';

const notificationService = new NotificationService(notificationConfig);

// 发送通知
await notificationService.send({
  title: 'API 错误警告',
  content: '检测到 API 调用失败，请检查服务状态',
  level: 'error',
  tags: ['api', 'error']
});

// 2. API欠费专用方法
await notificationService.sendApiCreditAlert('OpenAI', '余额不足，请充值');

// 3. 测试所有渠道
const results = await notificationService.testAllChannels();
console.log('测试结果:', results);

// 4. 检查渠道状态
const status = notificationService.getChannelStatus();
console.log('渠道状态:', status);
`;

// 环境变量配置示例 (.env)
export const envExample = `
# 通知系统总开关
NOTIFICATION_ENABLED=true
NOTIFICATION_RETRY_ATTEMPTS=3
NOTIFICATION_DEDUP_ENABLED=true
NOTIFICATION_DEDUP_WINDOW=30

# 启用的通知渠道（可选择多个，用逗号分隔）
# 可选值: wechat-work, feishu, telegram, bark, pushdeer, email, webhook
# 如果不设置此变量，所有配置了必要参数的渠道都会启用
NOTIFICATION_CHANNELS=wechat-work,telegram,email

# 企业微信 Webhook
WECHAT_WORK_WEBHOOK=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY

# 飞书 Webhook
FEISHU_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_HOOK_ID

# Telegram Bot
TELEGRAM_BOT_TOKEN=1234567890:AABBCCDDEEFFgghhiijjkkllmmnnooppqqrr
TELEGRAM_CHAT_ID=-1001234567890

# Bark (iOS) - 支持自建服务器
BARK_SERVER=https://api.day.app
BARK_DEVICE_KEY=YOUR_DEVICE_KEY

# PushDeer - 支持自建服务器
PUSHDEER_SERVER=https://api2.pushdeer.com
PUSHDEER_PUSH_KEY=YOUR_PUSH_KEY

# 邮件 SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=Deep Research <your-email@gmail.com>
EMAIL_TO=admin@example.com,ops@example.com

# 通用 Webhook
WEBHOOK_URL=https://your-webhook-endpoint.com/notify
WEBHOOK_METHOD=POST
WEBHOOK_HEADERS={\"Authorization\":\"Bearer TOKEN\"}
`;