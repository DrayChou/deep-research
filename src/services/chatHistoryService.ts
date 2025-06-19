import { useAuthStore } from "@/store/auth";

/**
 * 聊天历史记录对接服务
 * 负责与数据中心的聊天系统集成
 */

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

interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  created_at: string;
  message_metadata: {
    message_type: string;
    deep_research_data?: {
      stage: string;
      progress: number;
      data: any;
    };
  };
}

interface DeepResearchState {
  question: string;
  questions: string;
  feedback: string;
  suggestion: string;
  tasks: any[];
  finalReport: string;
  resources: any[];
}

class ChatHistoryService {
  constructor() {
    // 移除静态属性，改为动态获取
  }

  private get baseUrl(): string {
    const { dataBaseUrl } = useAuthStore.getState();
    return dataBaseUrl || process.env.NEXT_PUBLIC_DATA_CENTER_URL || '';
  }

  private get jwt(): string {
    const { jwt } = useAuthStore.getState();
    return jwt || '';
  }

  /**
   * 安全拼接API URL，避免路径重复
   */
  private buildApiUrl(endpoint: string): string {
    const base = this.baseUrl.replace(/\/+$/, ''); // 移除末尾斜杠
    let path = endpoint.replace(/^\/+/, ''); // 移除开头斜杠
    
    // 检查base是否已经包含api/v1
    if (base.endsWith('/api/v1')) {
      // 如果endpoint也以api/v1开头，则移除重复部分
      if (path.startsWith('api/v1/')) {
        path = path.substring(7); // 移除 'api/v1/'
      }
    } else {
      // 如果base不包含api/v1，但endpoint以api/v1开头，保持不变
      // 如果都不包含，需要添加api/v1
      if (!path.startsWith('api/v1/')) {
        path = 'api/v1/' + path;
      }
    }
    
    return `${base}/${path}`;
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': this.jwt ? `Bearer ${this.jwt}` : '',
    };
  }

  /**
   * 创建新的深度研究话题
   */
  async createDeepResearchTopic(query: string): Promise<string> {
    if (!this.baseUrl || !this.jwt) {
      throw new Error('数据中心配置不完整：需要数据中心URL和JWT令牌');
    }

    const topicData = {
      title: this.generateTopicTitle(query),
      description: '深度研究任务',
      agent_type: 'deep_research',
      topic_metadata: {
        version: '1.0',
        chat_type: 'deep_research',
        deep_research_data: {
          session_id: this.generateSessionId(),
          start_time: new Date().toISOString(),
          user_query: query,
          config: this.getCurrentConfig()
        },
        deep_research_status: 'pending'
      }
    };

    try {
      const response = await fetch(this.buildApiUrl('chat/topics'), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(topicData)
      });

      if (!response.ok) {
        throw new Error(`创建话题失败: ${response.status} ${response.statusText}`);
      }

      const topic = await response.json();
      console.log('[ChatHistoryService] 话题创建响应:', topic);
      
      // 检查数据中心返回格式：{code: 200, message: "xxx", data: {...}}
      if (topic.code && topic.code !== 200) {
        throw new Error(`创建话题失败: ${topic.message || '未知错误'}`);
      }
      
      // 提取话题ID，优先使用data.id
      let topicId: string;
      if (topic.data && topic.data.id) {
        topicId = topic.data.id;
      } else if (topic.id) {
        topicId = topic.id;
      } else if (typeof topic === 'string') {
        topicId = topic;
      } else {
        console.error('[ChatHistoryService] 无法从响应中提取话题ID:', topic);
        throw new Error('无法从响应中提取话题ID');
      }
      
      console.log('[ChatHistoryService] 话题创建成功:', topicId);
      return topicId;
    } catch (error) {
      console.error('[ChatHistoryService] 创建话题失败:', error);
      throw error;
    }
  }

  /**
   * 加载现有话题的历史记录
   */
  async loadTopicHistory(topicId: string): Promise<DeepResearchState | null> {
    console.log('[ChatHistoryService] 检查配置 - baseUrl:', this.baseUrl, 'jwt:', this.jwt ? 'exists' : 'missing');
    
    if (!this.baseUrl || !this.jwt) {
      console.warn('[ChatHistoryService] 数据中心配置不完整，跳过加载历史记录');
      return null;
    }

    try {
      // 1. 获取话题信息
      const topicResponse = await fetch(this.buildApiUrl(`chat/topics/${topicId}`), {
        headers: this.getAuthHeaders()
      });

      if (!topicResponse.ok) {
        throw new Error(`获取话题失败: ${topicResponse.status}`);
      }

      const topicResponseData = await topicResponse.json();
      console.log('[ChatHistoryService] 话题数据:', topicResponseData);
      
      // 检查是否有data字段包装
      const topic: ChatTopic = topicResponseData.data || topicResponseData;

      // 2. 获取消息列表
      const messagesResponse = await fetch(this.buildApiUrl(`chat/topics/${topicId}/messages`), {
        headers: this.getAuthHeaders()
      });

      if (!messagesResponse.ok) {
        throw new Error(`获取消息失败: ${messagesResponse.status}`);
      }

      const messagesResponseData = await messagesResponse.json();
      console.log('[ChatHistoryService] 消息数据:', messagesResponseData);
      
      // 检查是否有data字段包装，并确保是数组
      let messages: ChatMessage[] = [];
      if (messagesResponseData.data && Array.isArray(messagesResponseData.data)) {
        messages = messagesResponseData.data;
      } else if (Array.isArray(messagesResponseData)) {
        messages = messagesResponseData;
      } else {
        console.warn('[ChatHistoryService] 消息数据格式异常:', messagesResponseData);
        messages = [];
      }

      // 3. 重构本地状态
      const state = this.reconstructLocalState(topic, messages);
      console.log('[ChatHistoryService] 历史记录加载成功:', topicId);
      return state;
    } catch (error) {
      console.error('[ChatHistoryService] 加载历史记录失败:', error);
      return null;
    }
  }

  /**
   * 保存完整的研究状态快照
   */
  async saveResearchSnapshot(topicId: string, stage: string, taskStore: any): Promise<void> {
    if (!this.baseUrl || !this.jwt) {
      console.warn('[ChatHistoryService] 数据中心配置不完整，跳过保存状态快照');
      return;
    }

    const messageData = {
      content: `📊 **研究状态快照 - ${stage}**`,
      role: 'assistant' as const,
      message_metadata: {
        message_type: 'research_snapshot',
        timestamp: new Date().toISOString(),
        deep_research_data: {
          stage: 'research_snapshot',
          progress: this.calculateProgress(taskStore),
          data: {
            snapshot_stage: stage,
            task_store: this.sanitizeData(taskStore),
            timestamp: new Date().toISOString()
          }
        }
      }
    };

    try {
      const response = await fetch(this.buildApiUrl(`chat/topics/${topicId}/messages`), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(messageData)
      });

      if (!response.ok) {
        throw new Error(`保存状态快照失败: ${response.status}`);
      }

      const message = await response.json();
      console.log('[ChatHistoryService] 研究状态快照保存成功:', message.id);
    } catch (error) {
      console.error('[ChatHistoryService] 保存状态快照失败:', error);
    }
  }

  /**
   * 计算研究进度
   */
  private calculateProgress(input: any): number {
    // 如果传入的是stage字符串
    if (typeof input === 'string') {
      const progressMap: Record<string, number> = {
        'user_query': 10,
        'questions_generated': 30,
        'user_feedback': 40,
        'search_progress': 70,
        'final_report': 100
      };
      return progressMap[input] || 0;
    }
    
    // 如果传入的是taskStore对象（兼容旧代码）
    const taskStore = input;
    let progress = 0;
    if (taskStore.question) progress += 10;
    if (taskStore.questions) progress += 20;
    if (taskStore.feedback) progress += 10;
    if (taskStore.tasks && taskStore.tasks.length > 0) {
      const completed = taskStore.tasks.filter((t: any) => t.state === 'completed').length;
      const total = taskStore.tasks.length;
      progress += (completed / total) * 50;
    }
    if (taskStore.finalReport) progress += 10;
    return Math.min(progress, 100);
  }

  /**
   * 保存用户消息（简单格式）
   */
  async saveUserMessage(topicId: string, content: string, stage: string): Promise<void> {
    if (!this.baseUrl || !this.jwt) {
      console.warn('[ChatHistoryService] 数据中心配置不完整，跳过保存用户消息');
      return;
    }

    const messageData = {
      content,
      role: 'user' as const,
      message_metadata: {
        message_type: 'user_input',
        stage,
        timestamp: new Date().toISOString()
      }
    };

    try {
      const response = await fetch(this.buildApiUrl(`chat/topics/${topicId}/messages`), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(messageData)
      });

      if (!response.ok) {
        throw new Error(`保存用户消息失败: ${response.status}`);
      }

      console.log('[ChatHistoryService] 用户消息保存成功');
    } catch (error) {
      console.error('[ChatHistoryService] 保存用户消息失败:', error);
      // 简化处理：直接抛出错误，不做重试
      throw error;
    }
  }

  /**
   * 保存AI阶段性回复（包含完整阶段数据）
   */
  async saveAIStageResponse(topicId: string, content: string, stage: string, stageData: any): Promise<void> {
    if (!this.baseUrl || !this.jwt) {
      console.warn('[ChatHistoryService] 数据中心配置不完整，跳过保存AI回复');
      return;
    }

    const messageData = {
      content,
      role: 'assistant' as const,
      message_metadata: {
        message_type: 'stage_response',
        deep_research_data: {
          stage,
          data: stageData,
          timestamp: new Date().toISOString(),
          progress: this.calculateProgress(stage)
        }
      }
    };

    try {
      const response = await fetch(this.buildApiUrl(`chat/topics/${topicId}/messages`), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(messageData)
      });

      if (!response.ok) {
        throw new Error(`保存AI回复失败: ${response.status}`);
      }

      console.log('[ChatHistoryService] AI阶段性回复保存成功');
    } catch (error) {
      console.error('[ChatHistoryService] 保存AI回复失败:', error);
      // 简化处理：直接抛出错误，不做重试
      throw error;
    }
  }

  /**
   * 保存阶段消息
   */
  async saveStageMessage(topicId: string, stage: string, data: any): Promise<void> {
    if (!this.baseUrl || !this.jwt) {
      console.warn('[ChatHistoryService] 数据中心配置不完整，跳过保存消息');
      return;
    }

    const mapping = this.getStageMessageMapping() as Record<string, { role: 'user' | 'assistant', message_type: string, content: (data: any) => string }>;
    const stageConfig = mapping[stage];
    
    if (!stageConfig) {
      console.warn('[ChatHistoryService] 未知的阶段类型：', stage);
      return;
    }

    const messageData = {
      content: stageConfig.content(data),
      role: stageConfig.role,
      metadata: {
        message_type: stageConfig.message_type,
        deep_research_data: {
          stage,
          timestamp: new Date().toISOString(),
          progress: data.progress || 0,
          data: this.sanitizeData(data)
        }
      }
    };

    try {
      const response = await fetch(this.buildApiUrl(`chat/topics/${topicId}/messages`), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(messageData)
      });

      if (!response.ok) {
        throw new Error(`保存消息失败: ${response.status}`);
      }

      const message = await response.json();
      console.log('[ChatHistoryService] 消息保存成功:', message.id);
    } catch (error) {
      console.error('[ChatHistoryService] 保存消息失败:', error);
    }
  }

  /**
   * 更新话题状态
   */
  async updateTopicStatus(topicId: string, status: string, data?: any): Promise<void> {
    if (!this.baseUrl || !this.jwt) {
      return;
    }

    const updateData = {
      topic_metadata: {
        deep_research_status: status,
        deep_research_data: {
          completion_time: status === 'completed' ? new Date().toISOString() : undefined,
          ...data
        }
      }
    };

    try {
      await fetch(this.buildApiUrl(`chat/topics/${topicId}/metadata`), {
        method: 'PATCH',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(updateData)
      });

      console.log('[ChatHistoryService] 话题状态更新成功:', status);
    } catch (error) {
      console.error('[ChatHistoryService] 更新话题状态失败:', error);
    }
  }

  /**
   * 重构本地状态（简化版：只从AI阶段性回复重构）
   */
  private reconstructLocalState(topic: ChatTopic, messages: ChatMessage[]): DeepResearchState {
    const state: DeepResearchState = {
      question: '',
      questions: '',
      feedback: '',
      suggestion: '',
      tasks: [],
      finalReport: '',
      resources: []
    };

    // 从话题元数据获取初始问题
    if (topic.topic_metadata && topic.topic_metadata.deep_research_data && topic.topic_metadata.deep_research_data?.user_query) {
      state.question = topic.topic_metadata.deep_research_data.user_query;
    }

    // 确保messages是数组，并按时间排序
    const messageArray = Array.isArray(messages) ? messages : [];
    console.log('[ChatHistoryService] 消息数组长度:', messageArray.length);
    
    if (messageArray.length === 0) {
      console.warn('[ChatHistoryService] 没有找到消息记录');
      return state;
    }

    const sortedMessages = messageArray.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // 只从AI的阶段性回复中重构状态
    for (const message of sortedMessages) {
      if (message.role === 'assistant' && 
          message.message_metadata?.message_type === 'stage_response' &&
          message.message_metadata?.deep_research_data) {
        
        const stageData = message.message_metadata.deep_research_data;
        this.applyStageToState(state, stageData.stage, message.content, stageData.data);
      }
    }

    console.log('[ChatHistoryService] 从AI阶段性回复重构本地状态完成');
    return state;
  }

  /**
   * 应用阶段数据到状态
   */
  private applyStageToState(state: DeepResearchState, stage: string, content: string, data?: any): void {
    switch (stage) {
      case 'user_query':
        // 用户问题已从话题元数据获取
        break;
      case 'questions_generated':
        state.questions = content;
        break;
      case 'user_feedback':
        state.feedback = data?.feedback || content;
        break;
      case 'user_suggestion':
        state.suggestion = data?.suggestion || content;
        break;
      case 'search_progress':
        if (data?.tasks) {
          state.tasks = data.tasks;
        }
        break;
      case 'final_report':
        state.finalReport = content;
        break;
      case 'resources_added':
        if (data?.resources) {
          state.resources = data.resources;
        }
        break;
    }
  }

  /**
   * 获取阶段消息映射配置
   */
  private getStageMessageMapping() {
    return {
      user_query: {
        role: 'user',
        message_type: 'user_input',
        content: (data: any) => data.question || data.query || ''
      },
      questions_generated: {
        role: 'assistant',
        message_type: 'questions_generation',
        content: (data: any) => `🤔 **研究问题生成**\n\n${data.questions || ''}`
      },
      user_feedback: {
        role: 'user',
        message_type: 'feedback',
        content: (data: any) => data.feedback || ''
      },
      user_suggestion: {
        role: 'user',
        message_type: 'suggestion',
        content: (data: any) => data.suggestion || ''
      },
      search_progress: {
        role: 'assistant',
        message_type: 'search_progress',
        content: (data: any) => {
          const completed = data.tasks?.filter((t: any) => t.state === 'completed').length || 0;
          const total = data.tasks?.length || 0;
          return `🔍 **搜索进度更新**\n\n进度：${completed}/${total} 任务完成`;
        }
      },
      final_report: {
        role: 'assistant',
        message_type: 'final_report',
        content: (data: any) => data.finalReport || ''
      },
      resources_added: {
        role: 'user',
        message_type: 'resources',
        content: (data: any) => {
          const count = data.resources?.length || 0;
          return `📎 **添加了 ${count} 个知识资源**`;
        }
      }
    };
  }

  /**
   * 清理数据，移除敏感信息
   */
  private sanitizeData(data: any): any {
    // 移除可能包含敏感信息的字段
    const sanitized = { ...data };
    delete sanitized.apiKey;
    delete sanitized.jwt;
    delete sanitized.accessPassword;
    return sanitized;
  }

  /**
   * 生成话题标题
   */
  private generateTopicTitle(query: string): string {
    const maxLength = 50;
    if (query.length <= maxLength) {
      return query;
    }
    return query.substring(0, maxLength - 3) + '...';
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): string {
    return `deep_research_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取当前配置
   */
  private getCurrentConfig(): any {
    // 这里可以从 useSettingStore 获取当前配置
    return {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      language: navigator.language
    };
  }
}

// 导出单例实例
export const chatHistoryService = new ChatHistoryService();
export type { ChatTopic, ChatMessage, DeepResearchState };
