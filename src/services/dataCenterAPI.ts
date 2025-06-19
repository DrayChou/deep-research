import { useAuthStore } from "@/store/auth";

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

interface HistoryMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: string;
  metadata?: any;
}

interface TopicHistory {
  topicId: string;
  title: string;
  messages: HistoryMessage[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 数据中心API服务类
 */
class DataCenterAPI {
  private getAuthHeaders(): Record<string, string> {
    const { jwt } = useAuthStore.getState();
    return {
      'Content-Type': 'application/json',
      'Authorization': jwt ? `Bearer ${jwt}` : '',
    };
  }

  private getBaseUrl(): string {
    const { dataBaseUrl } = useAuthStore.getState();
    return dataBaseUrl || process.env.NEXT_PUBLIC_DATA_CENTER_URL || '';
  }

  /**
   * 安全拼接API URL，避免路径重复
   */
  private buildApiUrl(endpoint: string): string {
    const base = this.getBaseUrl().replace(/\/+$/, ''); // 移除末尾斜杠
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

  /**
   * 获取话题历史记录（兼容旧方法，实际使用chatHistoryService）
   */
  async getTopicHistory(topicId: string): Promise<ApiResponse<TopicHistory>> {
    try {
      if (!this.getBaseUrl()) {
        throw new Error('数据中心URL未配置');
      }

      const response = await fetch(this.buildApiUrl(`chat/topics/${topicId}`), {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error('[DataCenterAPI] 获取话题历史失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 获取用户的所有话题列表
   */
  async getTopicList(): Promise<ApiResponse<TopicHistory[]>> {
    try {
      if (!this.getBaseUrl()) {
        throw new Error('数据中心URL未配置');
      }

      const response = await fetch(this.buildApiUrl('chat/topics'), {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error('[DataCenterAPI] 获取话题列表失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 验证JWT令牌有效性
   */
  async validateToken(): Promise<ApiResponse<{ valid: boolean; user?: any }>> {
    try {
      if (!this.getBaseUrl()) {
        throw new Error('数据中心URL未配置');
      }

      const response = await fetch(this.buildApiUrl('auth/me'), {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: { valid: true, user: data },
      };
    } catch (error) {
      console.error('[DataCenterAPI] JWT验证失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }
}

export const dataCenterAPI = new DataCenterAPI();
export type { ApiResponse, HistoryMessage, TopicHistory };
