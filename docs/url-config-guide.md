# Deep Research URL参数配置指南

## 概述

Deep Research 支持通过URL参数预配置应用设置，让您可以快速启动带有特定配置的研究环境。

## 支持的URL参数

### AI提供商配置
- `provider`: AI厂商名称
  - 可选值：`google`, `openai`, `anthropic`, `deepseek`, `xai`, `mistral`, `azure`, `openrouter`, `openaicompatible`, `pollinations`, `ollama`
- `apiKey`: API密钥
- `thinkingModel`: 思考模型名称
- `taskModel`: 任务模型名称（对应networkingModel）

### 认证配置
- `jwt`: JWT令牌，用于数据中心认证
- `accessPassword`: 访问密码
- `topicId`: 话题ID，用于加载历史记录

### 搜索配置
- `searchProvider`: 搜索提供商
  - 可选值：`model`, `tavily`, `firecrawl`, `exa`, `bocha`, `searxng`
- `searchMaxResult`: 最大搜索结果数（数字）

### 界面配置
- `language`: 界面语言
  - 可选值：`zh-CN`, `en-US`, `es-ES`
- `theme`: 主题
  - 可选值：`system`, `light`, `dark`
- `mode`: 模式

## 使用示例

### 基础配置示例
```
https://your-domain.com/?provider=google&apiKey=AIzaSy...&thinkingModel=gemini-2.0-flash-thinking-exp&taskModel=gemini-2.0-flash-exp&language=zh-CN
```

### 包含JWT认证的示例
```
https://your-domain.com/?provider=deepseek&apiKey=sk-...&jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...&topicId=topic-123&language=zh-CN
```

### 完整配置示例
```
https://your-domain.com/?provider=openai&apiKey=sk-...&thinkingModel=gpt-4o&taskModel=gpt-4o-mini&searchProvider=tavily&searchMaxResult=10&language=zh-CN&theme=dark&jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...&topicId=topic-456
```

## 安全注意事项

1. **敏感信息自动清理**: API密钥和JWT令牌等敏感信息会在页面加载后自动从URL中清除，避免在浏览器历史记录中暴露。

2. **HTTPS推荐**: 建议在生产环境中使用HTTPS，确保URL参数在传输过程中的安全性。

3. **令牌时效性**: JWT令牌应设置合理的过期时间，避免长期有效的令牌被滥用。

## 配置URL生成器

在应用的设置页面中，您可以找到"配置URL"标签页，其中包含了一个图形化的配置URL生成器，帮助您：

1. 选择AI提供商和模型
2. 配置认证信息
3. 设置搜索选项
4. 生成完整的配置URL
5. 一键复制或在新窗口中打开

## 环境变量配置

如果您需要设置默认的数据中心URL，可以在环境变量中配置：

```bash
# 数据中心基础URL
NEXT_PUBLIC_DATA_CENTER_URL=https://your-data-center.com
```

## 数据中心集成

当提供了`jwt`和`topicId`参数时，应用会自动：

1. 使用JWT令牌进行认证
2. 从数据中心加载指定话题的历史记录
3. 恢复之前的研究状态

数据中心API需要支持以下端点：

- `GET /api/topics/{topicId}/history` - 获取话题历史记录
- `GET /api/topics` - 获取话题列表
- `POST /api/topics/{topicId}/research` - 保存研究结果
- `GET /api/auth/validate` - 验证JWT令牌

## 故障排除

### 参数没有生效
- 检查参数名称是否正确
- 确认参数值是否在允许的范围内
- 查看浏览器控制台是否有错误信息

### JWT认证失败
- 检查JWT令牌格式是否正确
- 确认数据中心URL是否配置正确
- 验证令牌是否已过期

### 历史记录加载失败
- 确认topicId是否存在
- 检查数据中心API是否可访问
- 验证JWT令牌是否有对应权限
