import { streamText } from "ai";
import { type GoogleGenerativeAIProviderMetadata } from "@ai-sdk/google";
import { createAIProvider } from "./provider";
import { createSearchProvider } from "./search";
import {
  getSystemPrompt,
  processResultPrompt,
  processSearchResultPrompt,
} from "./prompts";
import { isNetworkingModel } from "@/utils/model";
import { ThinkTagStreamProcessor } from "@/utils/text";
import { pick, isFunction } from "radash";
import { Logger, logger } from "@/utils/logger";
import { NotificationService } from "@/utils/notification";
import { notificationConfig } from "@/utils/notification/config";

// 新增组件导入 - 智能模型轮换和严格质量控制
import { CorrectedEnhancedDeepResearchMethods } from './corrected-enhanced-methods';

// 类型定义
type Source = {
  title?: string;
  content?: string;
  url: string;
  images?: ImageSource[];
};

type ImageSource = {
  url: string;
  description?: string;
};

type SearchTask = {
  state: "unprocessed" | "processing" | "completed" | "failed";
  query: string;
  researchGoal: string;
  learning: string;
  sources: Source[];
  images: ImageSource[];
};

export interface DeepResearchOptions {
  AIProvider: {
    baseURL?: string;
    apiKey?: string;
    provider: string;
    thinkingModel: string | string[]; // Support both single model and model array
    taskModel: string | string[]; // Support both single model and model array
  };
  searchProvider: {
    baseURL?: string;
    apiKey?: string;
    provider: string;
    maxResult?: number;
  };
  language?: string;
  onMessage?: (event: string, data: any) => void;
}

interface FinalReportResult {
  title: string;
  finalReport: string;
  learnings: string[];
  sources: Source[];
  images: ImageSource[];
}

export interface DeepResearchSearchTask {
  query: string;
  researchGoal: string;
}

export interface DeepResearchSearchResult {
  query: string;
  researchGoal: string;
  learning: string;
  sources?: {
    url: string;
    title?: string;
  }[];
  images?: {
    url: string;
    description?: string;
  }[];
}

