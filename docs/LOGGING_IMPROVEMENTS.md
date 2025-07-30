# 日志改进和错误透传功能

## 概述

为了解决 final-report 文档内容过少和未完成的问题，我们实现了详细的日志记录系统和错误透传机制。该系统同时支持浏览器和Node.js环境。

## 主要改进

### 1. 结构化日志记录

#### 新增日志工具类 (`src/utils/logger.ts`)
- **跨环境支持**：同时支持浏览器和Node.js环境
- **日志级别控制**：DEBUG, INFO, WARN, ERROR
- **环境自动检测**：自动识别运行环境并添加相应标记
- **本地存储**：浏览器环境下支持日志本地存储
- **自动时间戳和上下文管理**
- **数据截断功能**：避免日志过长
- **专门的大模型调用日志记录方法**

#### 日志记录功能
```typescript
// 基础日志记录
logger.debug('调试信息', { data: value });
logger.info('一般信息', { status: 'success' });
logger.warn('警告信息', { warning: 'something' });
logger.error('错误信息', error, { context: 'additional data' });

// LLM调用日志
logger.logLLMCall('actionName', config, input, output, duration);

// 步骤日志
logger.logStep('stepName', 'start|end|error', data);

// 环境特定功能
logger.setLogLevel('DEBUG'); // 设置日志级别
logger.enableLocalStorage(true); // 启用本地存储（浏览器）
const logs = logger.getStoredLogs(); // 获取存储的日志（浏览器）
logger.exportLogs(); // 导出日志（浏览器）
```

### 2. 详细的大模型调用日志

在 `deep-research/index.ts` 中添加了：
- 模型创建过程的详细日志
- 每个LLM调用的输入输出记录
- 执行时间统计
- 错误详情和堆栈信息
- 报告质量验证

### 3. 错误透传机制

#### SSE接口错误处理 (`src/app/api/sse/live/route.ts`)
- 生成唯一请求ID用于追踪
- 详细的错误信息通过SSE发送到客户端
- 错误详情包含：配置信息、模型信息、时间戳等
- 延迟关闭连接确保客户端收到错误信息

#### Provider创建错误处理 (`src/utils/deep-research/provider.ts`)
- 每个AI提供商的创建过程都有详细日志
- 统一的错误处理和日志记录
- 降级机制记录

### 4. 报告质量验证

新增 `validateReportQuality` 方法，检查：
- 报告内容长度（最少500字符）
- 标题长度和质量
- 学习内容是否包含
- Markdown结构是否完整

## 跨环境支持

### 浏览器环境特性
- **本地存储**：日志可以存储在localStorage中，便于调试
- **UI集成**：可以与前端UI组件集成，实时显示日志
- **导出功能**：支持将日志导出为JSON文件
- **级别控制**：可以在浏览器中动态调整日志级别

### Node.js环境特性
- **文件日志**：支持写入文件系统（可以扩展）
- **流式输出**：支持流式日志输出
- **进程信息**：包含Node.js进程相关信息
- **性能监控**：可以集成性能监控工具

### 环境检测
系统会自动检测运行环境：
- **浏览器环境**：`[Browser]` 标记
- **Node.js环境**：`[Node]` 标记

## 测试

### 浏览器环境测试
打开 `test-logger-browser.html` 文件，可以在浏览器中测试所有日志功能。

### Node.js环境测试
```bash
# 运行CommonJS测试
node test-logger.cjs

# 运行ES模块测试（需要配置package.json type: module）
node test-logger.js
```

## 日志输出示例

### 正常情况
```
# Node.js环境
2025-07-30T10:15:30.123Z [INFO][Node] [DeepResearch] DeepResearch initialized | Data: {"aiProvider":"openaicompatible","thinkingModel":"gemini-2.5-pro-preview-06-05","taskModel":"gemini-2.5-pro-preview-06-05","searchProvider":"tavily","language":"zh-CN"}

2025-07-30T10:15:30.456Z [DEBUG][Node] [AI-Provider] Creating AI provider | Data: {"requestId":"provider-123","provider":"openaicompatible","model":"gemini-2.5-pro-preview-06-05","baseURL":"https://tbai.xin/v1...","hasApiKey":true,"settings":"Not present"}

2025-07-30T10:15:31.789Z [INFO][Node] [AI-Provider] OpenAICompatible provider created successfully | Data: {"requestId":"provider-123","model":"gemini-2.5-pro-preview-06-05"}

2025-07-30T10:15:32.123Z [DEBUG][Node] [DeepResearch] Final report prompt details | Data: {"systemPromptLength":1500,"finalPromptLength":25000,"finalPromptPreview":"This is the report plan...","learningsCount":8,"sourcesCount":15,"imagesCount":3}

2025-07-30T10:15:35.456Z [INFO][Node] [DeepResearch] LLM Call: writeFinalReport | Data: {"config":{"model":"gemini-2.5-pro-preview-06-05","enableCitationImage":true,"enableReferences":true},"input":{"promptLength":25000,"learningsCount":8,"sourcesCount":15,"imagesCount":3},"output":{"contentLength":3500,"reasoningLength":200,"sourceCount":5},"duration":3000}

# 浏览器环境
2025-07-30T10:15:30.123Z [INFO][Browser] [DeepResearch] DeepResearch initialized | Data: {"aiProvider":"openaicompatible","thinkingModel":"gemini-2.5-pro-preview-06-05","taskModel":"gemini-2.5-pro-preview-06-05","searchProvider":"tavily","language":"zh-CN"}
```

