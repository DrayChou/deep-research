import { shuffle } from "radash";
import { logger } from "@/utils/logger";

// 创建模型配置专用的日志实例
const modelLogger = logger.getInstance('Model-Config');

// 全局 key 状态管理 - 前后端兼容
interface KeyStatus {
  failedAt: number;
  failCount: number;
  statusCode?: number;
}

// 全局状态存储：{ provider: { key: KeyStatus } }
const globalKeyStatus = new Map<string, Map<string, KeyStatus>>();

// key 到 provider 的反向映射
const keyToProviderMap = new Map<string, string>();

// 清理定时器引用
let cleanupTimer: NodeJS.Timeout | null = null;

// 根据状态码获取拉黑时长
function getCooldownTime(statusCode: number): number {
  // 432 状态码拉黑一周
  if (statusCode === 432) {
    return 7 * 24 * 60 * 60 * 1000; // 7 天
  }
  
  // 429 (Too Many Requests) 拉黑 1 小时
  if (statusCode === 429) {
    return 60 * 60 * 1000; // 1 小时
  }
  
  // 401 (Unauthorized) 拉黑 1 天
  if (statusCode === 401) {
    return 24 * 60 * 60 * 1000; // 1 天
  }
  
  // 403 (Forbidden) 拉黑 1 天
  if (statusCode === 403) {
    return 24 * 60 * 60 * 1000; // 1 天
  }
  
  // 其他 4xx 错误拉黑 2 小时
  if (statusCode >= 400 && statusCode < 500) {
    return 2 * 60 * 60 * 1000; // 2小时
  }
  
  // 5xx服务器错误拉黑30分钟
  if (statusCode >= 500 && statusCode < 600) {
    return 30 * 60 * 1000; // 30分钟
  }
  
  // 网络错误或其他问题拉黑1小时
  return 60 * 60 * 1000; // 1小时
}

// 清理过期 key 的函数
function cleanupExpiredKeys() {
  try {
    const now = Date.now();
    for (const [provider, keyMap] of globalKeyStatus.entries()) {
      for (const [key, status] of keyMap.entries()) {
        const cooldownTime = getCooldownTime(status.statusCode || 0);
        if (now - status.failedAt > cooldownTime) {
          keyMap.delete(key);
          keyToProviderMap.delete(key);
        }
      }
      if (keyMap.size === 0) {
        globalKeyStatus.delete(provider);
      }
    }
  } catch (error) {
    modelLogger.warn('Failed to cleanup expired keys', error);
  }
}

// 启动清理定时器 - 前后端兼容
function startCleanupTimer() {
  if (cleanupTimer) return; // 防止重复启动
  
  const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 小时
  
  try {
    cleanupTimer = setInterval(cleanupExpiredKeys, CLEANUP_INTERVAL);
  } catch (error) {
    modelLogger.warn('Failed to start cleanup timer', error);
  }
}

// 建立 key 到 provider 的映射
export function buildKeyToProviderMap(provider: string, apiKeys: string) {
  const keys = apiKeys.split(',').map(k => k.trim()).filter(k => k);
  keys.forEach(key => {
    keyToProviderMap.set(key, provider);
  });
}

// 尝试从调用栈推断 provider
function inferProviderFromCallStack(): string {
  try {
    const stack = new Error().stack || '';
    
    // 检查调用栈中的关键词
    if (stack.includes('tavily')) return 'tavily';
    if (stack.includes('firecrawl')) return 'firecrawl';
    if (stack.includes('exa')) return 'exa';
    if (stack.includes('bocha')) return 'bocha';
    if (stack.includes('searxng')) return 'searxng';
    
    return '';
  } catch {
    return '';
  }
}

// 修改后的 multiApiKeyPolling 函数 - 简化的逻辑流程
export function multiApiKeyPolling(apiKeys: string | string[] = "") {
  try {
    // 第一步：预处理，统一转换为数组
    let keys: string[];
    
    if (Array.isArray(apiKeys)) {
      // 数组输入：直接过滤使用
      keys = apiKeys.filter(k => typeof k === 'string' && k.trim().length > 0);
    } else if (typeof apiKeys === 'string') {
      // 字符串输入：按逗号分割
      keys = apiKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
    } else {
      // 无效输入类型
      modelLogger.warn('Invalid API keys input type', { type: typeof apiKeys });
      return "";
    }
    
    if (keys.length === 0) {
      return "";
    }
    
    // 第二步：根据数组长度判断处理逻辑
    if (keys.length >= 2) {
      // 情况 1：多个 key，直接在这个数组中处理
      return handleMultipleKeys(keys);
    } else {
      // 情况 2：单个 key，需要反查 provider 然后获取完整的 key 列表
      return handleSingleKey(keys[0]);
    }
  } catch (error) {
    // 错误处理：回退到基础逻辑
    modelLogger.warn('API key polling failed, falling back to random selection', error);
    return fallbackKeySelection(apiKeys);
  }
}

