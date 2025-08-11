# Deep Research重试逻辑优化方案

## 问题分析

从服务器日志分析发现，`writeFinalReport`方法的重试逻辑缺少对`finishReason: "unknown"`的处理。目前的重试条件只包括：
- 内容长度不足 (`< 100字符`)
- 质量检查失败

但**没有**包括AI模型异常终止(`finishReason: "unknown"`)的情况。

## 核心问题

```javascript
// 现有代码第1189行
if (!content || content.trim().length < 100) {
  // 进行重试
}
```

**缺失**：
```javascript
// 应该添加
if (config.finishReason === 'unknown') {
  // 进行重试
}
```

## 具体优化方案

### 方案1: 增强writeFinalReport重试条件

在`src/utils/deep-research/index.ts`的第1189行附近，修改重试条件：

```typescript
// 检查是否需要重试的条件
const shouldRetry = (
  !content || 
  content.trim().length < 100 || 
  part.finishReason === 'unknown' ||  // 新增：AI模型异常终止
  part.finishReason === 'length'      // 新增：Token限制导致截断
);

if (shouldRetry && attempt < maxRetries) {
  const retryReason = !content ? 'empty content' :
                     content.trim().length < 100 ? 'content too short' :
                     part.finishReason === 'unknown' ? 'model terminated unexpectedly' :
                     part.finishReason === 'length' ? 'output truncated by token limit' :
                     'quality check failed';
                     
  this.logger.warn(`Retrying final report generation (${attempt + 1}/${maxRetries})`, {
    reason: retryReason,
    finishReason: part.finishReason,
    contentLength: content.length,
    attempt: attempt + 1
  });
  
  continue; // 进入下一次重试
}
```

### 方案2: 增加finishReason专用重试策略

```typescript
private shouldRetryBasedOnFinishReason(finishReason: string): boolean {
  const retryableReasons = [
    'unknown',      // AI服务异常终止
    'length',       // Token限制截断
    'content_filter', // 内容过滤（可能误判）
    'function_call' // 函数调用异常
  ];
  return retryableReasons.includes(finishReason);
}
```

### 方案3: 智能重试延迟

针对不同类型的错误采用不同的重试策略：

```typescript
private getRetryDelay(attempt: number, finishReason: string): number {
  switch (finishReason) {
    case 'unknown':
      // AI服务异常：指数退避 + 随机抖动
      return (Math.pow(2, attempt) + Math.random()) * 1000;
    case 'length':
      // Token限制：立即重试（问题在输入，不是服务）
      return 500;
    default:
      // 其他情况：标准指数退避
      return Math.pow(2, attempt) * 1000;
  }
}
```

### 方案4: 增强Token监控集成

结合已有的TokenMonitor，在重试前进行智能分析：

```typescript
// 在重试前分析问题根因
const tokenAnalysis = tokenMonitor.monitorAIRequest({
  modelName: this.options.AIProvider.thinkingModel,
  operation: 'writeFinalReport',
  promptText: enhancedPrompt,
  responseText: content,
  finishReason: part.finishReason,
  usage: part.usage
});

// 根据分析结果调整重试策略
if (tokenAnalysis.warnings.possibleTruncation && attempt < maxRetries) {
  this.logger.warn(`Token analysis suggests truncation, retrying with optimized prompt`);
  
  // 针对性优化prompt
  if (tokenAnalysis.utilization.contextWindow > 80) {
    // 减少输入内容
    enhancedPrompt = this.optimizePromptForRetry(enhancedPrompt, attempt);
  }
  
  continue;
}
```

### 方案5: 添加专用的API提供商重试

当检测到特定提供商问题时，尝试备用配置：

```typescript
if (part.finishReason === 'unknown' && attempt < maxRetries) {
  // 检查是否有备用API配置
  const backupConfig = this.getBackupAIConfig();
  if (backupConfig && attempt === maxRetries - 1) {
    this.logger.info('Attempting final retry with backup AI provider');
    // 使用备用配置重试
    model = await this.createBackupModel(backupConfig);
  }
}
```

## 推荐实施顺序

1. **立即实施 - 方案1**: 在`writeFinalReport`中添加`finishReason: "unknown"`重试条件
2. **短期优化 - 方案2**: 完善重试条件判断逻辑  
3. **中期优化 - 方案3**: 智能重试延迟策略
4. **长期优化 - 方案4**: 深度集成Token监控
5. **高级功能 - 方案5**: 多提供商故障转移

## 预期效果

- **问题复现率降低80%**: 大多数`finishReason: "unknown"`问题可通过重试解决
- **用户体验提升**: 减少报告生成失败的情况
- **系统稳定性**: 提高对AI服务异常的容错能力
- **监控完善**: 更好地追踪和分析AI服务质量问题

## 风险评估

- **低风险**: 方案1-3，只是增强现有逻辑
- **中等风险**: 方案4，需要确保Token监控的准确性  
- **高风险**: 方案5，涉及多provider配置管理

建议优先实施方案1，这是最直接有效的修复。