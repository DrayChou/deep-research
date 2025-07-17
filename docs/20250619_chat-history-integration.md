# 聊天历史记录对接文档

## 概述

本文档描述如何将Deep Research应用与数据中心的聊天历史记录系统对接，实现聊天记录的云端存储和同步。

## 数据中心API分析

### 核心接口

1. **话题管理接口**
   - `GET /api/v1/chat/topics` - 获取话题列表
   - `POST /api/v1/chat/topics` - 创建新话题
   - `GET /api/v1/chat/topics/{topic_id}` - 获取话题详情
   - `PUT /api/v1/chat/topics/{topic_id}` - 更新话题
   - `PATCH /api/v1/chat/topics/{topic_id}/metadata` - 更新话题元数据

2. **消息管理接口**
   - `GET /api/v1/chat/topics/{topic_id}/messages` - 获取话题消息
   - `POST /api/v1/chat/topics/{topic_id}/messages` - 发送新消息
   - `PUT /api/v1/chat/topics/{topic_id}/messages/{message_id}` - 更新消息

## 数据结构对比

### Deep Research本地数据结构

```typescript
// useTaskStore 中的数据结构
interface TaskStore {
  question: string;          // 用户问题
  questions: string;         // AI生成的问题列表
  feedback: string;          // 用户反馈
  suggestion: string;        // 用户建议
  tasks: Task[];            // 搜索任务列表
  finalReport: string;       // 最终报告
  resources: Resource[];     // 知识资源
}

interface Task {
  query: string;
  state: 'pending' | 'running' | 'completed' | 'error';
  result: string;
  sources: Source[];
}
```

### 数据中心数据结构

```typescript
// 话题结构
interface ChatTopic {
  id: string;
  title: string;
  description: string;
  agent_id: string | null;
  agent_type: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  is_deleted: boolean;
  topic_metadata: {
    version: string;
    chat_type: string;
    deep_research_data?: {
      session_id: string;
      start_time: string;
      user_query: string;
      completion_time?: string;
      config: any;
    };
    deep_research_status: 'pending' | 'in_progress' | 'completed' | 'error';
  };
}

// 消息结构
interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  created_at: string;
  metadata: {
    message_type: string;
    deep_research_data?: {
      stage: string;
      progress: number;
      data: any;
    };
  };
}
```

## 对接策略

### 1. 话题生命周期管理

#### 创建新话题
```typescript
async function createDeepResearchTopic(query: string): Promise<string> {
  const topicData = {
    title: generateTopicTitle(query),
    description: '深度研究任务',
    agent_type: 'deep_research',
    topic_metadata: {
      version: '1.0',
      chat_type: 'deep_research',
      deep_research_data: {
        session_id: generateSessionId(),
        start_time: new Date().toISOString(),
        user_query: query,
        config: getCurrentConfig()
      },
      deep_research_status: 'pending'
    }
  };
  
  const response = await fetch('/api/v1/chat/topics', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(topicData)
  });
  
  const topic = await response.json();
  return topic.id;
}
```

#### 加载现有话题
```typescript
async function loadTopicHistory(topicId: string): Promise<DeepResearchState> {
  // 1. 获取话题信息
  const topicResponse = await fetch(`/api/v1/chat/topics/${topicId}`, {
    headers: { 'Authorization': `Bearer ${jwt}` }
  });
  const topic = await topicResponse.json();
  
  // 2. 获取消息列表
  const messagesResponse = await fetch(`/api/v1/chat/topics/${topicId}/messages`, {
    headers: { 'Authorization': `Bearer ${jwt}` }
  });
  const messages = await messagesResponse.json();
  
  // 3. 重构本地状态
  return reconstructLocalState(topic, messages);
}
```

### 2. 消息分段存储策略

Deep Research的流程包含多个阶段，每个阶段都需要单独记录：

#### 阶段消息映射
```typescript
const STAGE_MESSAGE_MAPPING = {
  // 用户输入阶段
  'user_query': {
    role: 'user',
    message_type: 'user_input',
    content: (data) => data.question
  },
  
  // AI问题生成阶段
  'questions_generated': {
    role: 'assistant',
    message_type: 'questions_generation',
    content: (data) => `生成了研究问题：\n\n${data.questions}`
  },
  
  // 用户反馈阶段
  'user_feedback': {
    role: 'user',
    message_type: 'feedback',
    content: (data) => data.feedback
  },
  
  // 搜索任务执行阶段
  'search_progress': {
    role: 'assistant',
    message_type: 'search_progress',
    content: (data) => `搜索进度更新：${data.completed}/${data.total} 任务完成`
  },
  
  // 最终报告阶段
  'final_report': {
    role: 'assistant',
    message_type: 'final_report',
    content: (data) => data.finalReport
  }
};
```

