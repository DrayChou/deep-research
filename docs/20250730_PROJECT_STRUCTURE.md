# 项目结构说明

## 项目概述
deep-research 是一个基于 AI 的深度研究系统，集成了多种 LLM 提供商和搜索引擎，支持实时研究、知识库管理和报告生成。

## 目录结构

```
deep-research/
├── src/                          # 源代码目录
│   ├── app/                       # Next.js App Router
│   │   ├── api/                   # API 路由
│   │   │   ├── ai/                # AI 提供商 API
│   │   │   ├── search/            # 搜索提供商 API
│   │   │   ├── mcp/               # MCP 服务器
│   │   │   ├── sse/               # 服务器发送事件
│   │   │   ├── crawler/           # 网页爬虫
│   │   │   └── utils.ts           # API 工具函数
│   │   ├── globals.css            # 全局样式
│   │   ├── layout.tsx            # 根布局
│   │   └── page.tsx               # 主页面
│   ├── components/                # React 组件
│   │   ├── ui/                    # Shadcn/ui 基础组件
│   │   ├── Internal/             # 内部功能组件
│   │   ├── Knowledge/            # 知识库组件
│   │   ├── Research/             # 研究功能组件
│   │   ├── MagicDown/            # Markdown 编辑器
│   │   └── Provider/             # 提供商组件
│   ├── hooks/                     # React Hooks
│   ├── store/                     # Zustand 状态管理
│   ├── utils/                     # 工具函数
│   │   ├── deep-research/        # 深度研究核心模块
│   │   ├── parser/               # 文档解析器
│   │   ├── logger.ts             # 日志工具
│   │   └── ...                   # 其他工具
│   ├── constants/                 # 常量定义
│   ├── libs/                      # 第三方库封装
│   ├── services/                  # 业务服务
│   └── locales/                   # 国际化文件
├── docs/                         # 文档目录
│   ├── LOGGING_IMPROVEMENTS.md   # 日志系统改进说明
│   ├── PROJECT_STRUCTURE.md      # 项目结构文档（本文件）
│   ├── QUICK_FIX_GUIDE.md        # 快速修复指南
│   └── ...                       # 其他技术文档
├── scripts/                      # 脚本文件
│   ├── test-multi-api-key-polling.js        # API key 轮换测试
│   ├── test-multi-api-key-polling-v2.js     # API key 轮换测试 v2
│   └── test-improved-multi-api-key-polling.js # 改进的 API key 轮换测试
├── tests/                        # 测试文件
│   ├── test-logger.cjs           # Node.js 日志测试
│   └── test-logger-browser.html  # 浏览器日志测试
├── public/                       # 静态资源
│   ├── scripts/                  # 前端脚本
│   └── screenshots/              # 截图
├── package.json                  # 项目配置
├── tailwind.config.ts            # Tailwind 配置
├── tsconfig.json                 # TypeScript 配置
├── next.config.ts               # Next.js 配置
├── Dockerfile                    # Docker 配置
├── docker-compose.yml           # Docker Compose 配置
└── ...                          # 其他配置文件
```

## 核心模块说明

### 1. 深度研究核心 (`src/utils/deep-research/`)
- **`index.ts`** - 主要研究逻辑，包含报告生成、搜索任务管理等
- **`provider.ts`** - AI 提供商创建和管理
- **`search.ts`** - 搜索提供商集成
- **`prompts.ts`** - 系统提示词模板

### 2. API 工具 (`src/app/api/`)
- **`utils.ts`** - API 配置管理、JWT 验证、环境变量处理
- **`ai/`** - 各 AI 提供商的路由处理
- **`search/`** - 各搜索提供商的路由处理
- **`sse/`** - 实时数据流传输
- **`mcp/`** - Model Context Protocol 服务器

### 3. 日志系统 (`src/utils/logger.ts`)
- 跨环境日志工具（浏览器/Node.js）
- 结构化日志记录和错误追踪
- 性能监控和调试支持

### 4. 文档解析器 (`src/utils/parser/`)
- **`pdfParser.ts`** - PDF 文档解析
- **`officeParser.ts`** - Office 文档解析
- **`textParser.ts`** - 文本文件解析

### 5. 组件系统 (`src/components/`)
- **`ui/`** - Shadcn/ui 基础组件
- **`Research/`** - 研究功能相关组件
- **`Knowledge/`** - 知识库管理组件
- **`MagicDown/`** - Markdown 编辑器组件

## 主要功能特性

### 1. 多 LLM 提供商支持
- Google Gemini、OpenAI、Anthropic、DeepSeek、XAI、Mistral
- Azure OpenAI、OpenRouter、Ollama 等
- 自动密钥轮换和故障转移

### 2. 多搜索引擎集成
- Tavily、Firecrawl、Exa、Bocha、SearXNG
- 内置模型搜索（GPT-4o 等）
- 搜索结果缓存和重试机制

### 3. 知识库管理
- 文件上传和解析（PDF、Office、文本）
- 知识图谱可视化
- 智能内容检索

### 4. 实时研究流程
- 报告计划生成
- 搜索任务管理
- 实时进度反馈
- 最终报告生成

### 5. 国际化支持
- 中文、英文、西班牙语
- 动态语言切换
- 本地化界面

## 开发和测试

### 运行测试脚本
```bash
# API key 轮换测试
node scripts/test-multi-api-key-polling.js
node scripts/test-multi-api-key-polling-v2.js
node scripts/test-improved-multi-api-key-polling.js

# 日志系统测试
node tests/test-logger.cjs
# 浏览器测试：打开 tests/test-logger-browser.html
```

### 开发服务器
```bash
pnpm dev          # 开发服务器
pnpm build        # 生产构建
pnpm start        # 生产服务器
pnpm lint         # 代码检查
```

## 文档资源

- **快速修复指南**: `docs/QUICK_FIX_GUIDE.md`
- **日志系统改进**: `docs/LOGGING_IMPROVEMENTS.md`
- **API 文档**: `docs/deep-research-api-doc.md`
- **部署指南**: `docs/20250315_How-to-deploy-to-Cloudflare-Pages.md`

## 项目特色

1. **模块化架构** - 清晰的代码组织和职责分离
2. **类型安全** - 完整的 TypeScript 类型定义
3. **错误处理** - 完善的异常处理和用户反馈
4. **性能优化** - 智能缓存和批量处理
5. **可扩展性** - 插件式的提供商和组件系统