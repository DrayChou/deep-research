import { useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSettingStore } from "@/store/setting";

// URL参数接口定义
export interface UrlConfigParams {
  // AI Provider配置
  provider?: string;           // AI厂商名称 (google, openai, anthropic, deepseek, etc.)
  apiKey?: string;            // API密钥
  thinkingModel?: string;     // 思考模型名称
  taskModel?: string;         // 任务模型名称 (networkingModel)
  
  // 认证相关
  jwt?: string;               // JWT令牌用于数据中心请求
  accessPassword?: string;    // 访问密码
  
  // 话题相关
  topicId?: string;          // 话题ID，用于获取历史记录
  
  // 搜索配置
  searchProvider?: string;    // 搜索提供商
  searchMaxResult?: number;   // 最大搜索结果数
  
  // 其他配置
  language?: string;          // 界面语言
  theme?: string;            // 主题
  mode?: string;             // 模式
}

/**
 * URL参数管理Hook
 * 支持通过URL参数预配置应用设置
 */
export const useUrlConfig = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const settingStore = useSettingStore();

  // 解析URL参数
  const parseUrlParams = useCallback((): UrlConfigParams => {
    const params: UrlConfigParams = {};
    
    // AI Provider配置
    if (searchParams.get('provider')) params.provider = searchParams.get('provider')!;
    if (searchParams.get('apiKey')) params.apiKey = searchParams.get('apiKey')!;
    if (searchParams.get('thinkingModel')) params.thinkingModel = searchParams.get('thinkingModel')!;
    if (searchParams.get('taskModel')) params.taskModel = searchParams.get('taskModel')!;
    
    // 认证相关
    if (searchParams.get('jwt')) params.jwt = searchParams.get('jwt')!;
    if (searchParams.get('accessPassword')) params.accessPassword = searchParams.get('accessPassword')!;
    
    // 话题相关
    if (searchParams.get('topicId')) params.topicId = searchParams.get('topicId')!;
    
    // 搜索配置
    if (searchParams.get('searchProvider')) params.searchProvider = searchParams.get('searchProvider')!;
    if (searchParams.get('searchMaxResult')) {
      const maxResult = parseInt(searchParams.get('searchMaxResult')!);
      if (!isNaN(maxResult)) params.searchMaxResult = maxResult;
    }
    
    // 其他配置
    if (searchParams.get('language')) params.language = searchParams.get('language')!;
    if (searchParams.get('theme')) params.theme = searchParams.get('theme')!;
    if (searchParams.get('mode')) params.mode = searchParams.get('mode')!;
    
    return params;
  }, [searchParams]);

  // 应用URL参数到设置
  const applyUrlConfig = useCallback((params: UrlConfigParams) => {
    const updates: Partial<typeof settingStore> = {};
    
    // AI Provider配置
    if (params.provider) {
      updates.provider = params.provider;
      
      // 根据provider设置对应的API Key
      switch (params.provider) {
        case 'google':
          if (params.apiKey) updates.apiKey = params.apiKey;
          if (params.thinkingModel) updates.thinkingModel = params.thinkingModel;
          if (params.taskModel) updates.networkingModel = params.taskModel;
          break;
        case 'openai':
          if (params.apiKey) updates.openAIApiKey = params.apiKey;
          if (params.thinkingModel) updates.openAIThinkingModel = params.thinkingModel;
          if (params.taskModel) updates.openAINetworkingModel = params.taskModel;
          break;
        case 'anthropic':
          if (params.apiKey) updates.anthropicApiKey = params.apiKey;
          if (params.thinkingModel) updates.anthropicThinkingModel = params.thinkingModel;
          if (params.taskModel) updates.anthropicNetworkingModel = params.taskModel;
          break;
        case 'deepseek':
          if (params.apiKey) updates.deepseekApiKey = params.apiKey;
          if (params.thinkingModel) updates.deepseekThinkingModel = params.thinkingModel;
          if (params.taskModel) updates.deepseekNetworkingModel = params.taskModel;
          break;
        case 'openrouter':
          if (params.apiKey) updates.openRouterApiKey = params.apiKey;
          if (params.thinkingModel) updates.openRouterThinkingModel = params.thinkingModel;
          if (params.taskModel) updates.openRouterNetworkingModel = params.taskModel;
          break;
      }
    }
    
    // 认证相关
    if (params.accessPassword) updates.accessPassword = params.accessPassword;
    
    // 搜索配置
    if (params.searchProvider) updates.searchProvider = params.searchProvider;
    if (params.searchMaxResult) updates.searchMaxResult = params.searchMaxResult;
    
    // 其他配置
    if (params.language) updates.language = params.language;
    if (params.theme) updates.theme = params.theme;
    if (params.mode) updates.mode = params.mode;
    
    // 应用更新
    if (Object.keys(updates).length > 0) {
      console.log('[useUrlConfig] 应用URL配置:', updates);
      settingStore.update(updates);
    }
  }, [settingStore]);

  // 清理URL参数（可选，移除敏感信息）
  const clearSensitiveParams = useCallback(() => {
    const newParams = new URLSearchParams(searchParams);
    const sensitiveParams = ['apiKey', 'jwt', 'accessPassword'];
    
    let hasChanges = false;
    sensitiveParams.forEach(param => {
      if (newParams.has(param)) {
        newParams.delete(param);
        hasChanges = true;
      }
    });
    
    if (hasChanges) {
      const newUrl = `${window.location.pathname}?${newParams.toString()}`;
      router.replace(newUrl);
      console.log('[useUrlConfig] 已清理敏感URL参数');
    }
  }, [searchParams, router]);

  // 生成配置URL
  const generateConfigUrl = useCallback((config: UrlConfigParams): string => {
    const params = new URLSearchParams();
    
    Object.entries(config).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, value.toString());
      }
    });
    
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }, []);

  return {
    parseUrlParams,
    applyUrlConfig,
    clearSensitiveParams,
    generateConfigUrl,
    urlParams: parseUrlParams(),
  };
};