### 错误情况
```
# Node.js环境
2025-07-30T10:15:30.123Z [ERROR][Node] [AI-Provider] Failed to create AI provider | Data: {"requestId":"provider-123","provider":"openaicompatible","model":"gemini-2.5-pro-preview-06-05","baseURL":"https://tbai.xin/v1...","error":"当前分组 default 下对于模型 gemini-2.5-pro-preview-06-05 无可用渠道","stack":"Error: ..."}

2025-07-30T10:15:30.456Z [ERROR][Node] [SSE-Live] Deep research execution failed | Data: {"requestId":"req-123","error":"当前分组 default 下对于模型 gemini-2.5-pro-preview-06-05 无可用渠道","query":"请分析癌症基因数据...","aiProvider":"openaicompatible","searchProvider":"tavily","thinkingModel":"gemini-2.5-pro-preview-06-05","taskModel":"gemini-2.5-pro-preview-06-05","timestamp":"2025-07-30T10:15:30.456Z"}

# 浏览器环境
2025-07-30T10:15:30.123Z [ERROR][Browser] [AI-Provider] Failed to create AI provider | Data: {"requestId":"provider-123","provider":"openaicompatible","model":"gemini-2.5-pro-preview-06-05","baseURL":"https://tbai.xin/v1...","error":"当前分组 default 下对于模型 gemini-2.5-pro-preview-06-05 无可用渠道"}
```

## 问题定位能力

### 1. 模型配置问题
通过日志可以清楚看到：
- 使用的模型名称和提供商
- API配置是否正确
- 模型创建是否成功

### 2. 调用链路追踪
- 每个步骤的开始和结束时间
- LLM调用的详细输入输出
- 搜索结果的处理情况

### 3. 错误根因分析
- 具体的错误信息
- 错误发生的位置
- 相关的配置信息

## 使用方法

### 启用详细日志
系统会自动记录详细日志，无需额外配置。

### 查看日志
```bash
# 查看实时日志
tail -f logs/deep-research_2025_7_30.log

# 搜索特定错误
grep "ERROR" logs/deep-research_2025_7_30.log

# 搜索特定请求
grep "req-123" logs/deep-research_2025_7_30.log
```

### 客户端错误处理
```javascript
// SSE连接处理
const eventSource = new EventSource('/api/sse/live?query=...');

eventSource.addEventListener('error', (event) => {
  console.error('SSE Error:', event);
});

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'error') {
    console.error('Research Error:', data.message);
    console.error('Error Details:', data.details);
    console.error('Request ID:', data.requestId);
  }
});
```

## 性能考虑

### 日志数据截断
- 字符串数据默认截断到500字符
- 对象数据递归截断
- LLM调用预览限制在200字符

### 异步日志
- 所有日志操作都是同步的，确保不会丢失
- 日志格式化经过优化，减少性能影响

## 测试

运行测试脚本验证日志功能：
```bash
node test-logger.js
```

## 故障排查

### 常见问题

1. **模型调用失败**
   - 检查日志中的 `[AI-Provider]` 相关错误
   - 验证API配置和模型名称
   - 确认API密钥和渠道配置

2. **报告内容过少**
   - 查看 `writeFinalReport` 的输入输出日志
   - 检查搜索结果质量和数量
   - 验证提示词长度和内容

3. **SSE连接问题**
   - 查看请求ID相关的所有日志
   - 检查错误透传是否正常工作
   - 验证网络连接状态

### 日志分析技巧

1. **按请求ID筛选**
   ```bash
   grep "req-123" logs/deep-research_2025_7_30.log
   ```

2. **查看LLM调用统计**
   ```bash
   grep "LLM Call:" logs/deep-research_2025_7_30.log
   ```

3. **分析错误模式**
   ```bash
   grep "ERROR" logs/deep-research_2025_7_30.log | jq '.'
   ```

## 下一步优化

1. **日志级别控制**
   - 支持环境变量控制日志详细程度
   - 生产环境自动减少DEBUG日志

2. **日志聚合**
   - 支持日志发送到外部服务
   - 结构化日志格式输出

3. **性能监控**
   - 添加关键指标监控
   - 自动性能分析和告警