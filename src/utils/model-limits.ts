/**
 * 模型Token限制和使用情况监控工具
 */

interface ModelLimits {
  contextWindow: number;
  maxOutputTokens: number;
  provider: string;
}

const MODEL_LIMITS: Record<string, ModelLimits> = {
  // Google Gemini Models
  'gemini-1.5-pro': {
    contextWindow: 2097152, // 2M tokens
    maxOutputTokens: 8192,
    provider: 'google'
  },
  'gemini-1.5-flash': {
    contextWindow: 1048576, // 1M tokens
    maxOutputTokens: 8192,
    provider: 'google'
  },
  'gemini-2.0-flash-exp': {
    contextWindow: 1048576, // 1M tokens
    maxOutputTokens: 8192,
    provider: 'google'
  },
  'gemini-2.5-pro': {
    contextWindow: 2097152, // 2M tokens
    maxOutputTokens: 8192,
    provider: 'google'
  },
  'gemini-2.5-flash': {
    contextWindow: 1048576, // 1M tokens
    maxOutputTokens: 8192,
    provider: 'google'
  },
  
  // OpenAI Models
  'gpt-4': {
    contextWindow: 8192,
    maxOutputTokens: 4096,
    provider: 'openai'
  },
  'gpt-4-turbo': {
    contextWindow: 128000,
    maxOutputTokens: 4096,
    provider: 'openai'
  },
  'gpt-4o': {
    contextWindow: 128000,
    maxOutputTokens: 16384,
    provider: 'openai'
  },
  'gpt-4o-mini': {
    contextWindow: 128000,
    maxOutputTokens: 16384,
    provider: 'openai'
  },
  'o1-preview': {
    contextWindow: 128000,
    maxOutputTokens: 32768,
    provider: 'openai'
  },
  'o1-mini': {
    contextWindow: 128000,
    maxOutputTokens: 65536,
    provider: 'openai'
  },
  'gpt-3.5-turbo': {
    contextWindow: 16385,
    maxOutputTokens: 4096,
    provider: 'openai'
  },
  
  // Anthropic Claude Models
  'claude-3-5-sonnet-20241022': {
    contextWindow: 200000,
    maxOutputTokens: 8192,
    provider: 'anthropic'
  },
  'claude-3-5-haiku-20241022': {
    contextWindow: 200000,
    maxOutputTokens: 8192,
    provider: 'anthropic'
  },
  'claude-3-opus-20240229': {
    contextWindow: 200000,
    maxOutputTokens: 4096,
    provider: 'anthropic'
  },
  
  // DeepSeek Models
  'deepseek-chat': {
    contextWindow: 32768,
    maxOutputTokens: 4096,
    provider: 'deepseek'
  },
  'deepseek-reasoner': {
    contextWindow: 64000,
    maxOutputTokens: 8192,
    provider: 'deepseek'
  },
  
  // Qwen Models
  'qwen2.5-72b-instruct': {
    contextWindow: 32768,
    maxOutputTokens: 8192,
    provider: 'qwen'
  },
  'qwen-max': {
    contextWindow: 30000,
    maxOutputTokens: 8000,
    provider: 'qwen'
  },
  
  // XAI Models
  'grok-beta': {
    contextWindow: 128000,
    maxOutputTokens: 4096,
    provider: 'xai'
  },
  
  // Mistral Models
  'mistral-large-latest': {
    contextWindow: 128000,
    maxOutputTokens: 4096,
    provider: 'mistral'
  }
};

/**
 * 获取模型的Token限制信息
 * @param modelName 模型名称
 * @returns 模型限制信息，如果未找到返回默认值
 */
export function getModelLimits(modelName: string): ModelLimits {
  // 直接匹配
  if (MODEL_LIMITS[modelName]) {
    return MODEL_LIMITS[modelName];
  }
  
  // 模糊匹配（去掉版本号和后缀）
  const normalizedModel = modelName.toLowerCase();
  for (const [key, limits] of Object.entries(MODEL_LIMITS)) {
    if (normalizedModel.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedModel)) {
      return limits;
    }
  }
  
  // 返回保守的默认值
  return {
    contextWindow: 4096,
    maxOutputTokens: 2048,
    provider: 'unknown'
  };
}

/**
 * 估算文本的Token数量（粗略估算）
 * @param text 文本内容
 * @param language 语言类型
 * @returns 估算的Token数量
 */
export function estimateTokenCount(text: string, language: 'en' | 'zh' | 'auto' = 'auto'): number {
  if (!text) return 0;
  
  // 自动检测语言
  if (language === 'auto') {
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const totalChars = text.length;
    language = chineseChars / totalChars > 0.3 ? 'zh' : 'en';
  }
  
  if (language === 'zh') {
    // 中文：约1.5字符=1token
    return Math.ceil(text.length / 1.5);
  } else {
    // 英文：约4字符=1token
    return Math.ceil(text.length / 4);
  }
}

/**
 * 计算Token使用率
 * @param usedTokens 已使用的Token数量
 * @param maxTokens 最大Token数量
 * @returns 使用率百分比
 */
export function calculateTokenUtilization(usedTokens: number, maxTokens: number): number {
  if (maxTokens <= 0) return 0;
  return Math.round((usedTokens / maxTokens) * 100);
}

/**
 * 检查是否接近Token限制
 * @param usedTokens 已使用的Token数量
 * @param maxTokens 最大Token数量
 * @param warningThreshold 警告阈值（百分比）
 * @returns 是否需要警告
 */
export function isNearTokenLimit(usedTokens: number, maxTokens: number, warningThreshold: number = 85): boolean {
  const utilization = calculateTokenUtilization(usedTokens, maxTokens);
  return utilization >= warningThreshold;
}

/**
 * 获取Token使用分析报告
 * @param modelName 模型名称
 * @param promptTokens 输入Token数量
 * @param completionTokens 输出Token数量
 * @param promptText 输入文本（用于估算）
 * @returns Token使用分析报告
 */
export function getTokenUsageAnalysis(
  modelName: string, 
  promptTokens: number | null, 
  completionTokens: number | null,
  promptText?: string
) {
  const limits = getModelLimits(modelName);
  const totalTokens = (promptTokens || 0) + (completionTokens || 0);
  
  // 如果没有实际Token数据，尝试估算
  const estimatedPromptTokens = promptTokens || (promptText ? estimateTokenCount(promptText) : 0);
  
  const contextUtilization = calculateTokenUtilization(estimatedPromptTokens, limits.contextWindow);
  const outputUtilization = calculateTokenUtilization(completionTokens || 0, limits.maxOutputTokens);
  
  return {
    model: modelName,
    limits: limits,
    usage: {
      promptTokens: promptTokens,
      completionTokens: completionTokens,
      totalTokens: totalTokens,
      estimatedPromptTokens: promptTokens ? undefined : estimatedPromptTokens
    },
    utilization: {
      contextWindow: contextUtilization,
      outputTokens: outputUtilization,
      isNearContextLimit: isNearTokenLimit(estimatedPromptTokens, limits.contextWindow),
      isNearOutputLimit: isNearTokenLimit(completionTokens || 0, limits.maxOutputTokens)
    },
    warnings: {
      contextTooLong: contextUtilization > 90,
      outputTruncated: outputUtilization > 95,
      possibleTruncation: completionTokens === null && promptText && estimateTokenCount(promptText) > limits.contextWindow * 0.8
    }
  };
}