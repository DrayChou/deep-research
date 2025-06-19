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
  metadata: {
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
  private baseUrl: string;
  private jwt: string;

  constructor() {
    this.baseUrl = this.getBaseUrl();
    this.jwt = this.getJWT();
  }

  private getBaseUrl(): string {
    const { dataBaseUrl } = useAuthStore.getState();
    return dataBaseUrl || process.env.NEXT_PUBLIC_DATA_CENTER_URL || '';
  }

  private getJWT(): string {
    const { jwt } = useAuthStore.getState();
    return jwt || '';
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
      throw new Error('数据中心配置不完整');
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
      const response = await fetch(`${this.baseUrl}/api/v1/chat/topics`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(topicData)
      });

      if (!response.ok) {
        throw new Error(`创建话题失败: ${response.status} ${response.statusText}`);
      }

      const topic = await response.json();
      console.log('[ChatHistoryService] 话题创建成功:', topic.id);
      return topic.id;
    } catch (error) {
      console.error('[ChatHistoryService] 创建话题失败:', error);
      throw error;
    }
  }

  /**
   * 加载现有话题的历史记录
   */
  async loadTopicHistory(topicId: string): Promise<DeepResearchState | null> {
    if (!this.baseUrl || !this.jwt) {
      console.warn('[ChatHistoryService] 数据中心配置不完整，跳过加载历史记录');
      return null;
    }

    try {
      // 1. 获取话题信息
      const topicResponse = await fetch(`${this.baseUrl}/api/v1/chat/topics/${topicId}`, {
        headers: this.getAuthHeaders()
      });

      if (!topicResponse.ok) {
        throw new Error(`获取话题失败: ${topicResponse.status}`);
      }

      const topic: ChatTopic = await topicResponse.json();

      // 2. 获取消息列表
      const messagesResponse = await fetch(`${this.baseUrl}/api/v1/chat/topics/${topicId}/messages`, {
        headers: this.getAuthHeaders()
      });

      if (!messagesResponse.ok) {
        throw new Error(`获取消息失败: ${messagesResponse.status}`);
      }

      const messages: ChatMessage[] = await messagesResponse.json();

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
   * 保存阶段消息
   */
  async saveStageMessage(topicId: string, stage: string, data: any): Promise<void> {
    if (!this.baseUrl || !this.jwt) {
      console.warn('[ChatHistoryService] 数据中心配置不完整，跳过保存消息');
      return;
    }

    const mapping = this.getStageMessageMapping();
    const stageConfig = mapping[stage];
    
    if (!stageConfig) {
      console.warn('[ChatHistoryService] 未知的阶段类型:', stage);
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
      const response = await fetch(`${this.baseUrl}/api/v1/chat/topics/${topicId}/messages`, {
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
      await fetch(`${this.baseUrl}/api/v1/chat/topics/${topicId}/metadata`, {
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
   * 重构本地状态
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
    if (topic.topic_metadata.deep_research_data?.user_query) {
      state.question = topic.topic_metadata.deep_research_data.user_query;
    }

    // 按时间排序消息
    const sortedMessages = messages.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // 从消息中重构状态
    for (const message of sortedMessages) {
      const stageData = message.metadata?.deep_research_data;
      if (!stageData) continue;

      switch (stageData.stage) {
        case 'questions_generated':
          state.questions = stageData.data?.questions || message.content;
          break;
        case 'user_feedback':
          state.feedback = message.content;
          break;
        case 'user_suggestion':
          state.suggestion = message.content;
          break;
        case 'search_progress':
          if (stageData.data?.tasks) {
            state.tasks = stageData.data.tasks;
          }
          break;
        case 'final_report':
          state.finalReport = message.content;
          break;
        case 'resources_added':
          if (stageData.data?.resources) {
            state.resources = stageData.data.resources;
          }
          break;
      }
    }

    return state;
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
   * 生成会话ID
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
