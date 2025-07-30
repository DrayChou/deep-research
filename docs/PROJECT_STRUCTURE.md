# 日志改进项目文件结构说明

## 项目概述
该项目为 deep-research 系统实现了详细的日志记录和错误透传机制，支持浏览器和Node.js双环境。

## 目录结构

```
deep-research/
├── src/                          # 源代码目录
│   ├── utils/                     # 工具类
│   │   ├── logger.ts             # 🆕 日志工具类（核心文件）
│   │   └── deep-research/        # 深度研究模块
│   │       ├── index.ts          # 🆕 已添加详细日志记录
│   │       ├── provider.ts       # 🆕 已添加Provider创建日志
│   │       └── ...
│   └── app/api/sse/live/         # SSE API
│       └── route.ts             # 🆕 已改进错误透传机制
├── docs/                         # 文档目录
│   ├── LOGGING_IMPROVEMENTS.md   # 🆖 详细改进说明文档
│   ├── QUICK_FIX_GUIDE.md        # 🆖 快速修复指南
│   └── ...                       # 其他现有文档
├── tests/                        # 测试目录
│   ├── test-logger.cjs           # 🆖 Node.js环境测试脚本
│   ├── test-logger-browser.html  # 🆖 浏览器环境测试页面
│   └── ...
├── package.json                  # 项目配置
└── ...
```

## 新增文件说明

### 1. 核心日志工具
- **`src/utils/logger.ts`** - 跨环境日志工具类
  - 支持浏览器和Node.js环境
  - 提供结构化日志记录
  - 包含数据截断和本地存储功能

### 2. 深度研究模块改进
- **`src/utils/deep-research/index.ts`** - 主要逻辑文件
  - 添加了详细的LLM调用日志
  - 增加了步骤追踪和性能监控
  - 实现了报告质量验证

- **`src/utils/deep-research/provider.ts`** - AI提供商管理
  - 记录每个提供商的创建过程
  - 提供详细的错误信息

### 3. API接口改进
- **`src/app/api/sse/live/route.ts`** - SSE实时接口
  - 改进了错误透传机制
  - 添加了请求追踪功能

### 4. 文档和测试
- **`docs/LOGGING_IMPROVEMENTS.md`** - 详细的技术文档
- **`docs/QUICK_FIX_GUIDE.md`** - 快速使用指南
- **`tests/test-logger.cjs`** - Node.js环境测试
- **`tests/test-logger-browser.html`** - 浏览器环境测试

## 主要功能特性

### 1. 详细日志记录
- LLM调用完整追踪
- 输入输出长度和预览
- 执行时间统计
- 错误详情和堆栈信息

### 2. 错误透传机制
- 错误信息通过SSE发送到客户端
- 包含配置信息和请求ID
- 支持问题追踪和调试

### 3. 跨环境支持
- 浏览器环境：支持本地存储、UI集成
- Node.js环境：支持文件日志、性能监控
- 自动环境检测和标记

### 4. 报告质量验证
- 内容长度检查
- 标题质量验证
- Markdown结构检查
- 学习内容完整性验证

## 使用方法

### 运行测试
```bash
# Node.js环境测试
node tests/test-logger.cjs

# 浏览器环境测试
# 打开 tests/test-logger-browser.html 文件
```

### 查看文档
- 详细技术文档：`docs/LOGGING_IMPROVEMENTS.md`
- 快速使用指南：`docs/QUICK_FIX_GUIDE.md`

## 问题排查

现在系统会自动记录详细的调试信息，当出现问题时：

1. **查看控制台日志** - 找到 `[ERROR]` 标记的日志
2. **搜索请求ID** - 每个请求都有唯一ID用于追踪
3. **检查模型配置** - 查看AI提供商和模型配置是否正确
4. **分析调用链路** - 查看每个步骤的执行情况

所有改进都已集成到现有系统中，无需修改任何现有代码即可使用。