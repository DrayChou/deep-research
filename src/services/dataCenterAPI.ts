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
   * 获取话题历史记录
   */
  async getTopicHistory(topicId: string): Promise<ApiResponse<TopicHistory>> {
    try {
      const baseUrl = this.getBaseUrl();
      if (!baseUrl) {
        throw new Error('数据中心URL未配置');
      }

      const response = await fetch(`${baseUrl}/api/topics/${topicId}/history`, {
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
      const baseUrl = this.getBaseUrl();
      if (!baseUrl) {
        throw new Error('数据中心URL未配置');
      }

      const response = await fetch(`${baseUrl}/api/topics`, {
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
   * 保存研究结果到数据中心
   */
  async saveResearchResult(
    topicId: string,
    result: any,
    metadata?: any
  ): Promise<ApiResponse> {
    try {
      const baseUrl = this.getBaseUrl();
      if (!baseUrl) {
        throw new Error('数据中心URL未配置');
      }

      const response = await fetch(`${baseUrl}/api/topics/${topicId}/research`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          result,
          metadata,
          timestamp: new Date().toISOString(),
        }),
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
      console.error('[DataCenterAPI] 保存研究结果失败:', error);
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
      const baseUrl = this.getBaseUrl();
      if (!baseUrl) {
        throw new Error('数据中心URL未配置');
      }

      const response = await fetch(`${baseUrl}/api/auth/validate`, {
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