// 处理多个 key 的情况
function handleMultipleKeys(keys: string[]): string {
  const provider = findProviderForKeys(keys);
  return selectAvailableKey(keys, provider);
}

// 处理单个 key 的情况
function handleSingleKey(key: string): string {
  const provider = keyToProviderMap.get(key);
  
  if (!provider) {
    return key;
  }
  
  const allProviderKeys = getAllKeysForProvider(provider);
  
  if (allProviderKeys.length <= 1) {
    return key;
  }
  
  return selectAvailableKey(allProviderKeys, provider);
}

// 通用的 key 选择逻辑 - 提取公共功能
function selectAvailableKey(keys: string[], provider: string): string {
  if (provider) {
    const availableKeys = filterAvailableKeys(keys, provider);
    
    if (availableKeys.length > 0) {
      return shuffle(availableKeys)[0];
    }
    
    // 没有可用 key，记录警告
    modelLogger.warn(`No available API keys for provider: ${provider}, returning random key`);
  }
  
  // 没有 provider 或没有可用 key，直接随机选择
  return shuffle(keys)[0];
}

// 过滤可用的 key - 提取公共功能
function filterAvailableKeys(keys: string[], provider: string): string[] {
  const failedKeyMap = globalKeyStatus.get(provider) || new Map();
  const now = Date.now();
  
  return keys.filter(key => {
    const failedStatus = failedKeyMap.get(key);
    if (!failedStatus) return true;
    
    const cooldownTime = getCooldownTime(failedStatus.statusCode || 0);
    return now - failedStatus.failedAt > cooldownTime;
  });
}

// 为 keys 查找 provider
function findProviderForKeys(keys: string[]): string {
  // 遍历 keys，找到第一个有映射的 provider
  for (const key of keys) {
    const provider = keyToProviderMap.get(key);
    if (provider) {
      return provider;
    }
  }
  
  // 如果没有找到，尝试从调用栈推断
  return inferProviderFromCallStack();
}

// 获取指定 provider 的所有 key
function getAllKeysForProvider(provider: string): string[] {
  // 遍历 keyToProviderMap，找到属于该 provider 的所有 key
  const providerKeys: string[] = [];
  
  for (const [key, mappedProvider] of keyToProviderMap.entries()) {
    if (mappedProvider === provider) {
      providerKeys.push(key);
    }
  }
  
  return providerKeys;
}

// 回退选择逻辑
function fallbackKeySelection(apiKeys: string | string[]): string {
  if (Array.isArray(apiKeys)) {
    const validKeys = apiKeys.filter(k => typeof k === 'string' && k.trim().length > 0);
    return validKeys.length > 0 ? shuffle(validKeys)[0] : "";
  } else {
    const keys = (apiKeys as string).split(',').map(k => k.trim()).filter(k => k.length > 0);
    return keys.length > 0 ? shuffle(keys)[0] : "";
  }
}

// 标记 key 失败的函数
export function markApiKeyFailed(key: string, statusCode: number = 0): void {
  try {
    if (!key) return;
    
    const provider = keyToProviderMap.get(key);
    if (!provider) {
      modelLogger.warn('Cannot mark key as failed: provider not found for key');
      return;
    }
    
    let failedKeyMap = globalKeyStatus.get(provider);
    if (!failedKeyMap) {
      failedKeyMap = new Map();
      globalKeyStatus.set(provider, failedKeyMap);
    }
    
    const existing = failedKeyMap.get(key);
    if (existing) {
      existing.failedAt = Date.now();
      existing.failCount++;
      existing.statusCode = statusCode;
    } else {
      failedKeyMap.set(key, {
        failedAt: Date.now(),
        failCount: 1,
        statusCode
      });
    }
  } catch (error) {
    modelLogger.warn('Failed to mark API key as failed', error);
  }
}

// 重置 key 状态的函数
export function resetApiKeyStatus(key?: string): void {
  try {
    if (key) {
      // 重置特定 key
      const provider = keyToProviderMap.get(key);
      if (provider) {
        const failedKeyMap = globalKeyStatus.get(provider);
        if (failedKeyMap) {
          failedKeyMap.delete(key);
          if (failedKeyMap.size === 0) {
            globalKeyStatus.delete(provider);
          }
        }
      }
      keyToProviderMap.delete(key);
    } else {
      // 重置所有 key
      globalKeyStatus.clear();
      keyToProviderMap.clear();
    }
  } catch (error) {
    modelLogger.warn('Failed to reset API key status', error);
  }
}

