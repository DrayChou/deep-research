# 通知系统 (Notification System)

独立的通知服务，支持多种通知渠道，可以轻松复制到其他项目中使用。

## 功能特性

- 🚀 **异步非阻塞** - 支持异步发送，不会阻塞主进程
- 🔄 **自动重试** - 支持失败自动重试机制
- 🔒 **去重保护** - 相同消息在指定时间窗口内只发送一次
- 🌐 **多渠道支持** - 支持7种通知渠道
- ⚙️ **环境变量配置** - 完全基于环境变量的配置系统
- 📊 **统计日志** - 详细的发送统计和错误日志

## 支持的通知渠道

| 渠道 | 类型 | 环境变量 | 说明 | 日志级别支持 |
|-----|------|----------|------|------------|
| 企业微信 | `wechat-work` | `WECHAT_WORK_WEBHOOK` | 企业微信群机器人 | ✅ 颜色标记 |
| 飞书 | `feishu` | `FEISHU_WEBHOOK` | 飞书群机器人 | ✅ 卡片颜色 |
| Telegram | `telegram` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Telegram Bot | ✅ 静音控制 |
| Bark | `bark` | `BARK_DEVICE_KEY` | iOS 推送通知 | ✅ 完整支持 |
| PushDeer | `pushdeer` | `PUSHDEER_PUSH_KEY` | 跨平台推送 | ✅ 标记区分 |
| 邮件 | `email` | `SMTP_HOST`, `SMTP_USER`, `EMAIL_TO` | SMTP 邮件 | ✅ HTML 格式 |
| Webhook | `webhook` | `WEBHOOK_URL` | 通用 HTTP Webhook | ✅ 标准化 |

### 日志级别功能说明

所有渠道都支持 4 个日志级别，每个级别有不同的表现：

- **`info`**: 📝 信息级别 - 一般通知，不紧急
- **`warning`**: ⚠️ 警告级别 - 需要关注但不紧急  
- **`error`**: ❌ 错误级别 - 需要立即处理
- **`critical`**: 🚨 紧急级别 - 最高优先级，绕过静音

#### Bark 特殊功能
- `critical`: 使用 `level=critical` 绕过勿扰模式
- `warning`: 使用 `level=timeSensitive` 可在专注模式显示
- `error/info`: 使用 `level=active` 立即显示
- 自动设置不同声音：`alarm`, `multiwayinvitation`, `healthnotification`, `birdsong`
- 支持自定义图标、分组、角标、跳转链接

#### Telegram 特殊功能
- `critical/error`: 正常发送，有声音通知
- `info`: 静默发送 (`disable_notification=true`)
- 支持内联键盘按钮（当有 URL 时）
- Markdown 格式化消息

#### 飞书特殊功能
- 交互式卡片格式，美观易读
- 根据级别设置不同卡片颜色模板（蓝色/橙色/红色）
- 支持链接按钮（warning 和 critical 级别）
- 结构化字段显示（级别、时间、来源、分组）
- Markdown 文本格式化

## 快速开始

### 1. 复制文件

将整个 `notification` 文件夹复制到您的项目中：

```
src/utils/notification/
├── index.ts              # 主服务类
├── types.ts              # 类型定义
├── config.ts             # 配置系统
├── config.example.ts     # 配置示例
├── channels/             # 通知渠道实现
│   ├── wechat-work.ts
│   ├── feishu.ts
│   ├── telegram.ts
│   ├── bark.ts
│   ├── pushdeer.ts
│   ├── email.ts
│   └── webhook.ts
└── README.md            # 本文档
```

### 2. 环境变量配置

在您的 `.env` 文件中添加配置：

```bash
# 通知系统总开关
NOTIFICATION_ENABLED=true

# 选择启用的通知渠道（可选择多个，逗号分隔）
# 可选值: wechat-work, feishu, telegram, bark, pushdeer, email, webhook
NOTIFICATION_CHANNELS=feishu,bark,telegram

# 飞书机器人配置
FEISHU_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_HOOK_ID

# Bark iOS 推送配置
BARK_SERVER=https://api.day.app
BARK_DEVICE_KEY=YOUR_DEVICE_KEY

# Telegram Bot 配置
TELEGRAM_BOT_TOKEN=1234567890:AABBCCDDEEFFgghhiijjkkllmmnnooppqqrr
TELEGRAM_CHAT_ID=-1001234567890

# 邮件 SMTP 配置
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=Your App <your-email@gmail.com>
EMAIL_TO=admin@example.com,ops@example.com
```

