# 快速使用指南

## 问题解决方案

我们已经实现了详细的日志记录和错误透传机制，帮助你解决 final-report 文档内容过少和未完成的问题。

## 立即使用

### 1. 日志已自动启用
所有改进的日志记录功能已经自动集成到系统中，无需额外配置。

### 2. 查看详细日志
现在你可以看到：
- 每个大模型调用的详细信息
- 模型配置和创建过程
- 输入输出的长度和预览
- 执行时间统计
- 错误详情和堆栈

### 3. 错误透传到客户端
当大模型不可用时，错误信息会通过SSE直接发送到前端，包含：
- 具体的错误信息
- 相关的配置信息
- 唯一的请求ID用于追踪

## 关键文件

1. **`src/utils/logger.ts`** - 新的日志工具类
2. **`src/utils/deep-research/index.ts`** - 深度研究核心逻辑（已添加详细日志）
3. **`src/utils/deep-research/provider.ts`** - AI提供商创建（已添加详细日志）
4. **`src/app/api/sse/live/route.ts`** - SSE接口（已改进错误透传）

## 测试功能

### Node.js环境测试
```bash
node test-logger.cjs
```

### 浏览器环境测试
打开 `test-logger-browser.html` 文件

## 问题排查

现在当 final-report 出现问题时，你可以：

1. **查看控制台日志** - 找到 `[ERROR]` 标记的日志
2. **搜索请求ID** - 每个请求都有唯一ID用于追踪
3. **检查模型配置** - 查看AI提供商和模型配置是否正确
4. **分析调用链路** - 查看每个步骤的执行情况

## 日志示例

### 成功情况
```
2025-07-30T10:15:35.456Z [INFO][Node] [DeepResearch] LLM Call: writeFinalReport | Data: {"config":{"model":"gemini-2.5-pro-preview-06-05"},"input":{"promptLength":25000,"learningsCount":8},"output":{"contentLength":3500},"duration":3000}
```

### 失败情况
```
2025-07-30T10:15:30.123Z [ERROR][Node] [AI-Provider] Failed to create AI provider | Data: {"error":"当前分组 default 下对于模型 gemini-2.5-pro-preview-06-05 无可用渠道"}
```

## 下一步

系统现在会自动记录详细的调试信息，你可以：
1. 重新运行有问题的查询
2. 查看详细的日志输出
3. 根据日志信息定位具体问题
4. 检查大模型配置和API密钥

所有改进都已集成到现有系统中，无需修改任何现有代码。