function addQuoteBeforeAllLine(text: string = "") {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

class DeepResearch {
  protected options: DeepResearchOptions;
  onMessage: (event: string, data: any) => void = () => { };
  private logger: Logger;
  private notificationService: NotificationService;
  
  constructor(options: DeepResearchOptions) {
    this.options = options;
    this.logger = logger.getInstance('DeepResearch');
    this.notificationService = new NotificationService(notificationConfig);
    
    if (isFunction(options.onMessage)) {
      this.onMessage = options.onMessage;
    }
    
    this.logger.info('DeepResearch initialized', {
      aiProvider: options.AIProvider.provider,
      thinkingModel: Array.isArray(options.AIProvider.thinkingModel) 
        ? `[${options.AIProvider.thinkingModel.join(', ')}]` 
        : options.AIProvider.thinkingModel,
      taskModel: Array.isArray(options.AIProvider.taskModel) 
        ? `[${options.AIProvider.taskModel.join(', ')}]` 
        : options.AIProvider.taskModel,
      searchProvider: options.searchProvider.provider,
      language: options.language,
      notificationEnabled: notificationConfig.enabled
    });
  }

  /**
   * Convert model specification to array for unified processing
   */
  private getModelArray(modelSpec: string | string[]): string[] {
    if (Array.isArray(modelSpec)) {
      return modelSpec.filter(model => model && model.trim().length > 0);
    }
    return modelSpec && modelSpec.trim() ? [modelSpec.trim()] : [];
  }

  /**
   * Get display string for model spec (for logging)
   */
  private getModelDisplayString(modelSpec: string | string[]): string {
    if (Array.isArray(modelSpec)) {
      return modelSpec.length > 1 ? `[${modelSpec.join(', ')}]` : modelSpec[0] || '';
    }
    return modelSpec || '';
  }

  /**
   * Create AI provider with intelligent model fallback
   * Tries models in sequence until one succeeds
   */
  private async createAIProviderWithFallback(
    modelArray: string[], 
    modelType: 'thinking' | 'task',
    additionalConfig?: any
  ): Promise<any> {
    const { AIProvider } = this.options;
    const AIProviderBaseOptions = pick(AIProvider, ["baseURL", "apiKey"]);
    
    let lastError: Error | null = null;
    
    for (let i = 0; i < modelArray.length; i++) {
      const model = modelArray[i];
      const isLastAttempt = i === modelArray.length - 1;
      
      const config = {
        provider: AIProvider.provider,
        model,
        ...additionalConfig,
        ...AIProviderBaseOptions,
      };

      this.logger.debug(`Attempting to create ${modelType} model ${i + 1}/${modelArray.length}`, {
        model,
        provider: AIProvider.provider,
        isLastAttempt
      });

      try {
        const aiProvider = await createAIProvider(config);
        
        if (i > 0) {
          // Successful fallback
          this.logger.info(`${modelType} model fallback successful`, {
            originalModel: modelArray[0],
            fallbackModel: model,
            attemptNumber: i + 1,
            totalModels: modelArray.length
          });
        } else {
          this.logger.info(`${modelType} model created successfully`, { model });
        }
        
        return aiProvider;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        this.logger.warn(`${modelType} model creation failed`, {
          model,
          provider: AIProvider.provider,
          attemptNumber: i + 1,
          totalModels: modelArray.length,
          willRetryWithNext: !isLastAttempt,
          error: lastError.message,
          stack: lastError instanceof Error ? lastError.stack : undefined
        });
        
        if (isLastAttempt) {
          // All models failed
          this.logger.error(`All ${modelType} models failed`, lastError, {
            attemptedModels: modelArray,
            provider: AIProvider.provider,
            totalAttempts: modelArray.length
          });
          
          // 发送关键系统故障通知
          this.sendCriticalSystemAlert('AI_MODEL_COMPLETE_FAILURE', {
            provider: AIProvider.provider,
            modelType,
            attemptedModels: modelArray,
            errorMessage: lastError?.message || 'Unknown error',
            totalAttempts: modelArray.length
          });
          
          throw lastError;
        }
      }
    }
    
    // This should never be reached, but just in case
    throw lastError || new Error(`Failed to create ${modelType} model`);
  }

  async getThinkingModel() {
    const { AIProvider } = this.options;
    const thinkingModels = this.getModelArray(AIProvider.thinkingModel);
    
    if (thinkingModels.length === 0) {
      throw new Error('No thinking models configured');
    }

    return await this.createAIProviderWithFallback(thinkingModels, 'thinking');
  }

  async getTaskModel() {
    const { AIProvider } = this.options;
    const taskModels = this.getModelArray(AIProvider.taskModel);
    
    if (taskModels.length === 0) {
      throw new Error('No task models configured');
    }

    // For task models, we need to check if Google networking models require special settings
    const additionalConfig = AIProvider.provider === "google" ? {
      settings: taskModels.some(model => isNetworkingModel(model)) ? { useSearchGrounding: true } : undefined
    } : undefined;

    return await this.createAIProviderWithFallback(taskModels, 'task', additionalConfig);
  }

  getResponseLanguagePrompt() {
    return this.options.language
      ? `**Respond in ${this.options.language}**`
      : `**Respond in the same language as the user's language**`;
  }

  async writeReportPlan(query: string): Promise<string> {
    // 使用修正的增强方法 - 严格质量控制，不容忍unknown
    return await CorrectedEnhancedDeepResearchMethods.writeReportPlan(
      query, 
      this.options, 
      this.onMessage.bind(this)
    );
  }

  async generateSERPQuery(
    reportPlan: string
  ): Promise<DeepResearchSearchTask[]> {
    // 使用修正的增强方法 - 强化JSON解析，不容忍unknown
    return await CorrectedEnhancedDeepResearchMethods.generateSERPQuery(
      reportPlan,
      this.options,
      this.onMessage.bind(this)
    );
  }

  async runSearchTask(
    tasks: DeepResearchSearchTask[],
    enableReferences = true
  ): Promise<SearchTask[]> {
    this.onMessage("progress", { step: "task-list", status: "start" });
    const thinkTagStreamProcessor = new ThinkTagStreamProcessor();
    const results: SearchTask[] = [];
    for await (const item of tasks) {
      this.onMessage("progress", {
        step: "search-task",
        status: "start",
        name: item.query,
      });
      let content = "";
      let searchResult;
      let sources: Source[] = [];
      let images: ImageSource[] = [];
      const { taskModel } = this.options.AIProvider;
      const firstTaskModel = Array.isArray(taskModel) ? taskModel[0] : taskModel;
      const { provider = "model", maxResult = 5 } = this.options.searchProvider;
      if (provider === "model") {
        const getTools = async () => {
          // Enable OpenAI's built-in search tool
          if (
            provider === "model" &&
            ["openai", "azure"].includes(firstTaskModel) &&
            firstTaskModel.startsWith("gpt-4o")
          ) {
            const { openai } = await import("@ai-sdk/openai");
            return {
              web_search_preview: openai.tools.webSearchPreview({
                // optional configuration:
                searchContextSize: maxResult > 5 ? "high" : "medium",
              }),
            };
          } else {
            return undefined;
          }
        };
        const getProviderOptions = () => {
          // Enable OpenRouter's built-in search tool
          if (provider === "model" && firstTaskModel === "openrouter") {
            return {
              openrouter: {
                plugins: [
                  {
                    id: "web",
                    max_results: maxResult ?? 5,
                  },
                ],
              },
            };
          } else {
            return undefined;
          }
        };

        searchResult = streamText({
          model: await this.getTaskModel(),
          system: getSystemPrompt(),
          prompt: [
            processResultPrompt(item.query, item.researchGoal),
            this.getResponseLanguagePrompt(),
          ].join("\n\n"),
          tools: await getTools(),
          providerOptions: getProviderOptions(),
        });
      } else {
        // 添加搜索重试逻辑
        const maxRetries = 3;  // 最多重试 3 次
        let currentRetry = 0;
        let lastError: Error | null = null;
        
        // 保存原始的 API keys 字符串，避免在重试过程中丢失
        let originalApiKeys = this.options.searchProvider.apiKey || "";
        const usedKeys = new Set<string>();
        
        // 安全措施：直接从环境变量获取原始 key 作为补充，防止被覆盖
        try {
          // 动态导入环境变量读取函数
          const envModule = await import("@/app/api/utils");
          const envKeys = envModule.getSearchProviderApiKey(this.options.searchProvider.provider);
          
          if (envKeys && envKeys.trim()) {
            // 合并配置的 key 和环境变量的 key，去重
            const mergedKeys = this.mergeAndDeduplicateKeys(originalApiKeys, envKeys);
            
            if (mergedKeys !== originalApiKeys) {
              this.logger.info('从环境变量补充了API key', {
                provider: this.options.searchProvider.provider,
                originalKeyCount: originalApiKeys ? originalApiKeys.split(',').length : 0,
                envKeyCount: envKeys.split(',').length,
                mergedKeyCount: mergedKeys.split(',').length
              });
              originalApiKeys = mergedKeys;
            }
          }
        } catch (error) {
          this.logger.warn('从环境变量获取API key失败，使用配置的key', error);
        }
        
        // 提前建立 key 到 provider 的映射关系，确保 multiApiKeyPolling 能正确工作
        if (originalApiKeys && this.options.searchProvider.provider) {
          try {
            const { buildKeyToProviderMap } = await import("@/utils/model");
            buildKeyToProviderMap(this.options.searchProvider.provider, originalApiKeys);
            this.logger.debug('预先建立 API key 映射关系', {
              provider: this.options.searchProvider.provider,
              totalKeysCount: originalApiKeys.split(',').length
            });
          } catch (error) {
            this.logger.warn('预先建立 API key 映射关系失败', error);
          }
        }
        
        // 为首次调用选择初始 API key
        let currentApiKey = "";
        if (originalApiKeys) {
          const { multiApiKeyPolling } = await import("@/utils/model");
          currentApiKey = multiApiKeyPolling(originalApiKeys);
          if (currentApiKey) {
            usedKeys.add(currentApiKey);
            this.logger.debug('初始搜索选择 API key', {
              provider: this.options.searchProvider.provider,
              keyPrefix: currentApiKey.substring(0, 8) + '...',
              totalKeysAvailable: originalApiKeys.split(',').length
            });
          }
        }
        
        while (currentRetry < maxRetries) {
          try {
            // 为每次搜索获取新的API key（包括第一次）
            if (currentRetry > 0) {
              const { multiApiKeyPolling } = await import("@/utils/model");
              // 从原始配置中获取所有可用 key，排除已使用的 key
              const allKeys = originalApiKeys.split(',').map(k => k.trim()).filter(k => k);
              const availableKeys = allKeys.filter(key => !usedKeys.has(key));
              
              this.logger.debug(`搜索重试 ${currentRetry + 1}/${maxRetries}，key状态检查`, {
                originalKeysCount: allKeys.length,
                usedKeysCount: usedKeys.size,
                availableKeysCount: availableKeys.length,
                usedKeysPreview: Array.from(usedKeys).map(k => k.substring(0, 8) + '...')
              });
              
              if (availableKeys.length === 0) {
                this.logger.warn(`搜索重试 ${currentRetry + 1}/${maxRetries}，没有可用的备用API key`);
                break; // 没有更多 key 可用，退出重试
              }
              
              const newApiKey = multiApiKeyPolling(availableKeys.join(','));
              if (newApiKey) {
                usedKeys.add(newApiKey);
                currentApiKey = newApiKey; // 更新当前使用的 key，但不修改 options
                this.logger.info(`搜索重试 ${currentRetry + 1}/${maxRetries}，使用新的API key`, {
                  provider: this.options.searchProvider.provider,
                  newKeyPrefix: newApiKey.substring(0, 8) + '...',
                  remainingKeys: availableKeys.length - 1
                });
              } else {
                this.logger.warn(`搜索重试 ${currentRetry + 1}/${maxRetries}，multiApiKeyPolling返回空key`);
                break;
              }
            }
            
            // 创建搜索配置，使用当前的 API key 而不修改原始 options
            const searchConfig = {
              ...this.options.searchProvider,
              apiKey: currentApiKey,
            };
            
            const result = await createSearchProvider({
              query: item.query,
              ...searchConfig,
            });

            sources = result.sources || [];
            images = result.images;
            
            // 搜索成功，退出重试循环
            if (currentRetry > 0) {
              this.logger.info(`搜索重试成功`, {
                query: item.query.substring(0, 50) + '...',
                retryCount: currentRetry,
                sourcesCount: sources.length
              });
            }
            break;
            
          } catch (err) {
            lastError = err instanceof Error ? err : new Error("Search Failed");
            currentRetry++;
            
            this.logger.warn(`搜索失败，重试 ${currentRetry}/${maxRetries}`, {
              query: item.query.substring(0, 50) + '...',
              error: lastError.message,
              provider: this.options.searchProvider.provider
            });
            
            // 如果是最后一次重试，抛出错误
            if (currentRetry >= maxRetries) {
              const errorMessage = `[${provider}]: 所有搜索重试均失败 - ${lastError.message}`;
              throw new Error(errorMessage);
            }
          }
        }
        
        // 如果重试循环结束但没有成功，抛出最后的错误
        if (lastError && (sources.length === 0 && images.length === 0)) {
          const errorMessage = `[${provider}]: 搜索重试耗尽 - ${lastError.message}`;
          throw new Error(errorMessage);
        }
        
        try {
          searchResult = streamText({
            model: await this.getTaskModel(),
            system: getSystemPrompt(),
            prompt: [
              processSearchResultPrompt(
                item.query,
                item.researchGoal,
                sources,
                sources.length > 0 && enableReferences
              ),
              this.getResponseLanguagePrompt(),
            ].join("\n\n"),
          });
        } catch (error) {
          this.logger.error('Search task AI processing failed', error instanceof Error ? error : undefined, {
            query: item.query,
            researchGoal: item.researchGoal,
            sourcesCount: sources.length,
            model: this.getModelDisplayString(this.options.AIProvider.taskModel)
          });
          
          // 检测API欠费错误并发送通知（异步非阻塞）
          if (error instanceof Error) {
            this.handleApiCreditError(error, {
              provider: this.options.AIProvider.provider,
              model: this.getModelDisplayString(this.options.AIProvider.taskModel),
              operation: 'runSearchTask',
              additionalInfo: {
                query: item.query.substring(0, 100),
                researchGoal: item.researchGoal.substring(0, 100),
                sourcesCount: sources.length,
                imagesCount: images.length,
                enableReferences
              }
            });
          }
          
          throw error;
        }
      }

      this.onMessage("message", { type: "text", text: "<search-task>\n" });
      this.onMessage("message", { type: "text", text: `## ${item.query}\n\n` });
      this.onMessage("message", {
        type: "text",
        text: `${addQuoteBeforeAllLine(item.researchGoal)}\n\n`,
      });
      
      try {
        for await (const part of searchResult.fullStream) {
        if (part.type === "text-delta") {
          thinkTagStreamProcessor.processChunk(
            part.textDelta,
            (data) => {
              content += data;
              this.onMessage("message", { type: "text", text: data });
            },
            (data) => {
              this.onMessage("reasoning", { type: "text", text: data });
            }
          );
        } else if (part.type === "reasoning") {
          this.onMessage("reasoning", { type: "text", text: part.textDelta });
        } else if (part.type === "source") {
          sources.push(part.source);
        } else if (part.type === "finish") {
          if (part.providerMetadata?.google) {
            const { groundingMetadata } = part.providerMetadata.google;
            const googleGroundingMetadata =
              groundingMetadata as GoogleGenerativeAIProviderMetadata["groundingMetadata"];
            if (googleGroundingMetadata?.groundingSupports) {
              googleGroundingMetadata.groundingSupports.forEach(
                ({ segment, groundingChunkIndices }) => {
                  if (segment.text && groundingChunkIndices) {
                    const index = groundingChunkIndices.map(
                      (idx: number) => `[${idx + 1}]`
                    );
                    content = content.replaceAll(
                      segment.text,
                      `${segment.text}${index.join("")}`
                    );
                  }
                }
              );
            }
          } else if (part.providerMetadata?.openai) {
            // Fixed the problem that OpenAI cannot generate markdown reference link syntax properly in Chinese context
            content = content.replaceAll("【", "[").replaceAll("】", "]");
          }
        }
        }
      } catch (streamError) {
        this.logger.error('Search task stream processing failed', streamError instanceof Error ? streamError : undefined, {
          query: item.query,
          researchGoal: item.researchGoal,
          sourcesCount: sources.length,
          contentLength: content.length,
          model: this.options.AIProvider.taskModel
        });
        
        // 检测API欠费错误并发送通知（异步非阻塞）
        if (streamError instanceof Error) {
          this.handleApiCreditError(streamError, {
            provider: this.options.AIProvider.provider,
            model: this.getModelDisplayString(this.options.AIProvider.taskModel),
            operation: 'runSearchTask_stream',
            additionalInfo: {
              query: item.query.substring(0, 100),
              researchGoal: item.researchGoal.substring(0, 100),
              sourcesCount: sources.length,
              contentLength: content.length,
              streamProcessing: true
            }
          });
        }
        
        throw streamError;
      }
      thinkTagStreamProcessor.end();

      if (images.length > 0) {
        const imageContent =
          "\n\n---\n\n" +
          images
            .map(
              (source) =>
                `![${source.description || source.url}](${source.url})`
            )
            .join("\n");
        content += imageContent;
        this.onMessage("message", { type: "text", text: imageContent });
      }

      if (sources.length > 0) {
        const sourceContent =
          "\n\n---\n\n" +
          sources
            .map(
              (item, idx) =>
                `[${idx + 1}]: ${item.url}${item.title ? ` "${item.title.replaceAll('"', " ")}"` : ""
                }`
            )
            .join("\n");
        content += sourceContent;
        this.onMessage("message", { type: "text", text: sourceContent });
      }
      this.onMessage("message", { type: "text", text: "\n</search-task>\n\n" });

      const task: SearchTask = {
        query: item.query,
        researchGoal: item.researchGoal,
        state: "completed",
        learning: content,
        sources,
        images,
      };
      results.push(task);
      this.onMessage("progress", {
        step: "search-task",
        status: "end",
        name: item.query,
        data: task,
      });
    }
    this.onMessage("progress", { step: "task-list", status: "end" });
    return results;
  }

  async writeFinalReport(
    reportPlan: string,
    tasks: DeepResearchSearchResult[],
    enableCitationImage = true,
    enableReferences = true
  ): Promise<FinalReportResult> {
    // 使用修正的增强方法 - 绝不容忍unknown，严格质量控制
    return await CorrectedEnhancedDeepResearchMethods.writeFinalReport(
      reportPlan,
      tasks,
      enableCitationImage,
      enableReferences,
      this.options,
      this.onMessage.bind(this)
    );
  }

  // 合并和去重 API keys
  private mergeAndDeduplicateKeys(configKeys: string, envKeys: string): string {
    const allKeys: string[] = [];
    
    // 添加配置的key
    if (configKeys && configKeys.trim()) {
      allKeys.push(...configKeys.split(',').map(k => k.trim()).filter(k => k));
    }
    
    // 添加环境变量的key
    if (envKeys && envKeys.trim()) {
      allKeys.push(...envKeys.split(',').map(k => k.trim()).filter(k => k));
    }
    
    // 去重
    const uniqueKeys = [...new Set(allKeys)];
    
    return uniqueKeys.join(',');
  }

  // 检测API欠费错误并发送通知（异步非阻塞）
  private handleApiCreditError(error: Error, context: {
    provider: string;
    model: string;
    operation: string;
    additionalInfo?: Record<string, any>;
  }): void {
    if (!NotificationService.isApiCreditError(error.message)) {
      return; // 不是欠费错误，直接返回
    }

    // 异步非阻塞发送通知，不会影响主进程
    this.logger.warn('API欠费错误检测到，正在后台发送通知', {
      provider: context.provider,
      model: context.model,
      operation: context.operation,
      errorMessage: error.message
    });

    this.notificationService.sendApiCreditAlertAsync(
      `${context.provider} (${context.model})`,
      error.message,
      {
        operation: context.operation,
        timestamp: new Date().toISOString(),
        apiProvider: context.provider,
        model: context.model,
        baseURL: this.options.AIProvider.baseURL,
        ...context.additionalInfo
      }
    );

    // 注意：由于是异步非阻塞，这里不再等待结果或记录成功日志
    // 成功或失败的日志会在 NotificationService 内部处理
  }

  // 发送关键系统故障警报
  private sendCriticalSystemAlert(alertType: string, details: Record<string, any>): void {
    try {
      const alertMessage = this.formatCriticalAlert(alertType, details);
      
      this.logger.info('发送关键系统故障警报', {
        alertType,
        details: {
          ...details,
          timestamp: new Date().toISOString()
        }
      });

      // 使用异步非阻塞发送，避免影响主流程
      this.notificationService.sendAsync({
        title: `🚨 系统关键故障 - ${alertType}`,
        content: alertMessage,
        level: 'critical',
        source: 'Deep Research System Monitor',
        tags: ['system-failure', 'critical', alertType.toLowerCase()],
        extra: {
          alertType,
          ...details,
          detectedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      // 通知发送失败不应该影响主流程
      this.logger.warn('关键系统警报发送失败', {
        alertType,
        details,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // 格式化关键警报消息
  private formatCriticalAlert(alertType: string, details: Record<string, any>): string {
    const timestamp = new Date().toLocaleString('zh-CN');
    
    switch (alertType) {
      case 'AI_MODEL_COMPLETE_FAILURE':
        return `所有AI模型完全失效，系统核心功能不可用。

🔴 **影响范围**: ${details.modelType} 模型服务
🔧 **AI提供商**: ${details.provider}
📋 **尝试模型**: ${details.attemptedModels?.join(', ') || '未知'}
🔢 **失败次数**: ${details.totalAttempts} 次
❌ **错误信息**: ${details.errorMessage}
🕐 **检测时间**: ${timestamp}

⚠️ **需要立即处理**: 检查AI提供商服务状态和API配置`;

      case 'BACKGROUND_TASK_COMPLETE_FAILURE':
        return `背景任务管理器完全失效，深度研究功能不可用。

🔴 **影响范围**: 深度研究任务执行
📋 **任务ID**: ${details.taskId || '未知'}
❌ **错误信息**: ${details.errorMessage}
🕐 **检测时间**: ${timestamp}

⚠️ **需要立即处理**: 检查系统资源和任务调度器状态`;

      case 'JWT_AUTHENTICATION_FAILURE':
        return `数据中心JWT认证完全失败，用户配置无法获取。

🔴 **影响范围**: 用户配置和认证服务
🌐 **数据中心地址**: ${details.dataBaseUrl || '未知'}
❌ **错误信息**: ${details.errorMessage}
🕐 **检测时间**: ${timestamp}

⚠️ **需要立即处理**: 检查数据中心服务状态和JWT配置`;

      default:
        return `检测到未分类的关键系统故障。

🔴 **故障类型**: ${alertType}
📋 **详细信息**: ${JSON.stringify(details, null, 2)}
🕐 **检测时间**: ${timestamp}

⚠️ **需要立即处理**: 请检查系统日志获取更多信息`;
    }
  }

  // 验证报告质量的辅助方法
  private validateReportQuality(report: FinalReportResult) {
    const issues: string[] = [];

    if (report.finalReport.length < 500) {
      issues.push('Report content too short (< 500 chars)');
    }

    if (!report.title || report.title.length < 10) {
      issues.push('Report title missing or too short');
    }

    if (report.learnings.length === 0) {
      issues.push('No learnings included in report');
    }

    const hasMarkdownStructure = /#{1,6}\s/.test(report.finalReport);
    if (!hasMarkdownStructure) {
      issues.push('Report lacks proper markdown structure');
    }

    // 检查是否包含正确格式的markdown链接
    const hasProperLinks = /\[([^\]]+)\]\(https?:\/\/[^\)]+\)/.test(report.finalReport);
    // 检查是否包含数字引用格式（但排除正常的markdown链接中的数字）
    const hasNumberReferences = /(?<!\[)\[\d+(?:,\s*\d+)*\](?!\()/g.test(report.finalReport);
    
    if (hasNumberReferences && !hasProperLinks) {
      issues.push('Report contains numbered references like [1], [32], [34] instead of proper markdown links [Source Title](URL)');
    }

    const qualityResult = {
      isValid: issues.length === 0,
      issues,
      metrics: {
        contentLength: report.finalReport.length,
        titleLength: report.title?.length || 0,
        learningsCount: report.learnings.length,
        sourcesCount: report.sources.length,
        imagesCount: report.images.length,
        hasProperMarkdownLinks: hasProperLinks,
        hasNumberReferences: hasNumberReferences,
        wordCount: report.finalReport.split(/\s+/).length,
        paragraphCount: report.finalReport.split(/\n\s*\n/).length,
        headingCount: (report.finalReport.match(/#{1,6}\s/g) || []).length
      }
    };

    // 记录详细的质量检查日志
    this.logger.debug('Report quality analysis completed', {
      overallValid: qualityResult.isValid,
      totalIssues: issues.length,
      issueDetails: issues,
      contentAnalysis: {
        totalLength: qualityResult.metrics.contentLength,
        wordCount: qualityResult.metrics.wordCount,
        paragraphCount: qualityResult.metrics.paragraphCount,
        headingCount: qualityResult.metrics.headingCount,
        hasMarkdownStructure,
        hasProperLinks,
        hasNumberReferences
      },
      dataAnalysis: {
        learningsIncluded: qualityResult.metrics.learningsCount,
        sourcesAvailable: qualityResult.metrics.sourcesCount,
        imagesAvailable: qualityResult.metrics.imagesCount,
        titleLength: qualityResult.metrics.titleLength
      }
    }, true);

    return qualityResult;
  }

  async start(
    query: string,
    enableCitationImage = true,
    enableReferences = true
  ) {
    const startTime = Date.now();
    this.logger.logStep('start', 'begin', {
      queryLength: query.length,
      queryPreview: query.substring(0, 100),
      enableCitationImage,
      enableReferences
    });

    try {
      const reportPlan = await this.writeReportPlan(query);
      
      // 验证报告计划不为空
      if (!reportPlan || reportPlan.trim().length === 0) {
        throw new Error('Report plan is empty - cannot proceed with research');
      }
      
      this.logger.debug('Report plan validation passed', {
        reportPlanLength: reportPlan.length,
        reportPlanPreview: reportPlan.substring(0, 100)
      });
      
      const tasks = await this.generateSERPQuery(reportPlan);
      const results = await this.runSearchTask(tasks, enableReferences);
      const finalReport = await this.writeFinalReport(
        reportPlan,
        results,
        enableCitationImage,
        enableReferences
      );

      const totalDuration = Date.now() - startTime;
      this.logger.logStep('start', 'complete', {
        totalDuration,
        finalReportLength: finalReport.finalReport.length,
        totalSources: finalReport.sources.length,
        totalImages: finalReport.images.length
      });

      return finalReport;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      const errorDetails = {
        error: errorMessage,
        stack: err instanceof Error ? err.stack : undefined,
        query,
        duration: Date.now() - startTime
      };

      this.logger.error('Deep research failed', err instanceof Error ? err : undefined, errorDetails);
      this.onMessage("error", {
        message: errorMessage,
        details: errorDetails
      });

      // 检测API欠费错误并发送通知（异步非阻塞）
      if (err instanceof Error) {
        this.handleApiCreditError(err, {
          provider: this.options.AIProvider.provider,
          model: `${this.getModelDisplayString(this.options.AIProvider.thinkingModel)}/${this.getModelDisplayString(this.options.AIProvider.taskModel)}`,
          operation: 'deepResearch',
          additionalInfo: {
            query: query.substring(0, 200),
            duration: Date.now() - startTime,
            enableCitationImage,
            enableReferences,
            stage: 'overall_failure'
          }
        });
      }

      // 重新抛出错误，包含原始错误信息
      const enhancedError = new Error(errorMessage);
      enhancedError.stack = err instanceof Error ? err.stack : undefined;
      throw enhancedError;
    }
  }
}

export default DeepResearch;
