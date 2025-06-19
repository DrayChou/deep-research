# Deep Research URL参数配置指南

## 概述

Deep Research 支持通过URL参数预配置应用设置，让您可以快速启动带有特定配置的研究环境。支持两种方式：
1. **单独参数方式**: 通过单独的URL参数传递配置
2. **JSON配置方式**: 通过单个`config`参数传递URL编码的JSON配置

## 支持的URL参数

### 基础AI提供商配置
| 参数名 | 类型 | 说明 | 可选值 |
|--------|------|------|--------|
| `provider` | string | AI厂商名称 | `google`, `openai`, `anthropic`, `deepseek`, `xai`, `mistral`, `azure`, `openrouter`, `openaicompatible`, `pollinations`, `ollama` |
| `apiKey` | string | 通用API密钥（根据provider自动分配） | - |
| `thinkingModel` | string | 思考模型名称 | 根据provider而定 |
| `taskModel` | string | 任务模型名称（对应networkingModel） | 根据provider而定 |
| `mode` | string | 工作模式 | - |

### 各厂商专用配置

#### Google (Gemini)
| 参数名 | 类型 | 说明 | 默认值 |
|--------|------|------|--------|
| `apiKey` | string | Google API密钥 | - |
| `thinkingModel` | string | 思考模型 | `gemini-2.0-flash-thinking-exp` |
| `taskModel` | string | 任务模型 | `gemini-2.0-flash-exp` |

#### OpenAI
| 参数名 | 类型 | 说明 | 默认值 |
|--------|------|------|--------|
| `openAIApiKey` | string | OpenAI API密钥 | - |
| `openAIThinkingModel` | string | OpenAI思考模型 | `gpt-4o` |
| `openAINetworkingModel` | string | OpenAI任务模型 | `gpt-4o-mini` |

#### Anthropic (Claude)
| 参数名 | 类型 | 说明 | 默认值 |
|--------|------|------|--------|
| `anthropicApiKey` | string | Anthropic API密钥 | - |
| `anthropicThinkingModel` | string | Claude思考模型 | - |
| `anthropicNetworkingModel` | string | Claude任务模型 | - |

#### DeepSeek
| 参数名 | 类型 | 说明 | 默认值 |
|--------|------|------|--------|
| `deepseekApiKey` | string | DeepSeek API密钥 | - |
| `deepseekThinkingModel` | string | DeepSeek思考模型 | `deepseek-reasoner` |
| `deepseekNetworkingModel` | string | DeepSeek任务模型 | `deepseek-chat` |

#### OpenRouter
| 参数名 | 类型 | 说明 | 默认值 |
|--------|------|------|--------|
| `openRouterApiKey` | string | OpenRouter API密钥 | - |
| `openRouterThinkingModel` | string | OpenRouter思考模型 | - |
| `openRouterNetworkingModel` | string | OpenRouter任务模型 | - |

#### xAI
| 参数名 | 类型 | 说明 | 默认值 |
|--------|------|------|--------|
| `xAIApiKey` | string | xAI API密钥 | - |
| `xAIThinkingModel` | string | xAI思考模型 | - |
| `xAINetworkingModel` | string | xAI任务模型 | - |

#### Mistral
| 参数名 | 类型 | 说明 | 默认值 |
|--------|------|------|--------|
| `mistralApiKey` | string | Mistral API密钥 | - |
| `mistralThinkingModel` | string | Mistral思考模型 | `mistral-large-latest` |
| `mistralNetworkingModel` | string | Mistral任务模型 | `mistral-medium-latest` |

#### Azure OpenAI
| 参数名 | 类型 | 说明 | 默认值 |
|--------|------|------|--------|
| `azureApiKey` | string | Azure API密钥 | - |
| `azureResourceName` | string | Azure资源名称 | - |
| `azureApiVersion` | string | Azure API版本 | - |
| `azureThinkingModel` | string | Azure思考模型 | - |
| `azureNetworkingModel` | string | Azure任务模型 | - |

#### OpenAI Compatible
| 参数名 | 类型 | 说明 | 默认值 |
|--------|------|------|--------|
| `openAICompatibleApiKey` | string | 兼容API密钥 | - |
| `openAICompatibleApiProxy` | string | 兼容API代理地址 | - |
| `openAICompatibleThinkingModel` | string | 兼容思考模型 | - |
| `openAICompatibleNetworkingModel` | string | 兼容任务模型 | - |

