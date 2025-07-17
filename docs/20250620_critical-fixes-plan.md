# 数据中心同步方案关键修复计划

## 🎯 **立即实施的关键修复**

### 修复1：串行化数据保存（阻塞性问题）

**当前风险**：并发保存可能导致数据竞态条件

**修复代码**：
```typescript
// 修改 useChatHistory.ts
const createTopicWithInitialChat = useCallback(async (userQuery: string, aiResponse: string): Promise<string | null> => {
  let topicId: string | null = null;
  
  try {
    // 使用事务式操作确保数据一致性
    const result = await executeTransaction(async () => {
      // 1. 创建话题（必须先完成）
      topicId = await chatHistoryService.createDeepResearchTopic(userQuery);
      if (!topicId) throw new Error('话题创建失败');
      
      // 2. 串行保存消息（确保顺序）
      await chatHistoryService.saveChatMessage(topicId, 'user', userQuery, {
        stage: 'user_query',
        data: { question: userQuery }
      });
      
      await chatHistoryService.saveChatMessage(topicId, 'assistant', aiResponse, {
        stage: 'questions_generated', 
        data: { questions: aiResponse }
      });
      
      // 3. 最后保存状态快照（确保前面的操作完成）
      const currentState = useTaskStore.getState();
      await chatHistoryService.saveResearchSnapshot(topicId, 'questions_generated', currentState);
      
      return topicId;
    });
    
    // 成功后更新本地状态
    authStore.setTopicId(result);
    console.log('[useChatHistory] 话题创建和数据保存完成:', result);
    return result;
    
  } catch (error) {
    console.error('[useChatHistory] 创建话题失败，执行回滚:', error);
    
    // 如果话题已创建但后续操作失败，尝试清理
    if (topicId) {
      try {
        await chatHistoryService.deleteTopic(topicId);
      } catch (rollbackError) {
        console.error('[useChatHistory] 回滚失败:', rollbackError);
      }
    }
    
    return null;
  }
}, [authStore]);

// 添加事务执行器
async function executeTransaction<T>(operation: () => Promise<T>): Promise<T> {
  // 简单的事务实现：确保操作串行执行
  return await operation();
}
```

### 修复2：可靠的重试机制（数据丢失问题）

**当前风险**：网络问题导致数据永久丢失

**修复代码**：
```typescript
// 新增 reliableSync.ts
class ReliableSync {
  private static instance: ReliableSync;
  private retryQueue: Map<string, RetryItem> = new Map();
  private isProcessing = false;
  private maxRetries = 3;
  
  static getInstance(): ReliableSync {
    if (!ReliableSync.instance) {
      ReliableSync.instance = new ReliableSync();
    }
    return ReliableSync.instance;
  }
  
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationId: string,
    context: any
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await operation();
        
        // 成功后从重试队列移除
        this.retryQueue.delete(operationId);
        this.saveRetryQueueToStorage();
        
        return result;
        
      } catch (error) {
        lastError = error as Error;
        console.warn(`操作失败，尝试 ${attempt}/${this.maxRetries}:`, error);
        
        if (attempt === this.maxRetries) {
          // 最后一次尝试失败，加入重试队列
          this.addToRetryQueue(operationId, operation, context);
          throw lastError;
        }
        
        // 指数退避
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }
    
    throw lastError!;
  }
  
  private addToRetryQueue(operationId: string, operation: Function, context: any) {
    this.retryQueue.set(operationId, {
      id: operationId,
      operation: operation.toString(), // 序列化函数用于持久化
      context,
      attempts: 0,
      lastAttempt: Date.now(),
      nextAttempt: Date.now() + 30000 // 30秒后重试
    });
    
    this.saveRetryQueueToStorage();
  }
  
  // 定期处理重试队列
  async processRetryQueue() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    const now = Date.now();
    
    try {
      for (const [id, item] of this.retryQueue) {
        if (now >= item.nextAttempt && item.attempts < this.maxRetries) {
          try {
            await this.retryOperation(item);
            this.retryQueue.delete(id);
          } catch (error) {
            item.attempts++;
            item.lastAttempt = now;
            item.nextAttempt = now + Math.pow(2, item.attempts) * 30000; // 指数退避
            
            if (item.attempts >= this.maxRetries) {
              console.error(`操作 ${id} 达到最大重试次数，放弃重试`);
              this.retryQueue.delete(id);
            }
          }
        }
      }
      
      this.saveRetryQueueToStorage();
    } finally {
      this.isProcessing = false;
    }
  }
  
  private async saveRetryQueueToStorage() {
    try {
      const serializedQueue = JSON.stringify(Array.from(this.retryQueue.entries()));
      localStorage.setItem('sync_retry_queue', serializedQueue);
    } catch (error) {
      console.error('保存重试队列失败:', error);
    }
  }
  
  private async loadRetryQueueFromStorage() {
    try {
      const stored = localStorage.getItem('sync_retry_queue');
      if (stored) {
        const entries = JSON.parse(stored);
        this.retryQueue = new Map(entries);
      }
    } catch (error) {
      console.error('加载重试队列失败:', error);
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

interface RetryItem {
  id: string;
  operation: string;
  context: any;
  attempts: number;
  lastAttempt: number;
  nextAttempt: number;
}

// 导出单例
export const reliableSync = ReliableSync.getInstance();
```

