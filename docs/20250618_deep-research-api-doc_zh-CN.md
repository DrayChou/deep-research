# Deep Research API 文档

## 概述

Deep Research API 提供了一个实时接口，用于启动和监控复杂的研究任务。通过利用服务器发送事件（SSE），它在事件发生时传递更新、信息、消息、进度和错误，允许客户端接收连续的数据流而无需轮询。

## 协议

此 API 使用基于 HTTP 的**服务器发送事件（SSE）**。客户端应建立 HTTP 连接并保持开放状态，以接收来自服务器的事件流。

## 数据格式

通过 SSE 发送的所有数据都遵循以下结构：

```text
event: EventName
data: JSON_String

```

- `event`：指定正在发送的事件类型（例如，`infor`、`message`、`reasoning`、`progress`、`error`）。
- `data`：包含与事件类型相关的 JSON 对象的字符串。
- 双换行符（`\n\n`）表示事件块的结束。

## API 配置

推荐通过 `@microsoft/fetch-event-source` 使用 API。

端点：`/api/sse`

方法：`POST`

请求体：

```typescript
interface Config {
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

有关具体的使用参数形式，请参见[示例代码](#客户端代码示例)。

## 响应事件

API 以一系列事件的形式流式传输数据。每个事件都有一个类型（`event`）和相关联的数据（`data`）。

### 通用结构

```text
event: [事件类型]
data: [JSON载荷]

```

### 事件类型

支持以下事件类型：

- `infor`
- `message`
- `reasoning`
- `progress`
- `error`

---

### `infor` 事件

在流的开始时发送（或在特定请求时）以提供有关 API 实例或研究会话的初始信息。

**描述：** 提供有关正在运行的 API 实例的基本信息。

**数据结构（`data` 字段）：** 表示以下结构的 JSON 字符串：

| 参数      | 类型   | 描述          |
| :-------- | :----- | :------------ |
| `name`    | string | 项目名称      |
| `version` | string | 当前 API 版本 |

```typescript
interface InforEvent {
  // 项目名称
  name: string;
  // 当前 API 版本
  version: string;
}
```

**示例：**

```text
event: infor
data: {"name":"deep-research","version":"0.1.0"}

```

---

### `message` 事件

用于向客户端发送深度研究的文本内容。

**描述：** 在研究过程中传递文本消息。

**数据结构（`data` 字段）：** 表示以下结构的 JSON 字符串：

| 参数   | 类型   | 描述                               | 备注                                   |
| :----- | :----- | :--------------------------------- | :------------------------------------- |
| `type` | string | 消息内容的类型                     | 目前仅支持 `"text"`。                  |
| `text` | string | 消息内容（Markdown 格式）。        | 对于未来类型是可选的，但对于 `"text"` 是必需的。 |

```typescript
interface MessageEvent {
  // 消息类型，目前仅支持 "text"
  type: "text";
  // 文本数据
  text?: string;
}
```

**示例：**

```text
event: message
data: {"type":"text","text":"这是一个 **markdown** 字符串。"}

```

---

### `reasoning` 事件

用于向客户端发送深度研究的思考内容。一些思考模型支持输出思考过程。

**描述：** 在研究过程中传递思考消息。

**数据结构（`data` 字段）：** 表示以下结构的 JSON 字符串：

| 参数   | 类型   | 描述                               | 备注                     |
| :----- | :----- | :--------------------------------- | :----------------------- |
| `type` | string | 推理内容的类型                     | 目前仅支持 `"text"`。    |
| `text` | string | 推理内容（Markdown 格式）。        | 对于 `"text"` 是必需的。 |

```typescript
interface ReasoningEvent {
  // 推理类型，目前仅支持 "text"
  type: "text";
  // 文本数据
  text: string;
}
```

**示例：**

```text
event: reasoning
data: {"type":"text","text":"输出思考过程"}