#### Pollinations
| 参数名 | 类型 | 说明 | 默认值 |
|--------|------|------|--------|
| `pollinationsApiProxy` | string | Pollinations API代理 | - |
| `pollinationsThinkingModel` | string | Pollinations思考模型 | - |
| `pollinationsNetworkingModel` | string | Pollinations任务模型 | - |

#### Ollama
| 参数名 | 类型 | 说明 | 默认值 |
|--------|------|------|--------|
| `ollamaApiProxy` | string | Ollama API地址 | - |
| `ollamaThinkingModel` | string | Ollama思考模型 | - |
| `ollamaNetworkingModel` | string | Ollama任务模型 | - |

### 认证配置
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `jwt` | string | JWT令牌，用于数据中心认证 |
| `accessPassword` | string | 应用访问密码 |
| `topicId` | string | 话题ID，用于加载历史记录 |

### 搜索配置
| 参数名 | 类型 | 说明 | 可选值/默认值 |
|--------|------|------|---------------|
| `enableSearch` | string | 启用搜索功能 | `1` (启用), `0` (禁用) |
| `searchProvider` | string | 搜索提供商 | `model`, `tavily`, `firecrawl`, `exa`, `bocha`, `searxng` |
| `tavilyApiKey` | string | Tavily API密钥 | - |
| `tavilyApiProxy` | string | Tavily API代理 | - |
| `tavilyScope` | string | Tavily搜索范围 | `general` |
| `firecrawlApiKey` | string | Firecrawl API密钥 | - |
| `firecrawlApiProxy` | string | Firecrawl API代理 | - |
| `exaApiKey` | string | Exa API密钥 | - |
| `exaApiProxy` | string | Exa API代理 | - |
| `exaScope` | string | Exa搜索范围 | `research paper` |
| `bochaApiKey` | string | Bocha API密钥 | - |
| `bochaApiProxy` | string | Bocha API代理 | - |
| `searxngApiProxy` | string | SearXNG API地址 | - |
| `searxngScope` | string | SearXNG搜索范围 | `all` |
| `parallelSearch` | number | 并行搜索数量 | `1` |
| `searchMaxResult` | number | 最大搜索结果数 | `5` |
| `crawler` | string | 爬虫类型 | `jina` |

### 界面配置
| 参数名 | 类型 | 说明 | 可选值 |
|--------|------|------|--------|
| `language` | string | 界面语言 | `zh-CN`, `en-US`, `es-ES` |
| `theme` | string | 界面主题 | `system`, `light`, `dark` |
| `debug` | string | 调试模式 | `enable`, `disable` |
| `references` | string | 参考文献显示 | `enable`, `disable` |
| `citationImage` | string | 引用图片显示 | `enable`, `disable` |

### JSON配置方式
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `config` | string | URL编码的JSON配置字符串，包含上述所有配置项 |

## URL长度限制说明

### GET参数长度限制
- **浏览器限制**: 大多数浏览器支持最大2048字符的URL长度
- **服务器限制**: Apache默认8192字符，Nginx默认4096字符
- **实际建议**: 保持URL在2000字符以内以确保兼容性

### JSON配置方式的优势
使用`config`参数传递JSON配置可以：
1. **减少URL长度**: 避免重复的参数名
2. **支持复杂结构**: 可以传递嵌套的配置对象
3. **更好的可读性**: JSON格式更易于理解和维护
4. **批量配置**: 一次性传递所有配置项

### JSON配置示例
```json
{
  "provider": "deepseek",
  "deepseekApiKey": "sk-xxx",
  "deepseekThinkingModel": "deepseek-reasoner",
  "deepseekNetworkingModel": "deepseek-chat",
  "searchProvider": "tavily",
  "tavilyApiKey": "tvly-xxx",
  "searchMaxResult": 10,
  "language": "zh-CN",
  "theme": "dark",
  "jwt": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "topicId": "topic-456"
}
```

编码后的URL：
```
https://your-domain.com/?config=%7B%22provider%22%3A%22deepseek%22%2C%22deepseekApiKey%22%3A%22sk-xxx%22...%7D
```

## 使用示例

### 单独参数方式

