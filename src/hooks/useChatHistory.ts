import { useCallback } from "react";
import { useAuthStore } from "@/store/auth";
import { useTaskStore } from "@/store/task";
import { chatHistoryService, type DeepResearchState } from "@/services/chatHistoryService";

/**
 * 聊天历史记录集成Hook
 * 负责管理Deep Research与数据中心的历史记录同步
 */
export const useChatHistory = () => {
  const authStore = useAuthStore();
  const taskStore = useTaskStore();

  // 应用历史状态到本地store
  const applyHistoryToStore = useCallback((historyState: DeepResearchState) => {
    // 更新任务store中的状态
    if (historyState.question) {
      taskStore.setQuestion(historyState.question);
    }
    if (historyState.questions) {
      taskStore.updateQuestions(historyState.questions);
    }
    if (historyState.feedback) {
      taskStore.setFeedback(historyState.feedback);
    }
    if (historyState.suggestion) {
      taskStore.setSuggestion(historyState.suggestion);
    }
    if (historyState.finalReport) {
      taskStore.updateFinalReport(historyState.finalReport);
    }
    if (historyState.tasks && historyState.tasks.length > 0) {
      // 更新任务列表
      taskStore.update(historyState.tasks);
    }
    if (historyState.resources && historyState.resources.length > 0) {
      // 清空现有资源并添加历史资源
      const currentState = taskStore.backup();
      taskStore.clear();
      taskStore.restore({
        ...currentState,
        resources: historyState.resources
      });
    }
  }, [taskStore]);

  // 初始化话题或加载历史记录
  const initializeOrLoadTopic = useCallback(async (topicId?: string): Promise<string | null> => {
    try {
      if (topicId) {
        // 加载现有话题的历史记录
        console.log('[useChatHistory] 正在加载话题历史记录：', topicId);
        const historyState = await chatHistoryService.loadTopicHistory(topicId);
        
        if (historyState) {
          // 应用历史状态到本地store
          applyHistoryToStore(historyState);
          console.log('[useChatHistory] 历史记录已应用到本地状态');
          return topicId;
        } else {
          console.warn('[useChatHistory] 无法加载历史记录，将创建新话题');
        }
      }

      // 如果没有提供topicId或加载失败，则在用户开始研究时创建新话题
      return null;
    } catch (error) {
      console.error('[useChatHistory] 初始化话题失败：', error);
      return null;
    }
  }, [applyHistoryToStore]);

  // 保存完整的研究状态快照（重命名为saveStateSnapshot）
  const saveStateSnapshot = useCallback(async (stage: string) => {
    if (!authStore.topicId || !authStore.jwt) {
      console.log('[useChatHistory] 无话题ID或认证信息，跳过保存状态快照');
      return;
    }

    try {
      const taskStore = useTaskStore.getState();
      await chatHistoryService.saveResearchSnapshot(authStore.topicId, stage, taskStore.backup());
    } catch (error) {
      console.error('[useChatHistory] 保存状态快照失败:', error);
    }
  }, [authStore.topicId, authStore.jwt]);

  // 显示JWT过期提示
  const showJWTExpiredDialog = useCallback(() => {
    if (typeof window !== 'undefined') {
      alert('认证已过期，请刷新页面重新登录');
      // 可以考虑自动刷新页面
      // window.location.reload();
    }
  }, []);

  // 创建话题并保存初始对话（简化版）
  const createTopicWithInitialChat = useCallback(async (userQuery: string, aiResponse: string): Promise<string | null> => {
    try {
      if (!authStore.jwt || !authStore.dataBaseUrl) {
        console.warn('[useChatHistory] 缺少认证信息，无法创建云端话题');
        return null;
      }

      console.log('[useChatHistory] 开始创建话题并保存初始对话');

      // 1. 创建话题
      const topicId = await chatHistoryService.createDeepResearchTopic(userQuery);
      
      if (!topicId) {
        throw new Error('话题创建失败：未返回话题ID');
      }
      
      authStore.setTopicId(topicId);
      console.log('[useChatHistory] 新话题创建成功:', topicId);

      // 2. 串行保存消息（简化处理）
      try {
        // 保存用户问题
        await chatHistoryService.saveUserMessage(topicId, userQuery, 'user_query');
        
        // 保存AI阶段性回复
        await chatHistoryService.saveAIStageResponse(topicId, aiResponse, 'questions_generated', {
          questions: aiResponse
        });

        console.log('[useChatHistory] 初始对话保存完成');
        return topicId;
        
      } catch (saveError) {
        console.error('[useChatHistory] 保存消息失败:', saveError);
        // 简化错误处理：清理话题ID，让用户重试
        authStore.setTopicId('');
        throw saveError;
      }

    } catch (error) {
      console.error('[useChatHistory] 创建话题失败:', error);
      
      // 简化错误处理：检查JWT过期
      if (error instanceof Error && (error.message.includes('401') || error.message.includes('Unauthorized'))) {
        showJWTExpiredDialog();
      }
      
      return null;
    }
  }, [authStore, showJWTExpiredDialog]);

  // 简化版便捷方法
  const saveUserQuery = useCallback(async (content: string) => {
    if (!authStore.topicId) return;
    try {
      await chatHistoryService.saveUserMessage(authStore.topicId, content, 'user_query');
    } catch (error) {
      console.error('[useChatHistory] 保存用户问题失败:', error);
    }
  }, [authStore.topicId]);

  const saveFeedback = useCallback(async (content: string) => {
    if (!authStore.topicId) return;
    try {
      await chatHistoryService.saveAIStageResponse(authStore.topicId, content, 'user_feedback', {
        feedback: content
      });
    } catch (error) {
      console.error('[useChatHistory] 保存用户反馈失败:', error);
    }
  }, [authStore.topicId]);

  const saveFinalReport = useCallback(async (content: string) => {
    if (!authStore.topicId) return;
    try {
      await chatHistoryService.saveAIStageResponse(authStore.topicId, content, 'final_report', {
        finalReport: content
      });
    } catch (error) {
      console.error('[useChatHistory] 保存最终报告失败:', error);
    }
  }, [authStore.topicId]);

  const markTopicCompleted = useCallback(async () => {
    if (!authStore.topicId) return;
    try {
      await chatHistoryService.updateTopicStatus(authStore.topicId, 'completed');
    } catch (error) {
      console.error('[useChatHistory] 标记话题完成失败:', error);
    }
  }, [authStore.topicId]);

  // 更新话题状态
  const updateTopicStatus = useCallback(async (status: string, data?: any) => {
    if (!authStore.topicId || !authStore.jwt) {
      return;
    }

    try {
      await chatHistoryService.updateTopicStatus(authStore.topicId, status, data);
    } catch (error) {
      console.error('[useChatHistory] 更新话题状态失败:', error);
    }
  }, [authStore.topicId, authStore.jwt]);

  // 移除复杂的自动监听，简化处理（用户需要在必要时手动保存）

  // 公共API（简化版）
  return {
    // 核心方法
    initializeOrLoadTopic,
    createTopicWithInitialChat,
    
    // 简化的便捷方法
    saveUserQuery,
    saveFeedback, 
    saveFinalReport,
    markTopicCompleted,
    
    // 状态管理
    updateTopicStatus,
    saveStateSnapshot,
    
    // 状态信息
    currentTopicId: authStore.topicId,
    isConnected: process.env.NODE_ENV === 'development' 
      ? !!authStore.dataBaseUrl  // 开发环境只需要数据中心URL
      : !!(authStore.jwt && authStore.dataBaseUrl), // 生产环境需要JWT和数据中心URL
  };
};
