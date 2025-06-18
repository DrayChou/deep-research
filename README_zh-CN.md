<div align="center">
<h1>Deep Research</h1>

![GitHub deployments](https://img.shields.io/github/deployments/u14app/gemini-next-chat/Production)
![GitHub Release](https://img.shields.io/github/v/release/u14app/deep-research)
![Docker Image Size](https://img.shields.io/docker/image-size/xiangfa/deep-research/latest)
![Docker Pulls](https://img.shields.io/docker/pulls/xiangfa/deep-research)
[![License: MIT](https://img.shields.io/badge/License-MIT-default.svg)](https://opensource.org/licenses/MIT)

[![Gemini](https://img.shields.io/badge/Gemini-8E75B2?style=flat&logo=googlegemini&logoColor=white)](https://ai.google.dev/)
[![Next](https://img.shields.io/badge/Next.js-111111?style=flat&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![shadcn/ui](https://img.shields.io/badge/shadcn/ui-111111?style=flat&logo=shadcnui&logoColor=white)](https://ui.shadcn.com/)

[![Vercel](https://img.shields.io/badge/Vercel-111111?style=flat&logo=vercel&logoColor=white)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fu14app%2Fdeep-research&project-name=deep-research&repository-name=deep-research)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-F69652?style=flat&logo=cloudflare&logoColor=white)](./docs/How-to-deploy-to-Cloudflare-Pages.md)
[![PWA](https://img.shields.io/badge/PWA-blue?style=flat&logo=pwa&logoColor=white)](https://research.u14.app/)

</div>

**闪电般快速的深度研究报告**

Deep Research 使用各种强大的 AI 模型在几分钟内生成深入的研究报告。它利用先进的"思考"和"任务"模型，结合互联网连接，为各种主题提供快速而深刻的分析。**您的隐私至关重要 - 所有数据都在本地处理和存储。**

## ✨ 功能特性

- **快速深度研究：** 在约 2 分钟内生成全面的研究报告，显著加速您的研究过程。
- **多平台支持：** 支持快速部署到 Vercel、Cloudflare 和其他平台。
- **AI 驱动：** 利用先进的 AI 模型进行准确而深刻的分析。
- **隐私优先：** 您的数据保持私密和安全，所有数据都存储在您的浏览器本地。
- **支持多种大语言模型：** 支持各种主流大语言模型，包括 Gemini、OpenAI、Anthropic、Deepseek、Grok、Mistral、Azure OpenAI、任何 OpenAI 兼容的 LLM、OpenRouter、Ollama 等。
- **支持网络搜索：** 支持 Searxng、Tavily、Firecrawl、Exa、Bocha 等搜索引擎，让不支持搜索的 LLM 能够更方便地使用网络搜索功能。
- **思考和任务模型：** 采用复杂的"思考"和"任务"模型来平衡深度和速度，确保快速获得高质量结果。支持切换研究模型。
- **支持进一步研究：** 您可以在项目的任何阶段细化或调整研究内容，并支持从该阶段重新研究。
- **本地知识库：** 支持上传和处理文本、Office、PDF 等资源文件以生成本地知识库。
- **Artifact：** 支持编辑研究内容，具有两种编辑模式：WYSIWYM 和 Markdown。可以调整阅读级别、文章长度和全文翻译。
- **知识图谱：** 支持一键生成知识图谱，让您对报告内容有系统性的了解。
- **研究历史：** 支持保存研究历史，您可以随时回顾之前的研究结果并再次进行深入研究。
- **本地和服务器 API 支持：** 提供本地和服务器端 API 调用选项的灵活性以满足您的需求。
- **支持 SaaS 和 MCP：** 您可以通过 SSE API 将此项目用作深度研究服务（SaaS），或通过 MCP 服务在其他 AI 服务中使用它。
- **支持 PWA：** 通过渐进式网络应用程序（PWA）技术，您可以像软件一样使用该项目。
- **支持多密钥负载：** 支持多密钥负载以提高 API 响应效率。
- **多语言支持：** 英语、简体中文、西班牙语。
- **使用现代技术构建：** 使用 Next.js 15 和 Shadcn UI 开发，确保现代、高性能和视觉上吸引人的用户体验。
- **MIT 许可：** 在 MIT 许可下开源，可免费用于个人和商业用途。

## 🎯 路线图

- [x] 支持保存研究历史
- [x] 支持编辑最终报告和搜索结果
- [x] 支持其他 LLM 模型
- [x] 支持文件上传和本地知识库
- [x] 支持 SSE API 和 MCP 服务器

## 🚀 快速开始

### 使用免费 Gemini（推荐）

1. 获取 [Gemini API Key](https://aistudio.google.com/app/apikey)
2. 一键部署项目，您可以选择部署到 Vercel 或 Cloudflare

   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fu14app%2Fdeep-research&project-name=deep-research&repository-name=deep-research)

   目前项目支持部署到 Cloudflare，但您需要按照[如何部署到 Cloudflare Pages](./docs/How-to-deploy-to-Cloudflare-Pages.md) 来完成。

3. 开始使用

### 使用其他 LLM

1. 将项目部署到 Vercel 或 Cloudflare
2. 设置 LLM API 密钥
3. 设置 LLM API 基础 URL（可选）
4. 开始使用

## ⌨️ 开发

按照以下步骤在您的本地浏览器上运行 Deep Research。

### 前置条件

- [Node.js](https://nodejs.org/)（推荐版本 18.18.0 或更高）
- [pnpm](https://pnpm.io/) 或 [npm](https://www.npmjs.com/) 或 [yarn](https://yarnpkg.com/)

### 安装

1. **克隆仓库：**

   ```bash
   git clone https://github.com/u14app/deep-research.git
   cd deep-research
   ```

2. **安装依赖：**

   ```bash
   pnpm install  # 或 npm install 或 yarn install
   ```

3. **设置环境变量：**

   您需要将文件 `env.tpl` 修改为 `.env`，或创建一个 `.env` 文件并将变量写入此文件。

   ```bash
   # 用于开发
   cp env.tpl .env.local
   # 用于生产
   cp env.tpl .env
   ```

4. **运行开发服务器：**

   ```bash
   pnpm dev  # 或 npm run dev 或 yarn dev
   ```

   打开浏览器并访问 [http://localhost:3000](http://localhost:3000) 来访问 Deep Research。

### 自定义模型列表

项目允许自定义模型列表，但**仅在代理模式下工作**。请在 `.env` 文件或环境变量页面中添加名为 `NEXT_PUBLIC_MODEL_LIST` 的环境变量。

自定义模型列表使用 `,` 分隔多个模型。如果要禁用某个模型，请使用 `-` 符号后跟模型名称，即 `-existing-model-name`。要仅允许指定的模型可用，请使用 `-all,+new-model-name`。

## 🚢 部署

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fu14app%2Fdeep-research&project-name=deep-research&repository-name=deep-research)

### Cloudflare

目前项目支持部署到 Cloudflare，但您需要按照[如何部署到 Cloudflare Pages](./docs/How-to-deploy-to-Cloudflare-Pages.md) 来完成。

### Docker

> Docker 版本需要 20 或以上，否则会提示找不到镜像。

> ⚠️ 注意：大多数时候，docker 版本会比最新版本滞后 1-2 天，因此部署后会继续出现"存在更新"提示，这是正常的。

```bash
docker pull xiangfa/deep-research:latest
docker run -d --name deep-research -p 3333:3000 xiangfa/deep-research
```

您也可以指定其他环境变量：

```bash
docker run -d --name deep-research \
   -p 3333:3000 \
   -e ACCESS_PASSWORD=your-password \
   -e GOOGLE_GENERATIVE_AI_API_KEY=AIzaSy... \
   xiangfa/deep-research
```

或构建您自己的 docker 镜像：

```bash
docker build -t deep-research .
docker run -d --name deep-research -p 3333:3000 deep-research
```

如果需要指定其他环境变量，请在上述命令中添加 `-e key=value` 来指定。

使用 `docker-compose.yml` 部署：

```bash
version: '3.9'
services:
   deep-research:
      image: xiangfa/deep-research
      container_name: deep-research
      environment:
         - ACCESS_PASSWORD=your-password
         - GOOGLE_GENERATIVE_AI_API_KEY=AIzaSy...
      ports:
         - 3333:3000
```

或构建您自己的 docker compose：

```bash
docker compose -f docker-compose.yml build
```

### 静态部署

您也可以直接构建静态页面版本，然后将 `out` 目录中的所有文件上传到任何支持静态页面的网站服务，如 Github Page、Cloudflare、Vercel 等。

```bash
pnpm build:export
```

## ⚙️ 配置

如"快速开始"部分所述，Deep Research 使用以下环境变量进行服务器端 API 配置：

请参考文件 [env.tpl](./env.tpl) 查看所有可用的环境变量。

**环境变量的重要说明：**

- **隐私提醒：** 这些环境变量主要用于**服务器端 API 调用**。当使用**本地 API 模式**时，不需要 API 密钥或服务器端配置，进一步增强您的隐私。

- **多密钥支持：** 支持多个密钥，每个密钥用 `,` 分隔，即 `key1,key2,key3`。

- **安全设置：** 通过设置 `ACCESS_PASSWORD`，您可以更好地保护服务器 API 的安全。

- **使变量生效：** 添加或修改此环境变量后，请重新部署项目以使更改生效。

## 📄 API 文档

目前项目支持两种形式的 API：服务器发送事件（SSE）和模型上下文协议（MCP）。

### 服务器发送事件 API

Deep Research API 提供了一个实时接口，用于启动和监控复杂的研究任务。

建议通过 `@microsoft/fetch-event-source` 使用 API，要获取最终报告，您需要监听 `message` 事件，数据将以文本流的形式返回。

#### POST 方法

端点：`/api/sse`

方法：`POST`

请求体：

```typescript
interface SSEConfig {
  // 研究主题
  query: string;
  // AI 提供商，可能的值包括：google, openai, anthropic, deepseek, xai, mistral, azure, openrouter, openaicompatible, pollinations, ollama
  provider: string;
  // 思考模型 ID
  thinkingModel: string;
  // 任务模型 ID
  taskModel: string;
  // 搜索提供商，可能的值包括：model, tavily, firecrawl, exa, bocha, searxng
  searchProvider: string;
  // 响应语言，也会影响搜索语言。（可选）
  language?: string;
  // 最大搜索结果数。默认为 `5`（可选）
  maxResult?: number;
  // 是否在最终报告中包含内容相关图像。默认为 `true`。（可选）
  enableCitationImage?: boolean;
  // 是否在搜索结果和最终报告中包含引用链接。默认为 `true`。（可选）
  enableReferences?: boolean;
}
```

请求头：

```typescript
interface Headers {
  "Content-Type": "application/json";
  // 如果您设置了访问密码
  // Authorization: "Bearer YOUR_ACCESS_PASSWORD";
}
```

详细信息请参阅 [API 文档](./docs/deep-research-api-doc.md)。

#### GET 方法

这是一个有趣的实现。您可以通过 URL 直接观看整个深度研究过程，就像观看视频一样。

您可以通过以下链接访问深度研究报告：

```text
http://localhost:3000/api/sse/live?query=AI+trends+for+this+year&provider=pollinations&thinkingModel=openai&taskModel=openai-fast&searchProvider=searxng
```

查询参数：

```typescript
// 参数与 POST 参数相同
interface QueryParams extends SSEConfig {
  // 如果您设置了 `ACCESS_PASSWORD` 环境变量，则此参数是必需的
  password?: string;
}
```

### 模型上下文协议（MCP）服务器

目前支持 `StreamableHTTP` 和 `SSE` 服务器传输。

StreamableHTTP 服务器端点：`/api/mcp`，传输类型：`streamable-http`

SSE 服务器端点：`/api/mcp/sse`，传输类型：`sse`

```json
{
  "mcpServers": {
    "deep-research": {
      "url": "http://127.0.0.1:3000/api/mcp",
      "transportType": "streamable-http",
      "timeout": 600
    }
  }
}
```

**注意：** 由于深度研究需要很长时间才能执行，您需要设置更长的超时时间以避免中断研究。

如果您的服务器设置了 `ACCESS_PASSWORD`，MCP 服务将受到保护，您需要添加额外的头部参数：

```json
{
  "mcpServers": {
    "deep-research": {
      "url": "http://127.0.0.1:3000/api/mcp",
      "transportType": "streamable-http",
      "timeout": 600,
      "headers": {
        "Authorization": "Bearer YOUR_ACCESS_PASSWORD"
      }
    }
  }
}
```

**启用 MCP 服务需要设置全局环境变量：**

```bash
# MCP 服务器 AI 提供商
# 可能的值包括：google, openai, anthropic, deepseek, xai, mistral, azure, openrouter, openaicompatible, pollinations, ollama
MCP_AI_PROVIDER=google
# MCP 服务器搜索提供商。默认为 `model`
# 可能的值包括：model, tavily, firecrawl, exa, bocha, searxng
MCP_SEARCH_PROVIDER=tavily
# MCP 服务器思考模型 ID，深度研究中使用的核心模型。
MCP_THINKING_MODEL=gemini-2.0-flash-thinking-exp
# MCP 服务器任务模型 ID，用于次要任务，推荐高输出模型。
MCP_TASK_MODEL=gemini-2.0-flash-exp
```

**注意：** 为确保 MCP 服务能够正常使用，您需要设置相应模型和搜索引擎的环境变量。具体环境变量参数请参考 [env.tpl](./env.tpl)。

## 🪄 工作原理

1. **研究主题**

   - 输入研究主题
   - 使用本地研究资源（可选）
   - 开始思考（或重新思考）

2. **提出您的想法**

   - 系统提问
     - 回答系统问题（可选）
     - 编写研究计划（或重写研究计划）
   - 系统输出研究计划
     - 开始深入研究（或重新研究）
     - 系统生成 SERP 查询

3. **信息收集**

   - 初始研究
     - 基于 SERP 查询检索本地研究资源
     - 基于 SERP 查询从互联网收集信息
   - 深入研究（此过程可以重复）
     - 提出研究建议（可选）
     - 开始新一轮信息收集（过程与初始研究相同）

4. **生成最终报告**

   - 提出写作请求（可选）
   - 将所有研究材料总结为全面的 Markdown 报告
   - 重新生成研究报告（可选）

```mermaid
flowchart TB
    A[研究主题]:::start

    subgraph Propose[提出您的想法]
        B1[系统提问]:::process
        B2[系统输出研究计划]:::process
        B3[系统生成 SERP 查询]:::process
        B1 --> B2
        B2 --> B3
    end

    subgraph Collect[信息收集]
        C1[初始研究]:::collection
        C1a[基于 SERP 查询检索本地研究资源]:::collection
        C1b[基于 SERP 查询从互联网收集信息]:::collection
        C2[深入研究]:::recursive
        Refine{需要更深入的研究吗？}:::decision

        C1 --> C1a
        C1 --> C1b
        C1a --> C2
        C1b --> C2
        C2 --> Refine
        Refine -->|是| C2
    end

    Report[生成最终报告]:::output

    A --> Propose
    B3 --> C1

    %% Connect the exit from the loop/subgraph to the final report
    Refine -->|否| Report

    %% Styling
    classDef start fill:#7bed9f,stroke:#2ed573,color:black
    classDef process fill:#70a1ff,stroke:#1e90ff,color:black
    classDef recursive fill:#ffa502,stroke:#ff7f50,color:black
    classDef output fill:#ff4757,stroke:#ff6b81,color:black
    classDef collection fill:#a8e6cf,stroke:#3b7a57,color:black
    classDef decision fill:#c8d6e5,stroke:#8395a7,color:black

    class A start
    class B1,B2,B3 process
    class C1,C1a,C1b collection
    class C2 recursive
    class Refine decision
    class Report output
```

## 🙋 常见问题

**为什么我的 Ollama 或 SearXNG 无法正常工作并显示错误 `TypeError: Failed to fetch`？**

如果您的请求由于浏览器安全限制而产生 `CORS`，您需要为 Ollama 或 SearXNG 配置参数以允许跨域请求。您也可以考虑使用服务器代理模式，这是一个后端服务器发出请求，可以有效避免跨域问题。

## 🛡️ 隐私

Deep Research 在设计时考虑了您的隐私。**所有研究数据和生成的报告都存储在您的机器本地。** 我们不收集或传输您的任何研究数据到外部服务器（除非您明确使用服务器端 API 调用，在这种情况下，数据通过您配置的代理（如果有）发送到 API）。您的隐私是我们的优先考虑。

## 🙏 致谢

- [Next.js](https://nextjs.org/) - 用于构建高性能 Web 应用程序的 React 框架。
- [Shadcn UI](https://ui.shadcn.com/) - 精美设计的组件，帮助简化了 UI 开发。
- [AI SDKs](https://sdk.vercel.ai) - 为 Deep Research 的智能研究功能提供支持。
- [Deep Research](https://github.com/dzhng/deep-research) - 感谢项目 `dzhng/deep-research` 的启发。

## 🤝 贡献

我们欢迎对 Deep Research 的贡献！如果您有改进想法、错误修复或新功能，请随时：

1. Fork 仓库。
2. 为您的功能或错误修复创建新分支。
3. 进行更改并提交。
4. 提交拉取请求。

对于重大更改，请先开启一个问题来讨论您提议的更改。

## ✉️ 联系

如果您有任何问题、建议或反馈，请创建一个新的 [issue](https://github.com/u14app/deep-research/issues)。

## 🌟 Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=u14app/deep-research&type=Date)](https://www.star-history.com/#u14app/deep-research&Date)

## 📝 许可证

Deep Research 在 [MIT 许可证](LICENSE) 下发布。此许可证允许免费使用、修改和分发，用于商业和非商业目的。