#### 基础配置示例
```
https://your-domain.com/?provider=google&apiKey=AIzaSy...&thinkingModel=gemini-2.0-flash-thinking-exp&taskModel=gemini-2.0-flash-exp&language=zh-CN
```

#### DeepSeek配置示例
```
https://your-domain.com/?provider=deepseek&deepseekApiKey=sk-...&deepseekThinkingModel=deepseek-reasoner&deepseekNetworkingModel=deepseek-chat&language=zh-CN
```

#### 包含搜索配置的示例
```
https://your-domain.com/?provider=openai&openAIApiKey=sk-...&searchProvider=tavily&tavilyApiKey=tvly-...&searchMaxResult=10&language=zh-CN
```

#### 包含JWT认证的示例
```
https://your-domain.com/?provider=deepseek&deepseekApiKey=sk-...&jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...&topicId=topic-123&language=zh-CN
```

### JSON配置方式

#### 简单配置
```javascript
const config = {
  provider: "google",
  apiKey: "AIzaSy...",
  language: "zh-CN",
  theme: "dark"
};
const url = `https://your-domain.com/?config=${encodeURIComponent(JSON.stringify(config))}`;
```

#### 复杂配置
```javascript
const config = {
  provider: "deepseek",
  deepseekApiKey: "sk-...",
  deepseekThinkingModel: "deepseek-reasoner",
  deepseekNetworkingModel: "deepseek-chat",
  searchProvider: "tavily",
  tavilyApiKey: "tvly-...",
  tavilyScope: "general",
  searchMaxResult: 15,
  parallelSearch: 2,
  language: "zh-CN",
  theme: "dark",
  debug: "enable",
  references: "enable",
  citationImage: "enable",
  jwt: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  topicId: "topic-789"
};
const url = `https://your-domain.com/?config=${encodeURIComponent(JSON.stringify(config))}`;
```

## 数据中心集成参数

### 必需参数
- `jwt`: 用于API认证的JWT令牌
- `topicId`: 要加载的话题ID

### 可选参数
- `accessPassword`: 应用层面的访问密码
- 其他配置参数根据需要设置

### 集成流程
1. 数据中心生成包含认证信息的URL
2. 用户点击链接跳转到Deep Research
3. 应用自动解析参数并配置环境
4. 使用JWT从数据中心加载话题历史
5. 自动清理URL中的敏感信息

## 安全注意事项

1. **敏感信息自动清理**: API密钥和JWT令牌等敏感信息会在页面加载后自动从URL中清除，避免在浏览器历史记录中暴露。

2. **HTTPS推荐**: 建议在生产环境中使用HTTPS，确保URL参数在传输过程中的安全性。

3. **令牌时效性**: JWT令牌应设置合理的过期时间，避免长期有效的令牌被滥用。

4. **URL长度控制**: 超长URL可能被截断，建议使用JSON配置方式或分批传递参数。

## 配置URL生成器

在应用的设置页面中，您可以找到"配置URL"标签页，其中包含了一个图形化的配置URL生成器，帮助您：

1. 选择AI提供商和模型
2. 配置认证信息
3. 设置搜索选项
4. 选择参数传递方式（单独参数 vs JSON配置）
5. 生成完整的配置URL
6. 一键复制或在新窗口中打开

## 环境变量配置

如果您需要设置默认的数据中心URL，可以在环境变量中配置：

```bash
# 数据中心基础URL
NEXT_PUBLIC_DATA_CENTER_URL=https://your-data-center.com
```

## 故障排除

### 参数没有生效
- 检查参数名称是否正确（区分大小写）
- 确认参数值是否在允许的范围内
- 查看浏览器控制台是否有错误信息
- 验证JSON配置的格式是否正确

### URL过长问题
- 使用JSON配置方式减少URL长度
- 移除非必需的配置参数
- 考虑使用默认值而不是显式传递

### JWT认证失败
- 检查JWT令牌格式是否正确
- 确认数据中心URL是否配置正确
- 验证令牌是否已过期
- 检查令牌是否有对应权限

### 历史记录加载失败
- 确认topicId是否存在
- 检查数据中心API是否可访问
- 验证JWT令牌是否有对应权限
- 查看网络请求是否成功

### JSON配置解析失败
- 验证JSON格式是否正确
- 检查URL编码是否正确
- 确认特殊字符是否被正确转义
- 使用在线JSON验证工具检查格式
