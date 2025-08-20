import { useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSettingStore } from "@/store/setting";

// URL参数接口定义
export interface UrlConfigParams {
  // AI Provider配置
  provider?: string;           // AI厂商名称
  apiKey?: string;            // API密钥
  thinkingModel?: string;     // 思考模型名称
  taskModel?: string;         // 任务模型名称 (networkingModel)
  
  // 各厂商专用配置
  apiProxy?: string;              // 通用API代理
  openRouterApiKey?: string;
  openRouterApiProxy?: string;
  openRouterThinkingModel?: string;
  openRouterNetworkingModel?: string;
  openAIApiKey?: string;
  openAIApiProxy?: string;
  openAIThinkingModel?: string;
  openAINetworkingModel?: string;
  anthropicApiKey?: string;
  anthropicApiProxy?: string;
  anthropicThinkingModel?: string;
  anthropicNetworkingModel?: string;
  deepseekApiKey?: string;
  deepseekApiProxy?: string;
  deepseekThinkingModel?: string;
  deepseekNetworkingModel?: string;
  xAIApiKey?: string;
  xAIApiProxy?: string;
  xAIThinkingModel?: string;
  xAINetworkingModel?: string;
  mistralApiKey?: string;
  mistralApiProxy?: string;
  mistralThinkingModel?: string;
  mistralNetworkingModel?: string;
  azureApiKey?: string;
  azureResourceName?: string;
  azureApiVersion?: string;
  azureThinkingModel?: string;
  azureNetworkingModel?: string;
  openAICompatibleApiKey?: string;
  openAICompatibleApiProxy?: string;
  openAICompatibleThinkingModel?: string;
  openAICompatibleNetworkingModel?: string;
  pollinationsApiProxy?: string;
  pollinationsThinkingModel?: string;
  pollinationsNetworkingModel?: string;
  ollamaApiProxy?: string;
  ollamaThinkingModel?: string;
  ollamaNetworkingModel?: string;
  
  // 认证相关
  jwt?: string;               // JWT令牌用于数据中心请求
  accessPassword?: string;    // 访问密码
  
  // 话题相关
  topicId?: string;          // 话题ID，用于获取历史记录
  
  // 搜索配置
  enableSearch?: string;      // 启用搜索
  searchProvider?: string;    // 搜索提供商
  tavilyApiKey?: string;
  tavilyApiProxy?: string;
  tavilyScope?: string;
  firecrawlApiKey?: string;
  firecrawlApiProxy?: string;
  exaApiKey?: string;
  exaApiProxy?: string;
  exaScope?: string;
  bochaApiKey?: string;
  bochaApiProxy?: string;
  searxngApiProxy?: string;
  searxngScope?: string;
  parallelSearch?: number;
  searchMaxResult?: number;   // 最大搜索结果数
  crawler?: string;
  
  // 其他配置
  language?: string;          // 界面语言
  theme?: string;            // 主题
  mode?: string;             // 模式
  debug?: string;            // 调试模式
  references?: string;       // 参考文献
  citationImage?: string;    // 引用图片
  
  // JSON配置支持
  config?: string;           // URL编码的JSON配置字符串
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
    
    // 首先检查是否有JSON配置
    if (searchParams.get('config')) {
      try {
        const configString = decodeURIComponent(searchParams.get('config')!);
        const jsonConfig = JSON.parse(configString);
        Object.assign(params, jsonConfig);
        console.log('[useUrlConfig] 解析JSON配置成功:', params);
      } catch (error) {
        console.error('[useUrlConfig] JSON配置解析失败:', error instanceof Error ? error : new Error(String(error)));
      }
    }
    
    // AI Provider配置
    if (searchParams.get('provider')) params.provider = searchParams.get('provider')!;
    if (searchParams.get('apiKey')) params.apiKey = searchParams.get('apiKey')!;
    if (searchParams.get('thinkingModel')) params.thinkingModel = searchParams.get('thinkingModel')!;
    if (searchParams.get('taskModel')) params.taskModel = searchParams.get('taskModel')!;
    