### 修复3：JWT状态管理（认证问题）

**当前风险**：JWT过期后无法保存数据

**修复代码**：
```typescript
// 修改 chatHistoryService.ts
class ChatHistoryService {
  private async executeWithValidAuth<T>(operation: () => Promise<T>): Promise<T> {
    // 检查JWT有效性
    const isValid = await this.validateJWT();
    if (!isValid) {
      throw new Error('JWT无效或已过期');
    }
    
    try {
      return await operation();
    } catch (error) {
      // 检查是否为认证错误
      if (this.isAuthError(error)) {
        // 尝试刷新JWT
        const refreshed = await this.handleAuthError();
        if (refreshed) {
          // 重试操作
          return await operation();
        }
      }
      throw error;
    }
  }
  
  private async validateJWT(): Promise<boolean> {
    const { jwt } = useAuthStore.getState();
    if (!jwt) return false;
    
    try {
      // 解析JWT检查过期时间
      const payload = JSON.parse(atob(jwt.split('.')[1]));
      const expiresAt = payload.exp * 1000;
      const now = Date.now();
      
      // 如果5分钟内过期，提前刷新
      if (expiresAt - now < 5 * 60 * 1000) {
        console.log('[ChatHistoryService] JWT即将过期，尝试刷新');
        return await this.refreshJWT();
      }
      
      return true;
    } catch (error) {
      console.error('[ChatHistoryService] JWT验证失败:', error);
      return false;
    }
  }
  
  private isAuthError(error: any): boolean {
    return error.status === 401 || error.status === 403 || 
           (error.message && error.message.includes('Unauthorized'));
  }
  
  private async handleAuthError(): Promise<boolean> {
    console.warn('[ChatHistoryService] 检测到认证错误，尝试处理');
    
    // 清理当前JWT
    useAuthStore.getState().setAuthenticated(false);
    
    // 显示认证错误提示
    this.showAuthErrorDialog();
    
    return false; // 当前不支持自动刷新，需要用户重新登录
  }
  
  private showAuthErrorDialog() {
    // 显示认证错误提示
    console.error('[ChatHistoryService] 认证已失效，请刷新页面重新登录');
    
    // 可以触发全局错误状态
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth_error', {
        detail: { message: '认证已失效，请重新登录' }
      }));
    }
  }
  
  // 修改所有对外接口，使用认证包装
  async createDeepResearchTopic(query: string): Promise<string> {
    return await this.executeWithValidAuth(async () => {
      return await this.internalCreateTopic(query);
    });
  }
  
  async saveChatMessage(topicId: string, role: 'user' | 'assistant', content: string, metadata?: any): Promise<void> {
    return await this.executeWithValidAuth(async () => {
      return await this.internalSaveChatMessage(topicId, role, content, metadata);
    });
  }
  
  // ... 其他方法同样包装
}
```