完整的环境变量配置请参考项目根目录下的配置文件：
- `.env.notification.example` - 完整多渠道配置
- `.env.bark.example` - Bark 专用配置  
- `.env.feishu.example` - 飞书专用配置

### 3. 基本使用

```typescript
import { NotificationService } from './utils/notification';
import { notificationConfig } from './utils/notification/config';

// 创建通知服务实例
const notificationService = new NotificationService(notificationConfig);

// 发送通知（异步非阻塞，推荐）
notificationService.sendAsync({
  title: 'API 错误警告',
  content: '检测到 API 调用失败，请检查服务状态',
  level: 'error',
  tags: ['api', 'error'],
  group: 'api-monitoring', // 分组
  url: 'https://dashboard.example.com/logs', // 跳转链接
  sound: 'alarm', // 自定义声音（Bark）
  badge: 1 // 角标数字（Bark）
});

// 发送不同级别的通知
notificationService.sendAsync({
  title: '系统维护通知',
  content: '系统将于今晚进行维护，预计持续2小时',
  level: 'warning', // 警告级别
  tags: ['maintenance']
});

notificationService.sendAsync({
  title: '紧急故障',
  content: '服务器宕机，需要立即处理',
  level: 'critical', // 紧急级别，绕过静音
  url: 'https://monitoring.example.com/alerts/123'
});

// 发送 API 欠费警报（异步非阻塞）
notificationService.sendApiCreditAlertAsync('OpenAI', '余额不足，请充值');

// 测试所有渠道
const testResults = await notificationService.testAllChannels();
console.log('测试结果:', testResults);
```

## API 参考

### NotificationService

#### 构造函数

```typescript
constructor(config: NotificationConfig)
```

#### 方法

##### sendAsync(message: NotificationMessage): void

异步非阻塞发送通知，推荐在生产环境中使用。

```typescript
notificationService.sendAsync({
  title: '标题',
  content: '消息内容',
  level: 'info' | 'warning' | 'error' | 'critical',
  source: '来源系统',
  tags: ['tag1', 'tag2'],
  extra: { key: 'value' }
});
```

##### send(message: NotificationMessage): Promise\<NotificationResult[]\>

同步发送通知，等待所有渠道完成。

##### sendApiCreditAlertAsync(provider: string, error: string, additionalInfo?: Record<string, any>): void

异步发送 API 欠费警报的便捷方法。

##### testAllChannels(): Promise\<NotificationResult[]\>

测试所有启用的通知渠道。

##### getChannelStatus(): Array\<{name: string; type: string; enabled: boolean; configured: boolean}\>

获取所有渠道的状态信息。

#### 静态方法

##### NotificationService.isApiCreditError(error: string): boolean

检测错误消息是否为 API 欠费相关错误。

### 消息格式

```typescript
interface NotificationMessage {
  title: string;                    // 通知标题
  content: string;                  // 通知内容
  level: 'info' | 'warning' | 'error' | 'critical';  // 消息级别
  source?: string;                  // 来源系统
  tags?: string[];                  // 标签
  timestamp?: string;               // 时间戳
  extra?: Record<string, any>;      // 额外信息
  
  // 扩展参数（各渠道支持程度不同）
  sound?: string;                   // 声音文件名或URL（主要用于Bark）
  icon?: string;                    // 图标URL（Bark支持）
  group?: string;                   // 分组名称（多数渠道支持）
  badge?: number;                   // 角标数字（Bark支持）
  url?: string;                     // 点击跳转URL（多数渠道支持）
}
```

## 环境变量详细配置

### 全局配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `NOTIFICATION_ENABLED` | `true` | 通知系统总开关 |
| `NOTIFICATION_CHANNELS` | - | 启用的渠道列表（逗号分隔） |
| `NOTIFICATION_RETRY_ATTEMPTS` | `3` | 重试次数 |
| `NOTIFICATION_DEDUP_ENABLED` | `true` | 启用去重 |
| `NOTIFICATION_DEDUP_WINDOW` | `30` | 去重时间窗口（分钟） |