    // 各厂商专用配置
    if (searchParams.get('apiProxy')) params.apiProxy = searchParams.get('apiProxy')!;
    if (searchParams.get('openRouterApiKey')) params.openRouterApiKey = searchParams.get('openRouterApiKey')!;
    if (searchParams.get('openRouterApiProxy')) params.openRouterApiProxy = searchParams.get('openRouterApiProxy')!;
    if (searchParams.get('openRouterThinkingModel')) params.openRouterThinkingModel = searchParams.get('openRouterThinkingModel')!;
    if (searchParams.get('openRouterNetworkingModel')) params.openRouterNetworkingModel = searchParams.get('openRouterNetworkingModel')!;
    if (searchParams.get('openAIApiKey')) params.openAIApiKey = searchParams.get('openAIApiKey')!;
    if (searchParams.get('openAIApiProxy')) params.openAIApiProxy = searchParams.get('openAIApiProxy')!;
    if (searchParams.get('openAIThinkingModel')) params.openAIThinkingModel = searchParams.get('openAIThinkingModel')!;
    if (searchParams.get('openAINetworkingModel')) params.openAINetworkingModel = searchParams.get('openAINetworkingModel')!;
    if (searchParams.get('anthropicApiKey')) params.anthropicApiKey = searchParams.get('anthropicApiKey')!;
    if (searchParams.get('anthropicApiProxy')) params.anthropicApiProxy = searchParams.get('anthropicApiProxy')!;
    if (searchParams.get('anthropicThinkingModel')) params.anthropicThinkingModel = searchParams.get('anthropicThinkingModel')!;
    if (searchParams.get('anthropicNetworkingModel')) params.anthropicNetworkingModel = searchParams.get('anthropicNetworkingModel')!;
    if (searchParams.get('deepseekApiKey')) params.deepseekApiKey = searchParams.get('deepseekApiKey')!;
    if (searchParams.get('deepseekApiProxy')) params.deepseekApiProxy = searchParams.get('deepseekApiProxy')!;
    if (searchParams.get('deepseekThinkingModel')) params.deepseekThinkingModel = searchParams.get('deepseekThinkingModel')!;
    if (searchParams.get('deepseekNetworkingModel')) params.deepseekNetworkingModel = searchParams.get('deepseekNetworkingModel')!;
    if (searchParams.get('xAIApiKey')) params.xAIApiKey = searchParams.get('xAIApiKey')!;
    if (searchParams.get('xAIApiProxy')) params.xAIApiProxy = searchParams.get('xAIApiProxy')!;
    if (searchParams.get('xAIThinkingModel')) params.xAIThinkingModel = searchParams.get('xAIThinkingModel')!;
    if (searchParams.get('xAINetworkingModel')) params.xAINetworkingModel = searchParams.get('xAINetworkingModel')!;
    if (searchParams.get('mistralApiKey')) params.mistralApiKey = searchParams.get('mistralApiKey')!;
    if (searchParams.get('mistralApiProxy')) params.mistralApiProxy = searchParams.get('mistralApiProxy')!;
    if (searchParams.get('mistralThinkingModel')) params.mistralThinkingModel = searchParams.get('mistralThinkingModel')!;
    if (searchParams.get('mistralNetworkingModel')) params.mistralNetworkingModel = searchParams.get('mistralNetworkingModel')!;
    if (searchParams.get('azureApiKey')) params.azureApiKey = searchParams.get('azureApiKey')!;
    if (searchParams.get('azureResourceName')) params.azureResourceName = searchParams.get('azureResourceName')!;
    if (searchParams.get('azureApiVersion')) params.azureApiVersion = searchParams.get('azureApiVersion')!;
    if (searchParams.get('azureThinkingModel')) params.azureThinkingModel = searchParams.get('azureThinkingModel')!;
    if (searchParams.get('azureNetworkingModel')) params.azureNetworkingModel = searchParams.get('azureNetworkingModel')!;
    if (searchParams.get('openAICompatibleApiKey')) params.openAICompatibleApiKey = searchParams.get('openAICompatibleApiKey')!;
    if (searchParams.get('openAICompatibleApiProxy')) params.openAICompatibleApiProxy = searchParams.get('openAICompatibleApiProxy')!;
    if (searchParams.get('openAICompatibleThinkingModel')) params.openAICompatibleThinkingModel = searchParams.get('openAICompatibleThinkingModel')!;
    if (searchParams.get('openAICompatibleNetworkingModel')) params.openAICompatibleNetworkingModel = searchParams.get('openAICompatibleNetworkingModel')!;
    if (searchParams.get('pollinationsApiProxy')) params.pollinationsApiProxy = searchParams.get('pollinationsApiProxy')!;
    if (searchParams.get('pollinationsThinkingModel')) params.pollinationsThinkingModel = searchParams.get('pollinationsThinkingModel')!;
    if (searchParams.get('pollinationsNetworkingModel')) params.pollinationsNetworkingModel = searchParams.get('pollinationsNetworkingModel')!;
    if (searchParams.get('ollamaApiProxy')) params.ollamaApiProxy = searchParams.get('ollamaApiProxy')!;
    if (searchParams.get('ollamaThinkingModel')) params.ollamaThinkingModel = searchParams.get('ollamaThinkingModel')!;
    if (searchParams.get('ollamaNetworkingModel')) params.ollamaNetworkingModel = searchParams.get('ollamaNetworkingModel')!
    