#### 消息保存策略
```typescript
class MessagePersistence {
  private topicId: string;
  private messageBuffer: Map<string, any> = new Map();
  
  async saveStageMessage(stage: string, data: any): Promise<void> {
    const mapping = STAGE_MESSAGE_MAPPING[stage];
    if (!mapping) return;
    
    const messageData = {
      content: mapping.content(data),
      role: mapping.role,
      metadata: {
        message_type: mapping.message_type,
        deep_research_data: {
          stage,
          timestamp: new Date().toISOString(),
          data: this.sanitizeData(data)
        }
      }
    };
    
    // 检查是否需要更新现有消息
    const existingMessageId = this.messageBuffer.get(stage);
    if (existingMessageId) {
      await this.updateMessage(existingMessageId, messageData);
    } else {
      const messageId = await this.createMessage(messageData);
      this.messageBuffer.set(stage, messageId);
    }
  }
  
  private async createMessage(messageData: any): Promise<string> {
    const response = await fetch(`/api/v1/chat/topics/${this.topicId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getJWT()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messageData)
    });
    
    const message = await response.json();
    return message.id;
  }
  
  private async updateMessage(messageId: string, messageData: any): Promise<void> {
    await fetch(`/api/v1/chat/topics/${this.topicId}/messages/${messageId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${getJWT()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messageData)
    });
  }
}
```

### 3. 状态重构策略

从数据中心加载的消息需要重构为本地状态：

```typescript
function reconstructLocalState(topic: ChatTopic, messages: ChatMessage[]): TaskStore {
  const state: Partial<TaskStore> = {
    question: '',
    questions: '',
    feedback: '',
    suggestion: '',
    tasks: [],
    finalReport: '',
    resources: []
  };
  
  // 按时间排序消息
  const sortedMessages = messages.sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  
  for (const message of sortedMessages) {
    const { metadata } = message;
    const stageData = metadata?.deep_research_data;
    
    if (!stageData) continue;
    
    switch (stageData.stage) {
      case 'user_query':
        state.question = topic.topic_metadata.deep_research_data.user_query;
        break;
        
      case 'questions_generated':
        state.questions = stageData.data.questions || '';
        break;
        
      case 'user_feedback':
        state.feedback = message.content;
        break;
        
      case 'search_progress':
        if (stageData.data.tasks) {
          state.tasks = stageData.data.tasks;
        }
        break;
        
      case 'final_report':
        state.finalReport = message.content;
        break;
    }
  }
  
  return state as TaskStore;
}
```

### 4. 实时同步机制

#### 监听本地状态变化
```typescript
class StateSync {
  private topicId: string;
  private messagePersistence: MessagePersistence;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  
  constructor(topicId: string) {
    this.topicId = topicId;
    this.messagePersistence = new MessagePersistence(topicId);
    this.setupStoreListeners();
  }
  
  private setupStoreListeners(): void {
    const taskStore = useTaskStore.getState();
    
    // 监听问题变化
    useTaskStore.subscribe((state) => {
      if (state.questions !== taskStore.questions) {
        this.debouncedSave('questions_generated', { questions: state.questions });
      }
      
      if (state.feedback !== taskStore.feedback) {
        this.debouncedSave('user_feedback', { feedback: state.feedback });
      }
      
      if (state.tasks !== taskStore.tasks) {
        this.debouncedSave('search_progress', { 
          tasks: state.tasks,
          completed: state.tasks.filter(t => t.state === 'completed').length,
          total: state.tasks.length
        });
      }
      
      if (state.finalReport !== taskStore.finalReport) {
        this.debouncedSave('final_report', { finalReport: state.finalReport });
      }
    });
  }
  
  private debouncedSave(stage: string, data: any): void {
    const existingTimer = this.debounceTimers.get(stage);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    const timer = setTimeout(() => {
      this.messagePersistence.saveStageMessage(stage, data);
      this.debounceTimers.delete(stage);
    }, 1000); // 1秒防抖
    
    this.debounceTimers.set(stage, timer);
  }
}
```

## 实施步骤

### 第一阶段：基础对接
1. 实现JWT认证机制
2. 实现话题创建和加载
3. 实现基础消息保存

### 第二阶段：完整同步
1. 实现所有阶段的消息分段存储
2. 实现状态重构逻辑
3. 实现实时同步机制

### 第三阶段：优化增强
1. 实现离线缓存
2. 实现冲突解决
3. 实现数据备份

## 注意事项

1. **数据一致性**：确保本地状态与云端数据的一致性
2. **性能优化**：使用防抖机制避免频繁的网络请求
3. **错误处理**：网络异常时的降级策略
4. **数据安全**：敏感信息的加密存储
5. **版本兼容**：考虑数据格式的向后兼容性

## 示例配置

```typescript
// 环境变量配置
NEXT_PUBLIC_DATA_CENTER_URL=https://api.datacenter.com
NEXT_PUBLIC_DATA_CENTER_JWT=your-jwt-token

// URL参数示例
/?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...&topicId=123e4567-e89b-12d3-a456-426614174000&provider=deepseek&apiKey=sk-xxx
```

这样的设计既保持了与现有系统的兼容性，又实现了云端同步的功能。