### 各渠道配置

#### 企业微信 (wechat-work)
```bash
WECHAT_WORK_WEBHOOK=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY
WECHAT_WORK_RETRY_ATTEMPTS=3  # 可选
```

#### 飞书 (feishu)
```bash
FEISHU_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_HOOK_ID
FEISHU_RETRY_ATTEMPTS=3  # 可选
```

#### Telegram (telegram)
```bash
TELEGRAM_BOT_TOKEN=1234567890:AABBCCDDEEFFgghhiijjkkllmmnnooppqqrr
TELEGRAM_CHAT_ID=-1001234567890  # 可以是个人ID或群组ID
TELEGRAM_RETRY_ATTEMPTS=3  # 可选
```

#### Bark (bark)
```bash
BARK_SERVER=https://api.day.app  # 可选，支持自建服务器，默认官方服务器
BARK_DEVICE_KEY=YOUR_DEVICE_KEY
BARK_RETRY_ATTEMPTS=3  # 可选

# Bark 高级功能说明
# - 支持 level: active(默认)、timeSensitive(时间敏感)、critical(紧急)
# - 支持自定义声音: alarm、multiwayinvitation、healthnotification、birdsong 等
# - 支持自定义图标 URL
# - 支持分组管理
# - 支持角标数字
# - 支持点击跳转 URL
```

#### PushDeer (pushdeer)
```bash
PUSHDEER_SERVER=https://api2.pushdeer.com  # 可选，支持自建服务器，默认官方服务器
PUSHDEER_PUSH_KEY=YOUR_PUSH_KEY
PUSHDEER_RETRY_ATTEMPTS=3  # 可选

# PushDeer 功能说明
# - 支持 Markdown 格式
# - 自动识别并添加链接按钮
# - 根据级别添加特殊标记
# - 跨平台推送（iOS、Android、macOS、Windows）
```

#### 邮件 (email)
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587  # 可选，默认587
SMTP_SECURE=false  # 可选，默认false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=Deep Research <your-email@gmail.com>  # 可选，默认使用SMTP_USER
EMAIL_TO=admin@example.com,ops@example.com  # 多个收件人用逗号分隔
EMAIL_RETRY_ATTEMPTS=3  # 可选
```

#### 通用 Webhook (webhook)
```bash
WEBHOOK_URL=https://your-webhook-endpoint.com/notify
WEBHOOK_METHOD=POST  # 可选，默认POST
WEBHOOK_HEADERS={"Authorization":"Bearer TOKEN"}  # 可选，JSON格式
WEBHOOK_RETRY_ATTEMPTS=3  # 可选
```

## 在其他项目中使用

### 1. Node.js 项目

直接复制 `notification` 文件夹到您的项目中，然后按照上面的方式使用。

### 2. Next.js 项目

如果在浏览器环境中使用邮件通知，需要创建 API 路由：

```typescript
// pages/api/send-email.ts 或 app/api/send-email/route.ts
import { NextApiRequest, NextApiResponse } from 'next';
import nodemailer from 'nodemailer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 处理邮件发送逻辑
  // ...
}
```

### 3. 其他框架

根据您的框架调整导入路径和依赖项，核心逻辑保持不变。

## 注意事项

1. **邮件通知**: 在浏览器环境中需要通过 API 代理发送
2. **环境变量**: 确保在生产环境中正确设置所有必要的环境变量
3. **API 密钥安全**: 不要在客户端代码中暴露 API 密钥
4. **网络环境**: 某些通知渠道可能需要特定的网络环境（如 Telegram）
5. **异步非阻塞**: 推荐使用 `sendAsync` 方法，避免阻塞主进程

## 故障排除

### 通知没有发送

1. 检查 `NOTIFICATION_ENABLED` 是否为 `true`
2. 检查 `NOTIFICATION_CHANNELS` 是否包含目标渠道
3. 检查对应渠道的必要环境变量是否正确设置
4. 查看控制台日志了解具体错误信息

### 部分渠道失败

1. 使用 `getChannelStatus()` 检查渠道状态
2. 使用 `testAllChannels()` 测试所有渠道
3. 检查网络连接和防火墙设置
4. 验证 API 密钥和配置的有效性

## 许可证

MIT License - 可以自由使用、修改和分发。