// 获取 key 状态摘要
export function getApiKeyStatusSummary(provider?: string) {
  try {
    if (provider) {
      const failedKeyMap = globalKeyStatus.get(provider) || new Map();
      const failedKeys = Array.from(failedKeyMap.entries()).map(([key, status]) => ({
        key: key.substring(0, 8) + '...',
        failedAt: status.failedAt,
        failCount: status.failCount,
        statusCode: status.statusCode,
        cooldownTime: getCooldownTime(status.statusCode || 0)
      }));
      
      return {
        provider,
        totalKeys: failedKeys.length,
        failedKeyCount: failedKeys.length,
        failedKeys
      };
    } else {
      // 返回所有 provider 的状态
      const allStatus = [];
      for (const [provider, keyMap] of globalKeyStatus.entries()) {
        const failedKeys = Array.from(keyMap.entries()).map(([key, status]) => ({
          key: key.substring(0, 8) + '...',
          failedAt: status.failedAt,
          failCount: status.failCount,
          statusCode: status.statusCode,
          cooldownTime: getCooldownTime(status.statusCode || 0)
        }));
        
        allStatus.push({
          provider,
          totalKeys: failedKeys.length,
          failedKeyCount: failedKeys.length,
          failedKeys
        });
      }
      
      return {
        providers: allStatus,
        totalProviders: allStatus.length
      };
    }
  } catch (error) {
    modelLogger.warn('Failed to get API key status summary', error);
    return {
      providers: [],
      totalProviders: 0
    };
  }
}

// 启动清理定时器 - 延迟启动避免在模块加载时出错
if (typeof setInterval === 'function') {
  // 延迟 1 秒启动，避免在某些环境下的初始化问题
  setTimeout(() => {
    startCleanupTimer();
  }, 1000);
}

export function isThinkingModel(model: string) {
  return (
    model.includes("thinking") ||
    model.startsWith("gemini-2.5-pro") ||
    model.startsWith("gemini-2.5-flash")
  );
}

export function isNetworkingModel(model: string) {
  return (
    (model.startsWith("gemini-2.0-flash") &&
      !model.includes("lite") &&
      !model.includes("thinking") &&
      !model.includes("image")) ||
    model.startsWith("gemini-2.5-pro") ||
    model.startsWith("gemini-2.5-flash")
  );
}

export function isOpenRouterFreeModel(model: string) {
  return model.endsWith(":free");
}

export function filterThinkingModelList(modelList: string[]) {
  const thinkingModelList: string[] = [];
  const nonThinkingModelList: string[] = [];
  modelList.forEach((model) => {
    if (isThinkingModel(model)) {
      thinkingModelList.push(model);
    } else {
      nonThinkingModelList.push(model);
    }
  });
  return [thinkingModelList, nonThinkingModelList];
}

export function filterNetworkingModelList(modelList: string[]) {
  const networkingModelList: string[] = [];
  const nonNetworkingModelList: string[] = [];
  modelList.filter((model) => {
    if (isNetworkingModel(model)) {
      networkingModelList.push(model);
    } else {
      nonNetworkingModelList.push(model);
    }
  });
  return [networkingModelList, nonNetworkingModelList];
}

export function filterOpenRouterModelList(modelList: string[]) {
  const freeModelList: string[] = [];
  const paidModelList: string[] = [];
  modelList.filter((model) => {
    if (isOpenRouterFreeModel(model)) {
      freeModelList.push(model);
    } else {
      paidModelList.push(model);
    }
  });
  return [freeModelList, paidModelList];
}

export function filterDeepSeekModelList(modelList: string[]) {
  const thinkingModelList: string[] = [];
  const nonThinkingModelList: string[] = [];
  modelList.filter((model) => {
    if (model.includes("reasoner")) {
      thinkingModelList.push(model);
    } else {
      nonThinkingModelList.push(model);
    }
  });
  return [thinkingModelList, nonThinkingModelList];
}

export function filterOpenAIModelList(modelList: string[]) {
  const networkingModelList: string[] = [];
  const nonNetworkingModelList: string[] = [];
  modelList.filter((model) => {
    if (
      model.startsWith("gpt-4o") ||
      model.startsWith("gpt-4.1") ||
      !model.includes("nano")
    ) {
      networkingModelList.push(model);
    } else {
      nonNetworkingModelList.push(model);
    }
  });
  return [networkingModelList, nonNetworkingModelList];
}

export function filterPollinationsModelList(modelList: string[]) {
  const recommendModelList: string[] = [];
  const normalModelList: string[] = [];
  modelList.filter((model) => {
    if (
      model.startsWith("openai") ||
      model.startsWith("deepseek") ||
      model.startsWith("searchgpt")
    ) {
      recommendModelList.push(model);
    } else {
      normalModelList.push(model);
    }
  });
  return [recommendModelList, normalModelList];
}

export function filterMistralModelList(modelList: string[]) {
  const recommendModelList: string[] = [];
  const normalModelList: string[] = [];
  modelList.filter((model) => {
    if (model.includes("large-latest") || model.includes("medium-latest")) {
      recommendModelList.push(model);
    } else {
      normalModelList.push(model);
    }
  });
  return [recommendModelList, normalModelList];
}

export function getCustomModelList(customModelList: string[]) {
  const availableModelList: string[] = [];
  const disabledModelList: string[] = [];
  customModelList.forEach((model) => {
    if (model.startsWith("+")) {
      availableModelList.push(model.substring(1));
    } else if (model.startsWith("-")) {
      disabledModelList.push(model.substring(1));
    } else {
      availableModelList.push(model);
    }
  });
  return { availableModelList, disabledModelList };
}