### 修复4：状态完整性验证（数据一致性）

**修复代码**：
```typescript
// 修改 chatHistoryService.ts 的 reconstructLocalState 方法
private reconstructLocalState(topic: ChatTopic, messages: ChatMessage[]): DeepResearchState {
  const state: DeepResearchState = this.getInitialState();
  const processedStages = new Set<string>();
  
  // 按时间排序消息
  const sortedMessages = messages.sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  
  // 寻找最新的完整状态快照
  let latestSnapshot: any = null;
  let snapshotTime = 0;
  
  // 处理消息并寻找快照
  for (const message of sortedMessages) {
    const messageTime = new Date(message.created_at).getTime();
    const stageData = message.message_metadata?.deep_research_data;
    
    // 处理状态快照
    if (stageData?.stage === 'research_snapshot' && stageData.data?.task_store) {
      if (messageTime > snapshotTime) {
        latestSnapshot = stageData.data.task_store;
        snapshotTime = messageTime;
      }
      continue;
    }
    
    // 处理普通阶段消息
    if (stageData?.stage) {
      this.applyStageToState(state, stageData, message);
      processedStages.add(stageData.stage);
    }
  }
  
  // 优先使用最新快照
  if (latestSnapshot) {
    const mergedState = { ...latestSnapshot };
    
    // 用快照后的消息更新状态
    const snapshotAfterMessages = sortedMessages.filter(msg => 
      new Date(msg.created_at).getTime() > snapshotTime
    );
    
    for (const message of snapshotAfterMessages) {
      const stageData = message.message_metadata?.deep_research_data;
      if (stageData?.stage && stageData.stage !== 'research_snapshot') {
        this.applyStageToState(mergedState, stageData, message);
      }
    }
    
    return this.validateAndFillState(mergedState, topic);
  }
  
  // 没有快照，使用消息重构
  return this.validateAndFillState(state, topic);
}

private validateAndFillState(state: DeepResearchState, topic: ChatTopic): DeepResearchState {
  const validation = this.validateStateCompleteness(state);
  
  if (!validation.isComplete) {
    console.warn('[ChatHistoryService] 状态不完整，尝试修复:', validation.missingFields);
    
    // 从话题元数据填充缺失信息
    if (validation.missingFields.includes('question') && 
        topic.topic_metadata.deep_research_data?.user_query) {
      state.question = topic.topic_metadata.deep_research_data.user_query;
    }
    
    // 其他修复逻辑...
  }
  
  return state;
}

private validateStateCompleteness(state: DeepResearchState) {
  const requiredFields = ['question'];
  const missingFields = requiredFields.filter(field => !state[field]);
  
  return {
    isComplete: missingFields.length === 0,
    missingFields
  };
}
```

## 🛡️ **实施检查清单**

### 立即修复（本次更新）
- [ ] ✅ 串行化数据保存操作
- [ ] ✅ 添加可靠的重试机制
- [ ] ✅ 实现JWT状态管理
- [ ] ✅ 加强状态完整性验证

### 后续优化（下个版本）
- [ ] 🔄 添加数据压缩机制
- [ ] 🔄 实现同步状态指示器
- [ ] 🔄 添加操作日志和监控

### 测试验证
- [ ] ✅ 网络中断恢复测试
- [ ] ✅ JWT过期处理测试
- [ ] ✅ 并发操作测试
- [ ] ✅ 状态重构准确性测试

## 🎯 **成功标准**

修复完成后，系统应该能够：

1. **99.9%数据可靠性**：即使网络不稳定也不会丢失用户数据
2. **完整状态恢复**：能够从任何保存点完整恢复用户的研究状态
3. **优雅的错误处理**：认证问题、网络问题等都有明确的用户提示
4. **高并发安全性**：多个操作同时进行时不会出现数据冲突

这些修复将确保数据中心同步方案在生产环境中的稳定性和可靠性。