    // 认证相关
    if (searchParams.get('jwt')) params.jwt = searchParams.get('jwt')!;
    if (searchParams.get('accessPassword')) params.accessPassword = searchParams.get('accessPassword')!;
    
    // 话题相关
    if (searchParams.get('topicId')) params.topicId = searchParams.get('topicId')!;
    
    // 搜索配置
    if (searchParams.get('enableSearch')) params.enableSearch = searchParams.get('enableSearch')!;
    if (searchParams.get('searchProvider')) params.searchProvider = searchParams.get('searchProvider')!;
    if (searchParams.get('tavilyApiKey')) params.tavilyApiKey = searchParams.get('tavilyApiKey')!;
    if (searchParams.get('searxngApiProxy')) params.searxngApiProxy = searchParams.get('searxngApiProxy')!;
    if (searchParams.get('searchMaxResult')) {
      const maxResult = parseInt(searchParams.get('searchMaxResult')!);
      if (!isNaN(maxResult)) params.searchMaxResult = maxResult;
    }
    if (searchParams.get('parallelSearch')) {
      const parallel = parseInt(searchParams.get('parallelSearch')!);
      if (!isNaN(parallel)) params.parallelSearch = parallel;
    }
    
    // 其他配置
    if (searchParams.get('language')) params.language = searchParams.get('language')!;
    if (searchParams.get('theme')) params.theme = searchParams.get('theme')!;
    if (searchParams.get('mode')) params.mode = searchParams.get('mode')!;
    if (searchParams.get('debug')) params.debug = searchParams.get('debug')!;
    if (searchParams.get('references')) params.references = searchParams.get('references')!;
    if (searchParams.get('citationImage')) params.citationImage = searchParams.get('citationImage')!;
    if (searchParams.get('crawler')) params.crawler = searchParams.get('crawler')!;
    
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
          if (params.apiProxy) updates.apiProxy = params.apiProxy;
          if (params.thinkingModel) updates.thinkingModel = params.thinkingModel;
          if (params.taskModel) updates.networkingModel = params.taskModel;
          break;
        case 'openai':
          if (params.apiKey) updates.openAIApiKey = params.apiKey;
          if (params.openAIApiKey) updates.openAIApiKey = params.openAIApiKey;
          if (params.apiProxy) updates.openAIApiProxy = params.apiProxy;
          if (params.openAIApiProxy) updates.openAIApiProxy = params.openAIApiProxy;
          if (params.thinkingModel) updates.openAIThinkingModel = params.thinkingModel;
          if (params.openAIThinkingModel) updates.openAIThinkingModel = params.openAIThinkingModel;
          if (params.taskModel) updates.openAINetworkingModel = params.taskModel;
          if (params.openAINetworkingModel) updates.openAINetworkingModel = params.openAINetworkingModel;
          break;
        case 'anthropic':
          if (params.apiKey) updates.anthropicApiKey = params.apiKey;
          if (params.anthropicApiKey) updates.anthropicApiKey = params.anthropicApiKey;
          if (params.apiProxy) updates.anthropicApiProxy = params.apiProxy;
          if (params.anthropicApiProxy) updates.anthropicApiProxy = params.anthropicApiProxy;
          if (params.thinkingModel) updates.anthropicThinkingModel = params.thinkingModel;
          if (params.anthropicThinkingModel) updates.anthropicThinkingModel = params.anthropicThinkingModel;
          if (params.taskModel) updates.anthropicNetworkingModel = params.taskModel;
          if (params.anthropicNetworkingModel) updates.anthropicNetworkingModel = params.anthropicNetworkingModel;
          break;
        case 'deepseek':
          if (params.apiKey) updates.deepseekApiKey = params.apiKey;
          if (params.deepseekApiKey) updates.deepseekApiKey = params.deepseekApiKey;
          if (params.apiProxy) updates.deepseekApiProxy = params.apiProxy;
          if (params.deepseekApiProxy) updates.deepseekApiProxy = params.deepseekApiProxy;
          if (params.thinkingModel) updates.deepseekThinkingModel = params.thinkingModel;
          if (params.deepseekThinkingModel) updates.deepseekThinkingModel = params.deepseekThinkingModel;
          if (params.taskModel) updates.deepseekNetworkingModel = params.taskModel;
          if (params.deepseekNetworkingModel) updates.deepseekNetworkingModel = params.deepseekNetworkingModel;
          break;
        case 'openrouter':
          if (params.apiKey) updates.openRouterApiKey = params.apiKey;
          if (params.openRouterApiKey) updates.openRouterApiKey = params.openRouterApiKey;
          if (params.apiProxy) updates.openRouterApiProxy = params.apiProxy;
          if (params.openRouterApiProxy) updates.openRouterApiProxy = params.openRouterApiProxy;
          if (params.thinkingModel) updates.openRouterThinkingModel = params.thinkingModel;
          if (params.openRouterThinkingModel) updates.openRouterThinkingModel = params.openRouterThinkingModel;
          if (params.taskModel) updates.openRouterNetworkingModel = params.taskModel;
          if (params.openRouterNetworkingModel) updates.openRouterNetworkingModel = params.openRouterNetworkingModel;
          break;
        case 'xai':
          if (params.apiKey) updates.xAIApiKey = params.apiKey;
          if (params.xAIApiKey) updates.xAIApiKey = params.xAIApiKey;
          if (params.apiProxy) updates.xAIApiProxy = params.apiProxy;
          if (params.xAIApiProxy) updates.xAIApiProxy = params.xAIApiProxy;
          if (params.thinkingModel) updates.xAIThinkingModel = params.thinkingModel;
          if (params.xAIThinkingModel) updates.xAIThinkingModel = params.xAIThinkingModel;
          if (params.taskModel) updates.xAINetworkingModel = params.taskModel;
          if (params.xAINetworkingModel) updates.xAINetworkingModel = params.xAINetworkingModel;
          break;
        case 'mistral':
          if (params.apiKey) updates.mistralApiKey = params.apiKey;
          if (params.mistralApiKey) updates.mistralApiKey = params.mistralApiKey;
          if (params.apiProxy) updates.mistralApiProxy = params.apiProxy;
          if (params.mistralApiProxy) updates.mistralApiProxy = params.mistralApiProxy;
          if (params.thinkingModel) updates.mistralThinkingModel = params.thinkingModel;
          if (params.mistralThinkingModel) updates.mistralThinkingModel = params.mistralThinkingModel;
          if (params.taskModel) updates.mistralNetworkingModel = params.taskModel;
          if (params.mistralNetworkingModel) updates.mistralNetworkingModel = params.mistralNetworkingModel;
          break;
        case 'openaicompatible':
          if (params.apiKey) updates.openAICompatibleApiKey = params.apiKey;
          if (params.openAICompatibleApiKey) updates.openAICompatibleApiKey = params.openAICompatibleApiKey;
          if (params.apiProxy) updates.openAICompatibleApiProxy = params.apiProxy;
          if (params.openAICompatibleApiProxy) updates.openAICompatibleApiProxy = params.openAICompatibleApiProxy;
          if (params.thinkingModel) updates.openAICompatibleThinkingModel = params.thinkingModel;
          if (params.openAICompatibleThinkingModel) updates.openAICompatibleThinkingModel = params.openAICompatibleThinkingModel;
          if (params.taskModel) updates.openAICompatibleNetworkingModel = params.taskModel;
          if (params.openAICompatibleNetworkingModel) updates.openAICompatibleNetworkingModel = params.openAICompatibleNetworkingModel;
          break;
        case 'pollinations':
          if (params.apiProxy) updates.pollinationsApiProxy = params.apiProxy;
          if (params.pollinationsApiProxy) updates.pollinationsApiProxy = params.pollinationsApiProxy;
          if (params.thinkingModel) updates.pollinationsThinkingModel = params.thinkingModel;
          if (params.pollinationsThinkingModel) updates.pollinationsThinkingModel = params.pollinationsThinkingModel;
          if (params.taskModel) updates.pollinationsNetworkingModel = params.taskModel;
          if (params.pollinationsNetworkingModel) updates.pollinationsNetworkingModel = params.pollinationsNetworkingModel;
          break;
        case 'ollama':
          if (params.apiProxy) updates.ollamaApiProxy = params.apiProxy;
          if (params.ollamaApiProxy) updates.ollamaApiProxy = params.ollamaApiProxy;
          if (params.thinkingModel) updates.ollamaThinkingModel = params.thinkingModel;
          if (params.ollamaThinkingModel) updates.ollamaThinkingModel = params.ollamaThinkingModel;
          if (params.taskModel) updates.ollamaNetworkingModel = params.taskModel;
          if (params.ollamaNetworkingModel) updates.ollamaNetworkingModel = params.ollamaNetworkingModel;
          break;
      }
    }
    
    // 认证相关
    if (params.accessPassword) updates.accessPassword = params.accessPassword;
    
    // 搜索配置
    if (params.enableSearch) updates.enableSearch = params.enableSearch;
    if (params.searchProvider) updates.searchProvider = params.searchProvider;
    if (params.tavilyApiKey) updates.tavilyApiKey = params.tavilyApiKey;
    if (params.searxngApiProxy) updates.searxngApiProxy = params.searxngApiProxy;
    if (params.searchMaxResult) updates.searchMaxResult = params.searchMaxResult;
    if (params.parallelSearch) updates.parallelSearch = params.parallelSearch;
    if (params.crawler) updates.crawler = params.crawler;
    
    // 其他配置
    if (params.language) updates.language = params.language;
    if (params.theme) updates.theme = params.theme;
    if (params.mode) updates.mode = params.mode;
    if (params.debug) updates.debug = params.debug;
    if (params.references) updates.references = params.references;
    if (params.citationImage) updates.citationImage = params.citationImage;
    
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
