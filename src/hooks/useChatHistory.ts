import { useCallback, useEffect } from "react";
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

  // 创建新话题
  const createNewTopic = useCallback(async (query: string): Promise<string | null> => {
    try {
      if (!authStore.jwt || !authStore.dataBaseUrl) {
        console.warn('[useChatHistory] 缺少认证信息，无法创建云端话题');
        return null;
      }

      const topicId = await chatHistoryService.createDeepResearchTopic(query);
      authStore.setTopicId(topicId);
      console.log('[useChatHistory] 新话题创建成功:', topicId);
      return topicId;
    } catch (error) {
      console.error('[useChatHistory] 创建新话题失败:', error);
      return null;
    }
  }, [authStore]);

  // 保存聊天消息（用户-助手对话）
  const saveChatMessage = useCallback(async (role: 'user' | 'assistant', content: string, metadata?: any) => {
    if (!authStore.topicId || !authStore.jwt) {
      console.log('[useChatHistory] 无话题ID或认证信息，跳过保存聊天消息');
      return;
    }

    try {
      await chatHistoryService.saveChatMessage(authStore.topicId, role, content, metadata);
    } catch (error) {
      console.error('[useChatHistory] 保存聊天消息失败:', error);
    }
  }, [authStore.topicId, authStore.jwt]);

  // 创建话题并保存初始对话
  const createTopicWithInitialChat = useCallback(async (userQuery: string, aiResponse: string): Promise<string | null> => {
    try {
      if (!authStore.jwt || !authStore.dataBaseUrl) {
        console.warn('[useChatHistory] 缺少认证信息，无法创建云端话题');
        return null;
      }

      // 1. 创建话题
      const topicId = await chatHistoryService.createDeepResearchTopic(userQuery);
      authStore.setTopicId(topicId);
      console.log('[useChatHistory] 新话题创建成功:', topicId);

      // 2. 保存用户问题
      await chatHistoryService.saveChatMessage(topicId, 'user', userQuery, {
        chat_type: 'deep_research',
        stage: 'initial_query'
      });

      // 3. 保存AI回复
      await chatHistoryService.saveChatMessage(topicId, 'assistant', aiResponse, {
        chat_type: 'deep_research',
        stage: 'questions_generated'
      });

      console.log('[useChatHistory] 初始对话已保存');
      return topicId;
    } catch (error) {
      console.error('[useChatHistory] 创建话题和保存初始对话失败:', error);
      return null;
    }
  }, [authStore]);

  // 保存研究阶段数据
  const saveStageData = useCallback(async (stage: string, data: any) => {
    if (!authStore.topicId || !authStore.jwt) {
      console.log('[useChatHistory] 无话题ID或认证信息，跳过保存');
      return;
    }

    try {
      await chatHistoryService.saveStageMessage(authStore.topicId, stage, data);
    } catch (error) {
      console.error('[useChatHistory] 保存阶段数据失败:', error);
    }
  }, [authStore.topicId, authStore.jwt]);

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

  // 监听本地状态变化并自动保存
  useEffect(() => {
    if (!authStore.topicId || !authStore.jwt) {
      return;
    }

    let previousState = {
      questions: taskStore.questions,
      feedback: taskStore.feedback,
      suggestion: taskStore.suggestion,
      tasks: taskStore.tasks,
      finalReport: taskStore.finalReport,
      resources: taskStore.resources
    };

    // 防抖定时器
    let debounceTimer: NodeJS.Timeout;

    const unsubscribe = useTaskStore.subscribe((state) => {
      const currentState = {
        questions: state.questions,
        feedback: state.feedback,
        suggestion: state.suggestion,
        tasks: state.tasks,
        finalReport: state.finalReport,
        resources: state.resources
      };

      // 检查哪些字段发生了变化
      const changes: { stage: string; data: any }[] = [];

      if (currentState.questions !== previousState.questions && currentState.questions) {
        changes.push({
          stage: 'questions_generated',
          data: { questions: currentState.questions }
        });
      }

      if (currentState.feedback !== previousState.feedback && currentState.feedback) {
        changes.push({
          stage: 'user_feedback',
          data: { feedback: currentState.feedback }
        });
      }

      if (currentState.suggestion !== previousState.suggestion && currentState.suggestion) {
        changes.push({
          stage: 'user_suggestion',
          data: { suggestion: currentState.suggestion }
        });
      }

      if (JSON.stringify(currentState.tasks) !== JSON.stringify(previousState.tasks)) {
        const completed = currentState.tasks.filter(t => t.state === 'completed').length;
        const total = currentState.tasks.length;
        changes.push({
          stage: 'search_progress',
          data: { 
            tasks: currentState.tasks,
            progress: total > 0 ? (completed / total) * 100 : 0,
            completed,
            total
          }
        });
      }

      if (currentState.finalReport !== previousState.finalReport && currentState.finalReport) {
        changes.push({
          stage: 'final_report',
          data: { finalReport: currentState.finalReport }
        });
      }

      if (JSON.stringify(currentState.resources) !== JSON.stringify(previousState.resources)) {
        changes.push({
          stage: 'resources_added',
          data: { resources: currentState.resources }
        });
      }

      // 如果有变化，延迟保存
      if (changes.length > 0) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          for (const change of changes) {
            await saveStageData(change.stage, change.data);
          }
        }, 2000); // 2秒防抖
      }

      previousState = currentState;
    });

    return () => {
      clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [authStore.topicId, authStore.jwt, saveStageData, taskStore]);

  // 公共API
  return {
    // 初始化方法
    initializeOrLoadTopic,
    createNewTopic,
    createTopicWithInitialChat,
    
    // 消息保存方法
    saveChatMessage,
    saveStageData,
    updateTopicStatus,
    
    // 状态管理方法
    applyHistoryToStore,
    
    // 状态信息
    isConnected: process.env.NODE_ENV === 'development' 
      ? !!authStore.dataBaseUrl  // 开发环境只需要数据中心URL
      : !!(authStore.jwt && authStore.dataBaseUrl), // 生产环境需要JWT和数据中心URL
    currentTopicId: authStore.topicId,
    
    // 便捷方法
    saveUserQuery: (query: string) => saveChatMessage('user', query, { stage: 'user_query' }),
    saveAiResponse: (response: string, stage?: string) => saveChatMessage('assistant', response, { stage }),
    saveQuestionsGenerated: (questions: string) => saveChatMessage('assistant', questions, { stage: 'questions_generated' }),
    saveFeedback: (feedback: string) => saveChatMessage('user', feedback, { stage: 'user_feedback' }),
    saveSuggestion: (suggestion: string) => saveChatMessage('user', suggestion, { stage: 'user_suggestion' }),
    saveFinalReport: (report: string) => saveChatMessage('assistant', report, { stage: 'final_report' }),
    
    // 研究进度保存（使用原有的阶段消息格式）
    saveSearchProgress: (tasks: any[]) => {
      const completed = tasks.filter(t => t.state === 'completed').length;
      const total = tasks.length;
      return saveStageData('search_progress', { 
        tasks, 
        progress: total > 0 ? (completed / total) * 100 : 0,
        completed,
        total 
      });
    },
    saveResources: (resources: any[]) => saveStageData('resources_added', { resources }),
    
    // 话题状态更新
    markTopicInProgress: () => updateTopicStatus('in_progress'),
    markTopicCompleted: (finalData?: any) => updateTopicStatus('completed', finalData),
    markTopicError: (error: string) => updateTopicStatus('error', { error })
  };
};