```

---

### `progress` 事件

传达研究任务执行的当前步骤和状态。这对于提供过程流的实时反馈至关重要。

**描述：** 指示研究任务的进度，包括当前步骤及其状态（开始或结束）。

**数据结构（`data` 字段）：** 表示以下结构的 JSON 字符串：

| 参数     | 类型                                                                            | 描述                                                                     | 备注                                                           |
| :------- | :------------------------------------------------------------------------------ | :----------------------------------------------------------------------- | :------------------------------------------------------------- |
| `step`   | "report-plan" \| "serp-query" \| "task-list" \| "search-task" \| "final-report" | 研究过程中当前步骤的标识符。                                             | 请参见下面的"可能的 `step` 值"。                               |
| `status` | "start" \| "end"                                                                | 当前步骤的状态。                                                         | 指示步骤是开始还是结束。请参见下面的"可能的 `status` 值"。     |
| `name`   | string                                                                          | 步骤特定实例的描述性名称（例如，特定搜索任务）。                         | 仅当 `step` 为 `"search-task"` 时包含。                       |
| `data`   | any                                                                             | 与步骤结果或详细信息相关的可选数据。                                     | 当 `status` 为 `"end"` 时可能包含。内容因步骤而异。            |

```typescript
interface ProgressEvent {
  // 当前步骤
  step:
    | "report-plan"
    | "serp-query"
    | "task-list"
    | "search-task"
    | "final-report";
  // 步骤的状态
  status: "start" | "end";
  // 特定任务的名称（例如，搜索查询）
  name?: string;
  // 与步骤结果或详细信息相关的数据
  data?: any;
}
```

**可能的 `step` 值：**

- `report-plan`：系统正在生成或处理整体报告计划。
- `serp-query`：系统正在执行搜索引擎结果页面（SERP）查询。
- `task-list`：系统正在生成或处理特定研究任务列表。
- `search-task`：系统正在执行特定搜索任务。此步骤包含 `name` 参数。
- `final-report`：系统正在编译或完成综合研究报告。

**可能的 `status` 值：**

- `start`：指示指定的 `step` 刚刚开始。
- `end`：指示指定的 `step` 刚刚完成。

**示例：**

```text
event: progress
data: {"step":"search-task","status":"start","name":"今年的AI趋势"}

event: progress
data: {"step":"search-task","status":"end","name":"今年的AI趋势","data":{"results_count": 15}}

```

---

### `error` 事件

当研究过程中发生阻止任务成功完成或需要用户注意的错误时发送。

**描述：** 表示发生了错误。

**数据结构（`data` 字段）：** 通常包含有关错误信息的 JSON 字符串。常见结构为：

| 参数      | 类型   | 描述                       | 备注 |
| :-------- | :----- | :------------------------- | :--- |
| `message` | string | 人类可读的错误描述。       |      |

```typescript
interface ErrorEvent {
  // 人类可读的错误描述。
  message: string;
}
```

**示例：**

```text
event: error
data: {"message":"无效的查询参数。"}

```

---

## 错误处理

客户端应始终监听 `error` 事件。收到 `error` 事件后，客户端通常应向用户显示错误消息，并可能认为当前研究任务已终止，除非 API 的行为另有说明。

## 客户端代码示例

此示例演示如何使用 `EventSource` API 连接到 SSE 端点并监听定义的事件类型，特别专注于显示 `message` 事件。

```typescript
import { fetchEventSource } from "@microsoft/fetch-event-source";

const ctrl = new AbortController();

let report = "";
fetchEventSource("/api/sse", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    // 如果您设置了访问密码
    // Authorization: "Bearer YOUR_ACCESS_PASSWORD",
  },
  body: JSON.stringify({
    query: "今年的AI趋势",
    provider: "google",
    thinkingModel: "gemini-2.0-flash-thinking-exp",
    taskModel: "gemini-2.0-flash-exp",
    searchProvider: "model",
    language: "zh-CN",
    maxResult: 5,
    enableCitationImage: true,
    enableReferences: true,
  }),
  signal: ctrl.signal,
  onmessage(msg) {
    const msgData = JSON.parse(msg.data);
    if (msg.event === "message") {
      if (msgData.type === "text") {
        report += msgData.text;
      }
    } else if (msg.event === "progress") {
      console.log(
        `[${msgData.step}]: ${msgData.name ? `${msgData.name} ` : ""}${
          msgData.status
        }`
      );
      if (msgData.data) console.log(msgData.data);
    } else if (msg.event === "error") {
      throw new Error(msgData.message);
    }
  },
  onclose() {
    console.log(report);
  },
});
```
