/**
 * 前后端公用的 AI Provider 配置工具库
 * 用于统一处理不同 Provider 的配置字段映射
 */

export interface ProviderModelFields {
  thinkingModel: string;
  networkingModel: string;
}

export interface ProviderApiKeyField {
  apiKeyField: string;
  apiProxyField?: string;
}

/**
 * 获取指定 provider 对应的模型配置字段
 * @param provider - AI provider 名称
 * @param config - 配置对象
 * @returns 包含 thinkingModel 和 networkingModel 的对象
 */
export function getProviderModelFields(provider: string, config: Record<string, any>): ProviderModelFields {
  switch (provider) {
    case 'openaicompatible':
      return {
        thinkingModel: config.openAICompatibleThinkingModel || '',
        networkingModel: config.openAICompatibleNetworkingModel || '',
      };
    case 'openai':
      return {
        thinkingModel: config.openAIThinkingModel || '',
        networkingModel: config.openAINetworkingModel || '',
      };
    case 'anthropic':
      return {
        thinkingModel: config.anthropicThinkingModel || '',
        networkingModel: config.anthropicNetworkingModel || '',
      };
    case 'deepseek':
      return {
        thinkingModel: config.deepseekThinkingModel || '',
        networkingModel: config.deepseekNetworkingModel || '',
      };
    case 'xai':
      return {
        thinkingModel: config.xAIThinkingModel || '',
        networkingModel: config.xAINetworkingModel || '',
      };
    case 'mistral':
      return {
        thinkingModel: config.mistralThinkingModel || '',
        networkingModel: config.mistralNetworkingModel || '',
      };
    case 'azure':
      return {
        thinkingModel: config.azureThinkingModel || '',
        networkingModel: config.azureNetworkingModel || '',
      };
    case 'openrouter':
      return {
        thinkingModel: config.openRouterThinkingModel || '',
        networkingModel: config.openRouterNetworkingModel || '',
      };
    case 'pollinations':
      return {
        thinkingModel: config.pollinationsThinkingModel || '',
        networkingModel: config.pollinationsNetworkingModel || '',
      };
    case 'ollama':
      return {
        thinkingModel: config.ollamaThinkingModel || '',
        networkingModel: config.ollamaNetworkingModel || '',
      };
    case 'google':
      return {
        thinkingModel: config.thinkingModel || '',
        networkingModel: config.networkingModel || '',
      };
    default:
      return {
        thinkingModel: config.thinkingModel || '',
        networkingModel: config.networkingModel || '',
      };
  }
}

/**
 * 获取指定 provider 对应的 API Key 字段名
 * @param provider - AI provider 名称
 * @returns 包含 apiKeyField 和可选 apiProxyField 的对象
 */
export function getProviderApiKeyField(provider: string): ProviderApiKeyField {
  switch (provider) {
    case 'google':
      return {
        apiKeyField: 'apiKey',
        apiProxyField: 'apiProxy',
      };
    case 'openai':
      return {
        apiKeyField: 'openAIApiKey',
        apiProxyField: 'openAIApiProxy',
      };
    case 'anthropic':
      return {
        apiKeyField: 'anthropicApiKey',
        apiProxyField: 'anthropicApiProxy',
      };
    case 'deepseek':
      return {
        apiKeyField: 'deepseekApiKey',
        apiProxyField: 'deepseekApiProxy',
      };
    case 'xai':
      return {
        apiKeyField: 'xAIApiKey',
        apiProxyField: 'xAIApiProxy',
      };
    case 'mistral':
      return {
        apiKeyField: 'mistralApiKey',
        apiProxyField: 'mistralApiProxy',
      };
    case 'azure':
      return {
        apiKeyField: 'azureApiKey',
      };
    case 'openrouter':
      return {
        apiKeyField: 'openRouterApiKey',
        apiProxyField: 'openRouterApiProxy',
      };
    case 'openaicompatible':
      return {
        apiKeyField: 'openAICompatibleApiKey',
        apiProxyField: 'openAICompatibleApiProxy',
      };
    case 'pollinations':
      return {
        apiKeyField: '', // Pollinations 不需要 API Key
        apiProxyField: 'pollinationsApiProxy',
      };
    case 'ollama':
      return {
        apiKeyField: '', // Ollama 不需要 API Key
        apiProxyField: 'ollamaApiProxy',
      };
    default:
      return {
        apiKeyField: 'apiKey',
      };
  }
}

/**
 * 检查指定 provider 是否有有效的 API Key
 * @param provider - AI provider 名称
 * @param config - 配置对象
 * @returns 是否有有效的 API Key
 */
export function hasValidApiKey(provider: string, config: Record<string, any>): boolean {
  const { apiKeyField } = getProviderApiKeyField(provider);
  
  // pollinations 和 ollama 不需要 API Key
  if (provider === 'pollinations' || provider === 'ollama') {
    return true;
  }
  
  // 其他 provider 需要检查 API Key
  const apiKey = config[apiKeyField];
  const hasKey = typeof apiKey === 'string' && apiKey.length > 0;
  
  
  return hasKey;
}

/**
 * 获取指定 provider 的 API Key 值
 * @param provider - AI provider 名称
 * @param config - 配置对象
 * @returns API Key 值
 */
export function getProviderApiKey(provider: string, config: Record<string, any>): string {
  const { apiKeyField } = getProviderApiKeyField(provider);
  return config[apiKeyField] || '';
}

/**
 * 获取指定 provider 的代理地址
 * @param provider - AI provider 名称
 * @param config - 配置对象
 * @returns 代理地址
 */
export function getProviderApiProxy(provider: string, config: Record<string, any>): string {
  const { apiProxyField } = getProviderApiKeyField(provider);
  return apiProxyField ? (config[apiProxyField] || '') : '';
}

/**
 * 获取搜索提供商的 API Key 字段名
 * @param searchProvider - 搜索提供商名称
 * @returns API Key 字段名
 */
export function getSearchProviderApiKeyField(searchProvider: string): string {
  switch (searchProvider) {
    case 'tavily':
      return 'tavilyApiKey';
    case 'firecrawl':
      return 'firecrawlApiKey';
    case 'exa':
      return 'exaApiKey';
    case 'bocha':
      return 'bochaApiKey';
    case 'serper':
      return 'serperApiKey';
    case 'searxng':
      return ''; // SearXNG 不需要 API Key
    default:
      return 'searchApiKey';
  }
}

/**
 * 检查搜索提供商是否有有效的 API Key
 * @param searchProvider - 搜索提供商名称  
 * @param config - 配置对象
 * @returns 是否有有效的 API Key
 */
export function hasValidSearchApiKey(searchProvider: string, config: Record<string, any>): boolean {
  const apiKeyField = getSearchProviderApiKeyField(searchProvider);
  
  // searxng 不需要 API Key
  if (searchProvider === 'searxng' || !apiKeyField) {
    return true;
  }
  
  const apiKey = config[apiKeyField];
  const hasKey = typeof apiKey === 'string' && apiKey.length > 0;
  
  
  return hasKey;
}