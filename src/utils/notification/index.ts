/**
 * 统一通知服务
 * 独立可复用的通知系统，支持多种通知渠道
 * 
 * 支持的通知渠道：
 * - 企业微信 Webhook
 * - 飞书 Webhook  
 * - Telegram Bot
 * - Bark (iOS)
 * - PushDeer
 * - 邮件 (SMTP)
 * - 通用 Webhook
 */

import { NotificationConfig, NotificationMessage, NotificationResult, NotificationChannel, DeduplicationEntry } from './types';
import { WeChatWorkChannel } from './channels/wechat-work';
import { FeishuChannel } from './channels/feishu';
import { TelegramChannel } from './channels/telegram';
import { BarkChannel } from './channels/bark';
import { PushDeerChannel } from './channels/pushdeer';
import { EmailChannel } from './channels/email';
import { WebhookChannel } from './channels/webhook';

export class NotificationService {
  private config: NotificationConfig;
  private channels: NotificationChannel[] = [];
  private deduplicationCache = new Map<string, DeduplicationEntry>();
  private lastCleanup = Date.now();
  private isBrowserEnvironment: boolean;

  constructor(config: NotificationConfig) {
    // 检测浏览器环境
    this.isBrowserEnvironment = typeof window !== 'undefined' && typeof process === 'undefined';
    
    // 如果是浏览器环境，禁用通知系统
    if (this.isBrowserEnvironment) {
      this.config = { ...config, enabled: false };
      console.log('[NotificationService] Browser environment detected, notifications disabled');
      return;
    }
    
    this.config = config;
    this.initializeChannels();
    
    // 定期清理去重缓存（仅在 Node.js 环境下）
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.cleanupDeduplicationCache(), 5 * 60 * 1000); // 每5分钟清理一次
    }
  }

  /**
   * 发送通知（阻塞式）
   */
  async send(message: NotificationMessage): Promise<NotificationResult[]> {
    if (!this.config.enabled || this.isBrowserEnvironment) {
      return [];
    }

    // 添加时间戳
    if (!message.timestamp) {
      message.timestamp = new Date().toISOString();
    }

    // 去重检查
    if (this.config.deduplication.enabled && this.isDuplicate(message)) {
      console.log(`[NotificationService] Message deduplicated: ${message.title}`);
      return [];
    }

    const results: NotificationResult[] = [];
    
    // 并发发送到所有启用的渠道
    const sendPromises = this.channels
      .filter(channel => channel.enabled)
      .map(async (channel) => {
        const result: NotificationResult = {
          success: false,
          channel: channel.name,
          timestamp: new Date().toISOString()
        };

        try {
          const success = await channel.send(message);
          result.success = success;
          if (success) {
            result.message = 'Sent successfully';
          } else {
            result.error = 'Channel returned false';
          }
        } catch (error) {
          result.error = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[NotificationService] ${channel.name} failed:`, error instanceof Error ? error : new Error(String(error)));
        }

        return result;
      });

    const channelResults = await Promise.allSettled(sendPromises);
    
    channelResults.forEach((promiseResult, index) => {
      if (promiseResult.status === 'fulfilled') {
        results.push(promiseResult.value);
      } else {
        results.push({
          success: false,
          channel: this.channels[index]?.name || 'unknown',
          error: promiseResult.reason?.message || 'Promise rejected',
          timestamp: new Date().toISOString()
        });
      }
    });

    // 记录发送统计
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    
    console.log(`[NotificationService] Sent to ${successCount}/${results.length} channels. Failed: ${failCount}`);

    return results;
  }

  /**
   * 异步非阻塞发送通知（推荐在生产环境中使用）
   * 不会阻塞主进程，通知发送在后台进行
   */
  sendAsync(message: NotificationMessage): void {
    // 使用 setImmediate 或 Promise.resolve().then() 确保异步执行
    Promise.resolve().then(async () => {
      try {
        const results = await this.send(message);
        const successCount = results.filter(r => r.success).length;
        const failCount = results.length - successCount;
        
        if (failCount > 0) {
          console.warn(`[NotificationService] Async notification partially failed. Success: ${successCount}, Failed: ${failCount}`);
        }
      } catch (error) {
        console.error('[NotificationService] Async notification failed:', error instanceof Error ? error : new Error(String(error)));
      }
    }).catch(error => {
      console.error('[NotificationService] Critical error in async notification:', error instanceof Error ? error : new Error(String(error)));
    });
  }

  /**
   * 发送API欠费通知的便捷方法（阻塞式）
   */
  async sendApiCreditAlert(provider: string, error: string, additionalInfo?: Record<string, any>): Promise<NotificationResult[]> {
    const message: NotificationMessage = {
      title: `API 余额不足警告 - ${provider}`,
      content: `API 提供商 ${provider} 余额不足。

错误详情：
${error}`,
      level: 'critical',
      source: 'Deep Research API Monitor',
      tags: ['api-credit', 'urgent', provider.toLowerCase()],
      extra: {
        provider,
        error,
        detectedAt: new Date().toISOString(),
        ...additionalInfo
      }
    };

    return this.send(message);
  }

  /**
   * 异步非阻塞发送API欠费通知的便捷方法（推荐使用）
   */
  sendApiCreditAlertAsync(provider: string, error: string, additionalInfo?: Record<string, any>): void {
    // 浏览器环境下直接返回
    if (this.isBrowserEnvironment) {
      return;
    }
    
    const message: NotificationMessage = {
      title: `API 余额不足警告 - ${provider}`,
      content: `API 提供商 ${provider} 余额不足。

错误详情：
${error}`,
      level: 'critical',
      source: 'Deep Research API Monitor',
      tags: ['api-credit', 'urgent', provider.toLowerCase()],
      extra: {
        provider,
        error,
        detectedAt: new Date().toISOString(),
        ...additionalInfo
      }
    };

    this.sendAsync(message);
  }

  /**
   * 发送搜索API欠费通知的便捷方法（阻塞式）
   */
  async sendSearchApiCreditAlert(provider: string, error: string, additionalInfo?: Record<string, any>): Promise<NotificationResult[]> {
    const message: NotificationMessage = {
      title: `🔍 搜索API余额不足警告 - ${provider}`,
      content: `搜索API提供商 ${provider} 余额不足，已自动切换到其他可用的搜索服务。

错误详情：
${error}`,
      level: 'critical',
      source: 'Deep Research Search Monitor',
      tags: ['search-api-credit', 'urgent', provider.toLowerCase()],
      extra: {
        provider,
        error,
        detectedAt: new Date().toISOString(),
        apiType: 'search',
        ...additionalInfo
      }
    };

    return this.send(message);
  }

  /**
   * 异步非阻塞发送搜索API欠费通知的便捷方法（推荐使用）
   */
  sendSearchApiCreditAlertAsync(provider: string, error: string, additionalInfo?: Record<string, any>): void {
    // 浏览器环境下直接返回
    if (this.isBrowserEnvironment) {
      return;
    }
    
    const message: NotificationMessage = {
      title: `🔍 搜索API余额不足警告 - ${provider}`,
      content: `搜索API提供商 ${provider} 余额不足，已自动切换到其他可用的搜索服务。

错误详情：
${error}`,
      level: 'critical',
      source: 'Deep Research Search Monitor',
      tags: ['search-api-credit', 'urgent', provider.toLowerCase()],
      extra: {
        provider,
        error,
        detectedAt: new Date().toISOString(),
        apiType: 'search',
        ...additionalInfo
      }
    };

    this.sendAsync(message);
  }

  /**
   * 发送搜索API全部不可用的紧急通知
   */
  sendSearchApiAllFailedAlertAsync(providers: string[], lastError: string, additionalInfo?: Record<string, any>): void {
    // 浏览器环境下直接返回
    if (this.isBrowserEnvironment) {
      return;
    }
    
    const message: NotificationMessage = {
      title: `🚨 所有搜索API服务不可用`,
      content: `所有配置的搜索API服务 (${providers.join(', ')}) 都已不可用，无法继续进行网络搜索。

请检查以下事项：
1. 各搜索API的余额是否充足
2. API密钥是否正确
3. 网络连接是否正常

最后错误：
${lastError}`,
      level: 'critical',
      source: 'Deep Research Search Monitor',
      tags: ['search-api-critical', 'urgent', 'all-failed'],
      extra: {
        providers,
        lastError,
        detectedAt: new Date().toISOString(),
        apiType: 'search',
        totalProviders: providers.length,
        ...additionalInfo
      }
    };

    this.sendAsync(message);
  }

  /**
   * 检测API错误是否为欠费问题
   */
  static isApiCreditError(error: string): boolean {
    const creditErrorKeywords = [
      'credit', 'credits', 'balance', 'quota', 'billing',
      'payment', 'insufficient', 'afford', 'limit exceeded',
      'usage limit', 'plan limit', 'exceeds.*plan.*limit', 'exceeds.*usage.*limit',
      'set usage limit', 'plan\'s set usage limit', // Tavily 特定错误
      'rate limit', 'monthly limit', 'daily limit',
      '余额', '欠费', '配额', '超出', '不足', '使用限制', '计划限制'
    ];
    
    // Tavily特定的432状态码错误模式
    const tavilyErrorPatterns = [
      /tavily.*432/i,
      /failed:?\s*432/i,
      /status\s*432/i,
      /http\s*432/i
    ];
    
    const errorLower = error.toLowerCase();
    
    // 首先检查Tavily 432错误模式
    if (tavilyErrorPatterns.some(pattern => pattern.test(error))) {
      return true;
    }
    
    // 支持正则表达式匹配和普通字符串匹配
    return creditErrorKeywords.some(keyword => {
      if (keyword.includes('.*')) {
        // 正则表达式匹配
        try {
          const regex = new RegExp(keyword, 'i');
          return regex.test(error);
        } catch {
          // 如果正则表达式无效，回退到字符串匹配
          return errorLower.includes(keyword.replace(/\.\*/g, ''));
        }
      }
      // 普通字符串匹配
      return errorLower.includes(keyword);
    });
  }

  /**
   * 获取渠道状态
   */
  getChannelStatus(): Array<{ name: string; type: string; enabled: boolean; configured: boolean }> {
    if (this.isBrowserEnvironment) {
      return [];
    }
    return this.channels.map(channel => ({
      name: channel.name,
      type: channel.type,
      enabled: channel.enabled,
      configured: this.isChannelConfigured(channel)
    }));
  }

  /**
   * 测试所有渠道
   */
  async testAllChannels(): Promise<NotificationResult[]> {
    if (this.isBrowserEnvironment) {
      return [];
    }
    const testMessage: NotificationMessage = {
      title: '通知系统测试',
      content: `这是一条测试消息，用于验证通知渠道是否正常工作。

发送时间: ${new Date().toLocaleString('zh-CN')}
测试ID: test-${Date.now()}`,
      level: 'info',
      source: 'Notification System Test',
      tags: ['test']
    };

    return this.send(testMessage);
  }

  /**
   * 初始化通知渠道
   */
  private initializeChannels(): void {
    const { channels } = this.config;

    // 企业微信
    if (channels.wechatWork?.enabled && channels.wechatWork.webhook) {
      this.channels.push(new WeChatWorkChannel({
        webhook: channels.wechatWork.webhook,
        enabled: channels.wechatWork.enabled,
        retryAttempts: channels.wechatWork.retryAttempts || this.config.retryAttempts
      }));
    }

    // 飞书
    if (channels.feishu?.enabled && channels.feishu.webhook) {
      this.channels.push(new FeishuChannel({
        webhook: channels.feishu.webhook,
        enabled: channels.feishu.enabled,
        retryAttempts: channels.feishu.retryAttempts || this.config.retryAttempts
      }));
    }

    // Telegram
    if (channels.telegram?.enabled && channels.telegram.botToken && channels.telegram.chatId) {
      this.channels.push(new TelegramChannel({
        botToken: channels.telegram.botToken,
        chatId: channels.telegram.chatId,
        enabled: channels.telegram.enabled,
        retryAttempts: channels.telegram.retryAttempts || this.config.retryAttempts
      }));
    }

    // Bark
    if (channels.bark?.enabled && channels.bark.server && channels.bark.deviceKey) {
      this.channels.push(new BarkChannel({
        server: channels.bark.server,
        deviceKey: channels.bark.deviceKey,
        enabled: channels.bark.enabled,
        retryAttempts: channels.bark.retryAttempts || this.config.retryAttempts
      }));
    }

    // PushDeer
    if (channels.pushdeer?.enabled && channels.pushdeer.pushkey) {
      this.channels.push(new PushDeerChannel({
        pushkey: channels.pushdeer.pushkey,
        server: channels.pushdeer.server,
        enabled: channels.pushdeer.enabled,
        retryAttempts: channels.pushdeer.retryAttempts || this.config.retryAttempts
      }));
    }

    // 邮件
    if (channels.email?.enabled && channels.email.smtp && channels.email.to.length > 0) {
      this.channels.push(new EmailChannel({
        smtp: channels.email.smtp,
        from: channels.email.from,
        to: channels.email.to,
        enabled: channels.email.enabled,
        retryAttempts: channels.email.retryAttempts || this.config.retryAttempts
      }));
    }

    // Webhook
    if (channels.webhook?.enabled && channels.webhook.url) {
      this.channels.push(new WebhookChannel({
        url: channels.webhook.url,
        method: channels.webhook.method,
        headers: channels.webhook.headers,
        enabled: channels.webhook.enabled,
        retryAttempts: channels.webhook.retryAttempts || this.config.retryAttempts
      }));
    }

    console.log(`[NotificationService] Initialized ${this.channels.length} channels`);
  }

  /**
   * 检查渠道是否已正确配置
   */
  private isChannelConfigured(channel: NotificationChannel): boolean {
    try {
      const config = channel.config;
      
      switch (channel.type) {
        case 'wechat-work':
        case 'feishu':
          return !!(config as any).webhook;
        case 'telegram':
          return !!(config as any).botToken && !!(config as any).chatId;
        case 'bark':
          return !!(config as any).server && !!(config as any).deviceKey;
        case 'pushdeer':
          return !!(config as any).pushkey;
        case 'email':
          return !!(config as any).smtp && (config as any).to?.length > 0;
        case 'webhook':
          return !!(config as any).url;
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * 去重检查
   */
  private isDuplicate(message: NotificationMessage): boolean {
    const key = this.config.deduplication.keyGenerator 
      ? this.config.deduplication.keyGenerator(message)
      : `${message.title}-${message.level}`;
    
    const now = Date.now();
    const windowMs = this.config.deduplication.windowMinutes * 60 * 1000;
    
    const existing = this.deduplicationCache.get(key);
    if (existing && (now - existing.timestamp) < windowMs) {
      // 更新计数
      existing.count++;
      existing.timestamp = now;
      return true;
    }
    
    // 记录新消息
    this.deduplicationCache.set(key, {
      key,
      timestamp: now,
      count: 1
    });
    
    return false;
  }

  /**
   * 清理过期的去重缓存
   */
  private cleanupDeduplicationCache(): void {
    if (this.isBrowserEnvironment) {
      return;
    }
    
    const now = Date.now();
    const windowMs = this.config.deduplication.windowMinutes * 60 * 1000;
    
    this.deduplicationCache.forEach((entry, key) => {
      if (now - entry.timestamp > windowMs) {
        this.deduplicationCache.delete(key);
      }
    });
    
    this.lastCleanup = now;
  }
}

// 导出所有类型和类
export * from './types';
export { WeChatWorkChannel } from './channels/wechat-work';
export { FeishuChannel } from './channels/feishu';
export { TelegramChannel } from './channels/telegram';
export { BarkChannel } from './channels/bark';
export { PushDeerChannel } from './channels/pushdeer';
export { EmailChannel } from './channels/email';
export { WebhookChannel } from './channels/webhook';