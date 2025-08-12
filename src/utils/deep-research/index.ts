import { streamText, generateText } from "ai";
import { type GoogleGenerativeAIProviderMetadata } from "@ai-sdk/google";
import { createAIProvider } from "./provider";
import { createSearchProvider } from "./search";
import {
  getSystemPrompt,
  writeReportPlanPrompt,
  generateSerpQueriesPrompt,
  processResultPrompt,
  processSearchResultPrompt,
  writeFinalReportPrompt,
  getSERPQuerySchema,
} from "./prompts";
import { outputGuidelinesPrompt } from "@/constants/prompts";
import { isNetworkingModel } from "@/utils/model";
import { ThinkTagStreamProcessor, removeJsonMarkdown } from "@/utils/text";
import { pick, unique, flat, isFunction } from "radash";
import { Logger, logger } from "@/utils/logger";
import { NotificationService } from "@/utils/notification";
import { notificationConfig } from "@/utils/notification/config";
import { getTokenUsageAnalysis } from "@/utils/model-limits";
import { tokenMonitor } from "@/utils/token-monitor";

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
    thinkingModel: string;
    taskModel: string;
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
      thinkingModel: options.AIProvider.thinkingModel,
      taskModel: options.AIProvider.taskModel,
      searchProvider: options.searchProvider.provider,
      language: options.language,
      notificationEnabled: notificationConfig.enabled
    });
  }

  async getThinkingModel() {
    const { AIProvider } = this.options;
    const AIProviderBaseOptions = pick(AIProvider, ["baseURL", "apiKey"]);
    const config = {
      provider: AIProvider.provider,
      model: AIProvider.thinkingModel,
      ...AIProviderBaseOptions,
    };

    this.logger.debug('Getting thinking model', config);

    try {
      const model = await createAIProvider(config);
      this.logger.info('Thinking model created successfully', { model: AIProvider.thinkingModel });
      return model;
    } catch (error) {
      this.logger.error('Failed to create thinking model', error instanceof Error ? error : undefined, config);
      throw error;
    }
  }

  async getTaskModel() {
    const { AIProvider } = this.options;
    const AIProviderBaseOptions = pick(AIProvider, ["baseURL", "apiKey"]);
    const config = {
      provider: AIProvider.provider,
      model: AIProvider.taskModel,
      settings:
        AIProvider.provider === "google" &&
          isNetworkingModel(AIProvider.taskModel)
          ? { useSearchGrounding: true }
          : undefined,
      ...AIProviderBaseOptions,
    };

    this.logger.debug('Getting task model', config);

    try {
      const model = await createAIProvider(config);
      this.logger.info('Task model created successfully', { model: AIProvider.taskModel });
      return model;
    } catch (error) {
      this.logger.error('Failed to create task model', error instanceof Error ? error : undefined, config);
      throw error;
    }
  }

  getResponseLanguagePrompt() {
    return this.options.language
      ? `**Respond in ${this.options.language}**`
      : `**Respond in the same language as the user's language**`;
  }

  async writeReportPlan(query: string): Promise<string> {
    this.logger.logStep('writeReportPlan', 'start', { queryLength: query.length, queryPreview: query.substring(0, 100) });
    this.onMessage("progress", { step: "report-plan", status: "start" });

    // 重试机制：最多重试 3 次
    const maxRetries = 3;
    const minContentLength = 50; // 最小内容长度要求
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const thinkTagStreamProcessor = new ThinkTagStreamProcessor();
      const startTime = Date.now();
      const systemPrompt = getSystemPrompt();
      
      // 根据重试次数增强 prompt
      let enhancedPrompt = [
        writeReportPlanPrompt(query),
        this.getResponseLanguagePrompt(),
      ].join("\n\n");
      
      if (attempt > 1) {
        enhancedPrompt += `\n\nIMPORTANT: This is attempt ${attempt}/${maxRetries}. Please provide a comprehensive report plan with at least ${minContentLength} characters. Do not return empty content.`;
      }

      this.logger.debug(`Report plan prompt (attempt ${attempt})`, {
        systemPromptLength: systemPrompt.length,
        userPromptLength: enhancedPrompt.length,
        userPromptPreview: enhancedPrompt.substring(0, 200),
        attempt,
        minContentLength
      });

      try {
        const model = await this.getThinkingModel();
        const result = streamText({
          model,
          system: systemPrompt,
          prompt: enhancedPrompt,
        });
        let content = "";
        let reasoningContent = "";
        
        // 只在第一次尝试时发送开始标签
        if (attempt === 1) {
          this.onMessage("message", { type: "text", text: "<report-plan>\n" });
        }

        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            thinkTagStreamProcessor.processChunk(
              part.textDelta,
              (data) => {
                content += data;
                this.onMessage("message", { type: "text", text: data });
              },
              (data) => {
                reasoningContent += data;
                this.onMessage("reasoning", { type: "text", text: data });
              }
            );
          } else if (part.type === "reasoning") {
            reasoningContent += part.textDelta;
            this.onMessage("reasoning", { type: "text", text: part.textDelta });
          }
        }

        const duration = Date.now() - startTime;
        
        // 验证内容长度
        if (content.trim().length < minContentLength) {
          this.logger.warn(`Report plan content too short on attempt ${attempt}/${maxRetries}`, {
            contentLength: content.trim().length,
            minRequired: minContentLength,
            attempt,
            willRetry: attempt < maxRetries,
            content: content.substring(0, 200) + (content.length > 200 ? '...' : '')
          });
          
          if (attempt < maxRetries) {
            // 延迟后重试
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue; // 重试
          } else {
            // 最后一次尝试也失败，抛出错误
            throw new Error(`Failed to generate adequate report plan after ${maxRetries} attempts. Content length: ${content.trim().length}, required: ${minContentLength}`);
          }
        }
        
        // 分析Token使用情况
        const tokenAnalysis = getTokenUsageAnalysis(
          this.options.AIProvider.thinkingModel,
          null, // AI SDK可能不返回token信息
          null,
          systemPrompt + '\n\n' + enhancedPrompt
        );
        
        this.logger.logLLMCall('writeReportPlan',
          { model: this.options.AIProvider.thinkingModel, attempt },
          { 
            promptLength: enhancedPrompt.length, 
            content: query,
            tokenAnalysis 
          },
          { contentLength: content.length, reasoningLength: reasoningContent.length },
          duration
        );

        this.logger.logStep('writeReportPlan', 'end', {
          contentLength: content.length,
          duration,
          hasReasoning: reasoningContent.length > 0,
          totalAttempts: attempt,
          success: true
        });

        this.onMessage("message", { type: "text", text: "\n</report-plan>\n\n" });
        this.onMessage("progress", {
          step: "report-plan",
          status: "end",
          data: content,
        });
        return content;
      } catch (error) {
        this.logger.error(`Failed to write report plan on attempt ${attempt}/${maxRetries}`, error instanceof Error ? error : undefined, {
          queryLength: query.length,
          systemPromptLength: getSystemPrompt().length,
          userPromptLength: enhancedPrompt.length,
          attempt,
          willRetry: attempt < maxRetries
        });
        
        // 如果不是最后一次尝试，继续重试
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        
        // 检测API欠费错误并发送通知（异步非阻塞）
        if (error instanceof Error) {
          this.handleApiCreditError(error, {
            provider: this.options.AIProvider.provider,
            model: this.options.AIProvider.thinkingModel,
            operation: 'writeReportPlan',
            additionalInfo: {
              queryLength: query.length,
              systemPromptLength: getSystemPrompt().length,
              userPromptLength: enhancedPrompt.length,
              totalAttempts: maxRetries
            }
          });
        }
        
        throw error;
      }
    }
    
    // 如果所有重试都失败，抛出错误
    throw new Error(`Failed to generate report plan after ${maxRetries} attempts`);
  }

  async generateSERPQuery(
    reportPlan: string
  ): Promise<DeepResearchSearchTask[]> {
    this.logger.logStep('generateSERPQuery', 'start', { reportPlanLength: reportPlan.length });
    this.onMessage("progress", { step: "serp-query", status: "start" });

    const startTime = Date.now();
    const systemPrompt = getSystemPrompt();
    const userPrompt = [
      generateSerpQueriesPrompt(reportPlan),
      this.getResponseLanguagePrompt(),
    ].join("\n\n");

    this.logger.debug('SERP query prompt', {
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      userPromptPreview: userPrompt.substring(0, 200)
    });

    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const model = await this.getThinkingModel();
        
        // 根据重试次数增强prompt
        let enhancedPrompt = userPrompt;
        if (attempt > 1) {
          enhancedPrompt += '\n\nIMPORTANT: Please respond with valid JSON format only. No markdown, no extra text, just the JSON array.';
        }
        if (attempt > 2) {
          enhancedPrompt += '\n\nCRITICAL: You MUST return valid JSON. Format: [{"query": "...", "researchGoal": "..."}]';
        }

        const { text } = await generateText({
          model,
          system: systemPrompt,
          prompt: enhancedPrompt,
        });

        // 处理 AI 返回内容
        const thinkTagStreamProcessor = new ThinkTagStreamProcessor();
        let content = "";
        thinkTagStreamProcessor.processChunk(text, (data) => {
          content += data;
        });
        thinkTagStreamProcessor.end();

        const duration = Date.now() - startTime;
        
        // 分析Token使用情况
        const tokenAnalysis = getTokenUsageAnalysis(
          this.options.AIProvider.thinkingModel,
          null,
          null,
          systemPrompt + '\n\n' + enhancedPrompt
        );
        
        this.logger.logLLMCall('generateSERPQuery',
          { model: this.options.AIProvider.thinkingModel, attempt },
          { 
            promptLength: enhancedPrompt.length, 
            reportPlanLength: reportPlan.length,
            tokenAnalysis 
          },
          { responseLength: text.length, parsedContentLength: content.length },
          duration
        );

        // 解析和验证 JSON
        const cleanedContent = removeJsonMarkdown(content);
        this.logger.debug(`Parsing SERP query JSON (attempt ${attempt}/${maxRetries})`, {
          cleanedLength: cleanedContent.length,
          cleanedPreview: cleanedContent.substring(0, 200) + (cleanedContent.length > 200 ? '...' : '')
        });

        const data = JSON.parse(cleanedContent);
        const querySchema = getSERPQuerySchema();
        const result = querySchema.safeParse(data);

        if (!result.success) {
          throw new Error(`Schema validation failed: ${result.error.message}`);
        }

        const tasks: DeepResearchSearchTask[] = data.map(
          (item: { query: string; researchGoal?: string }) => ({
            query: item.query,
            researchGoal: item.researchGoal || "",
          })
        );

        // 分析查询的语言特征
        const bilingualQueries = tasks.filter(task => 
          /[\u4e00-\u9fff]/.test(task.query) && /[a-zA-Z]/.test(task.query)
        );
        const chineseOnlyQueries = tasks.filter(task => 
          /[\u4e00-\u9fff]/.test(task.query) && !/[a-zA-Z]/.test(task.query)
        );
        const englishOnlyQueries = tasks.filter(task => 
          !/[\u4e00-\u9fff]/.test(task.query) && /[a-zA-Z]/.test(task.query)
        );

        // 打印生成的查询列表日志
        this.logger.info('Generated SERP queries list (Smart Bilingual Strategy):', {
          totalQueries: tasks.length,
          bilingualQueries: bilingualQueries.length,
          chineseOnlyQueries: chineseOnlyQueries.length,
          englishOnlyQueries: englishOnlyQueries.length,
          optimizationEfficiency: `${Math.round((bilingualQueries.length / tasks.length) * 100)}% bilingual queries`,
          attempt,
          queries: tasks.map((task, index) => ({
            index: index + 1,
            query: task.query,
            researchGoal: task.researchGoal.substring(0, 100) + (task.researchGoal.length > 100 ? '...' : ''),
            queryLength: task.query.length,
            goalLength: task.researchGoal.length,
            type: bilingualQueries.includes(task) ? 'bilingual' : 
                  chineseOnlyQueries.includes(task) ? 'chinese' : 'english'
          }))
        });

        // 详细打印每个查询（用于调试）
        tasks.forEach((task, index) => {
          const queryType = bilingualQueries.includes(task) ? 'bilingual' : 
                           chineseOnlyQueries.includes(task) ? 'chinese' : 'english';
          this.logger.debug(`Query ${index + 1} [${queryType}]:`, {
            query: task.query,
            researchGoal: task.researchGoal,
            hasChinese: /[\u4e00-\u9fff]/.test(task.query),
            hasEnglish: /[a-zA-Z]/.test(task.query)
          });
        });

        this.logger.logStep('generateSERPQuery', 'end', {
          taskCount: tasks.length,
          duration,
          totalAttempts: attempt,
          queries: tasks.map(t => t.query.substring(0, 50)),
          bilingualQueries: bilingualQueries.length,
          chineseOnlyQueries: chineseOnlyQueries.length,
          englishOnlyQueries: englishOnlyQueries.length,
          optimizationRate: `${Math.round((bilingualQueries.length / tasks.length) * 100)}%`
        });

        this.onMessage("progress", {
          step: "serp-query",
          status: "end",
          data: tasks,
        });
        
        return tasks;

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        const isLastAttempt = attempt === maxRetries;
        
        this.logger.warn(`SERP query generation failed (attempt ${attempt}/${maxRetries})`, {
          error: errorMsg,
          willRetry: !isLastAttempt
        });

        if (isLastAttempt) {
          this.logger.error('Failed to generate SERP query after all retries', error instanceof Error ? error : undefined, {
            reportPlanLength: reportPlan.length,
            totalAttempts: maxRetries
          });
          
          // 检测API欠费错误并发送通知（异步非阻塞）
          if (error instanceof Error) {
            this.handleApiCreditError(error, {
              provider: this.options.AIProvider.provider,
              model: this.options.AIProvider.thinkingModel,
              operation: 'generateSERPQuery',
              additionalInfo: {
                reportPlanLength: reportPlan.length,
                totalAttempts: maxRetries
              }
            });
          }
          
          throw new Error(`Failed to parse SERP query JSON after ${maxRetries} attempts. AI response was not in valid JSON format.`);
        }

        // 延迟后重试
        await new Promise(resolve => setTimeout(resolve, 300 * attempt));
      }
    }
    
    // 理论上不应该到达这里，但作为类型安全的 fallback
    throw new Error('Unexpected error in generateSERPQuery retry logic');
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
      const { provider = "model", maxResult = 5 } = this.options.searchProvider;
      if (provider === "model") {
        const getTools = async () => {
          // Enable OpenAI's built-in search tool
          if (
            provider === "model" &&
            ["openai", "azure"].includes(taskModel) &&
            taskModel.startsWith("gpt-4o")
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
          if (provider === "model" && taskModel === "openrouter") {
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
            model: this.options.AIProvider.taskModel
          });
          
          // 检测API欠费错误并发送通知（异步非阻塞）
          if (error instanceof Error) {
            this.handleApiCreditError(error, {
              provider: this.options.AIProvider.provider,
              model: this.options.AIProvider.taskModel,
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
            model: this.options.AIProvider.taskModel,
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
    this.logger.logStep('writeFinalReport', 'start', {
      taskCount: tasks.length,
      enableCitationImage,
      enableReferences
    });
    this.onMessage("progress", { step: "final-report", status: "start" });

    const learnings = tasks.map((item) => item.learning);
    const sources: Source[] = unique(
      flat(tasks.map((item) => item.sources || [])),
      (item) => item.url
    );
    const images: ImageSource[] = unique(
      flat(tasks.map((item) => item.images || [])),
      (item) => item.url
    );

    // 记录输入数据统计
    this.logger.debug('Final report input data', {
      reportPlanLength: reportPlan.length,
      taskCount: tasks.length,
      totalLearningsLength: learnings.reduce((sum, learning) => sum + learning.length, 0),
      sourcesCount: sources.length,
      imagesCount: images.length,
      averageLearningLength: learnings.reduce((sum, learning) => sum + learning.length, 0) / learnings.length
    });

    const systemPrompt = [getSystemPrompt(), outputGuidelinesPrompt].join("\n\n");
    const finalPrompt = [
      writeFinalReportPrompt(
        reportPlan,
        learnings,
        sources.map((item) => pick(item, ["title", "url"])),
        images,
        "",
        images.length > 0 && enableCitationImage,
        sources.length > 0 && enableReferences
      ),
      this.getResponseLanguagePrompt(),
    ].join("\n\n");

    this.logger.debug('Final report prompt details', {
      systemPromptLength: systemPrompt.length,
      finalPromptLength: finalPrompt.length,
      finalPromptPreview: finalPrompt.substring(0, 500),
      learningsCount: learnings.length,
      sourcesCount: sources.length,
      imagesCount: images.length,
      environment: {
        nodeVersion: typeof process !== 'undefined' && process.version ? process.version : 'browser',
        platform: typeof process !== 'undefined' && process.platform ? process.platform : 'browser',
        memoryUsage: (() => {
          try {
            return typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage() : 'unavailable';
          } catch {
            // Edge Runtime 环境不支持 process.memoryUsage()
            return 'edge-runtime-unavailable';
          }
        })(),
        timestamp: new Date().toISOString()
      }
    });

    // 重试机制：最多重试 3 次
    const maxRetries = 3;
    let lastError: Error | null = null;
    const overallStartTime = Date.now();
    
    // 用于累积所有重试的内容，确保不丢失任何内容
    let accumulatedContent = "";
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      
      // 智能prompt增强 - 根据上一次失败原因和重试次数调整
      let enhancedPrompt = finalPrompt;
      const promptEnhancements: string[] = [];
      
      // 基础重试提示
      if (attempt > 1) {
        const enhancement = '\n\nIMPORTANT: Please provide a comprehensive report with at least 1000 characters. Do not return empty content.';
        enhancedPrompt += enhancement;
        promptEnhancements.push('Added minimum length requirement');
      }
      
      // 针对特定问题的增强（基于上一次的失败原因）
      if (attempt === 2) {
        // 第二次尝试：添加token和内容相关的指导
        const tokenEnhancement = '\n\nTOKEN OPTIMIZATION: If you encounter token limits, prioritize the most important information. Focus on key findings and conclusions.';
        const contentEnhancement = '\n\nCONTENT GUIDELINES: Ensure your response contains substantial analysis. Avoid overly cautious or filtered responses.';
        enhancedPrompt += tokenEnhancement + contentEnhancement;
        promptEnhancements.push('Added token optimization and content guidelines');
      }
      
      if (attempt === 3) {
        // 第三次尝试：更强的指导和警告
        const finalEnhancement = '\n\nFINAL ATTEMPT WARNING: This is the final attempt. You MUST generate a complete, substantial response. Focus on core findings and provide actionable insights. Do not stop generating content prematurely.';
        enhancedPrompt += finalEnhancement;
        promptEnhancements.push('Added final attempt warning');
      }
      
      // 针对特定finishReason的增强（如果已知上一次的失败原因）
      if (attempt > 1) {
        // 这些增强会在实际重试时由重试策略决定是否应用
        enhancedPrompt += '\n\nSAFETY NOTE: Please generate educational, factual content that complies with content policies while being comprehensive and informative.';
        enhancedPrompt += '\n\nLENGTH OPTIMIZATION: Structure your response to maximize information density. Use concise but complete explanations.';
        
        promptEnhancements.push('Added safety and length optimizations');
      }
      
      try {
        // 记录详细的重试开始信息
        this.logger.info(`Final report generation attempt ${attempt}/${maxRetries}`, {
          attempt,
          remainingAttempts: maxRetries - attempt,
          inputData: {
            reportPlanLength: reportPlan.length,
            learningsCount: learnings.length,
            totalLearningsLength: learnings.reduce((sum, learning) => sum + learning.length, 0),
            sourcesCount: sources.length,
            imagesCount: images.length,
            enableCitationImage,
            enableReferences
          },
          promptData: {
            systemPromptLength: systemPrompt.length,
            originalPromptLength: finalPrompt.length
          },
          modelConfig: {
            provider: this.options.AIProvider.provider,
            model: this.options.AIProvider.thinkingModel,
            baseURL: this.options.AIProvider.baseURL ? this.options.AIProvider.baseURL.substring(0, 50) + '...' : undefined,
            apiKeyPrefix: this.options.AIProvider.apiKey ? this.options.AIProvider.apiKey.substring(0, 8) + '...' : 'Not configured',
            apiKeySuffix: this.options.AIProvider.apiKey && this.options.AIProvider.apiKey.length > 8 ? '...' + this.options.AIProvider.apiKey.slice(-4) : undefined
          }
        }, true);

        const thinkTagStreamProcessor = new ThinkTagStreamProcessor();
        
        // 记录模型创建过程
        this.logger.debug(`Creating thinking model for attempt ${attempt}`, {
          modelConfig: {
            provider: this.options.AIProvider.provider,
            model: this.options.AIProvider.thinkingModel,
            baseURL: this.options.AIProvider.baseURL
          },
          attempt
        });
        
        const model = await this.getThinkingModel();
        
        // 记录prompt增强信息
        if (promptEnhancements.length > 0) {
          this.logger.debug(`Prompt enhanced for attempt ${attempt}`, {
            enhancements: promptEnhancements,
            originalLength: finalPrompt.length,
            enhancedLength: enhancedPrompt.length,
            addedLength: enhancedPrompt.length - finalPrompt.length
          });
        }
        
        // 记录AI请求的详细参数
        this.logger.debug(`AI request details for attempt ${attempt}`, {
          request: {
            model: this.options.AIProvider.thinkingModel,
            systemPromptLength: systemPrompt.length,
            promptLength: enhancedPrompt.length,
            systemPromptPreview: systemPrompt.substring(0, 200) + '...',
            promptPreview: enhancedPrompt.substring(0, 300) + '...',
            promptSuffix: enhancedPrompt.slice(-200) // 显示prompt结尾，包含重试增强内容
          },
          timing: {
            requestStartTime: new Date().toISOString(),
            attemptNumber: attempt
          },
          tokenAnalysis: getTokenUsageAnalysis(
            this.options.AIProvider.thinkingModel, 
            null, 
            null, 
            enhancedPrompt
          )
        }, true);

        const result = streamText({
          model,
          system: systemPrompt,
          prompt: enhancedPrompt,
        });
        
        let content = "";
        let reasoningContent = "";
        let sourceCount = 0;
        let streamChunks = 0;
        let firstChunkTime: number | null = null;
        let tokenAnalysis: any = null;
        let currentFinishReason: string | undefined = undefined;

        // 添加详细的报告生成开始日志
        this.logger.info(`[REPORT-SEND-START] Starting to send final report to client - Attempt ${attempt}`, {
          reportLength: accumulatedContent.length,
          reportPreview: attempt === 1 ? "<final-report>" : "继续重试生成...",
          hasEndTag: false,
          timestamp: new Date().toISOString(),
          attempt,
          isRetry: attempt > 1,
          accumulatedContentLength: accumulatedContent.length
        });
        
        // 每次尝试都发送开始标签，确保每次都是完整的final-report标签对
        this.onMessage("message", { type: "text", text: "<final-report>\n" });

        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            streamChunks++;
            if (firstChunkTime === null) {
              firstChunkTime = Date.now();
              this.logger.debug(`First stream chunk received for attempt ${attempt}`, {
                timeToFirstChunk: firstChunkTime - startTime,
                chunkLength: part.textDelta.length,
                chunkPreview: part.textDelta.substring(0, 100)
              });
            }
            
            thinkTagStreamProcessor.processChunk(
              part.textDelta,
              (data) => {
                content += data;
                // 添加内容传输日志
                if (streamChunks % 50 === 0) { // 每50个chunk记录一次
                  this.logger.debug(`[REPORT-CONTENT-CHUNK] Sending content chunk ${streamChunks}`, {
                    chunkLength: data.length,
                    currentContentLength: content.length,
                    chunkPreview: data.substring(0, 100),
                    attempt
                  });
                }
                this.onMessage("message", { type: "text", text: data });
              },
              (data) => {
                reasoningContent += data;
                this.onMessage("reasoning", { type: "text", text: data });
              }
            );
          } else if (part.type === "reasoning") {
            reasoningContent += part.textDelta;
            this.onMessage("reasoning", { type: "text", text: part.textDelta });
          } else if (part.type === "source") {
            sources.push(part.source);
            sourceCount++;
          } else if (part.type === "finish") {
            // 保存finishReason供后续重试逻辑使用
            currentFinishReason = part.finishReason;
            // 只有在启用 references 且报告中没有使用行内链接时，才添加传统引用列表
            // 检查内容中是否已经包含 markdown 链接格式（精确的正则表达式）
            const hasInlineLinks = /\[([^\]]+)\]\(https?:\/\/[^\)]+\)/.test(content);
            
            if (sources.length > 0 && enableReferences && !hasInlineLinks) {
              this.logger.debug('Adding fallback reference list', {
                sourcesCount: sources.length,
                hasInlineLinks,
                contentPreview: content.substring(0, 200)
              });
              
              const sourceContent =
                "\n\n---\n\n## References\n\n" +
                sources
                  .map(
                    (item, idx) =>
                      `${idx + 1}. [${item.title || 'Source'}](${item.url})`
                  )
                  .join("\n");
              content += sourceContent;
            } else if (hasInlineLinks) {
              this.logger.debug('Inline links detected, skipping reference list', {
                sourcesCount: sources.length,
                inlineLinkCount: (content.match(/\[([^\]]+)\]\(https?:\/\/[^\)]+\)/g) || []).length
              });
            }

            // 使用Token监控器进行全面分析
            tokenAnalysis = tokenMonitor.monitorAIRequest({
              modelName: this.options.AIProvider.thinkingModel,
              operation: 'writeFinalReport',
              promptText: enhancedPrompt,
              responseText: content,
              finishReason: part.finishReason,
              usage: part.usage
            });
            
            this.logger.debug(`AI response completed for attempt ${attempt}`, {
              response: {
                finishReason: part.finishReason,
                providerMetadata: part.providerMetadata,
                usage: part.usage
              },
              streaming: {
                totalChunks: streamChunks,
                timeToFirstChunk: firstChunkTime ? firstChunkTime - startTime : null,
                totalStreamTime: Date.now() - startTime
              },
              content: {
                contentLength: content.length,
                reasoningLength: reasoningContent.length,
                sourceCount: sourceCount,
                hasInlineLinks,
                contentPreview: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
                contentSuffix: content.length > 200 ? '...' + content.slice(-100) : ''
              },
              tokenAnalysis,
              attempt
            }, true);
          }
        }
        
        // 添加详细的报告生成完成日志
        this.logger.info(`[REPORT-SEND-COMPLETE] Final report sending completed - Attempt ${attempt}`, {
          finalReportLength: content.length,
          reportPreview: content.substring(0, 300),
          reportSuffix: content.length > 500 ? content.substring(Math.max(0, content.length - 200)) : content.substring(Math.max(0, content.length - 100)),
          hasEndTag: true,
          endTagSent: true,
          timestamp: new Date().toISOString(),
          attempt,
          totalStreamChunks: streamChunks,
          streamingTime: Date.now() - startTime
        });
        
        this.onMessage("message", { type: "text", text: "\n</final-report>\n\n" });
        thinkTagStreamProcessor.end();

        const duration = Date.now() - startTime;

        // 记录 LLM 调用详情（包含Token分析）
        this.logger.logLLMCall('writeFinalReport',
          {
            model: this.options.AIProvider.thinkingModel,
            enableCitationImage,
            enableReferences,
            attempt
          },
          {
            promptLength: enhancedPrompt.length,
            learningsCount: learnings.length,
            sourcesCount: sources.length,
            imagesCount: images.length,
            tokenAnalysis: tokenAnalysis
          },
          {
            contentLength: content.length,
            reasoningLength: reasoningContent.length,
            sourceCount: sourceCount
          },
          duration
        );

        // 简化的重试决策函数 - 只关注finishReason异常状态
        const getRetryStrategy = (finishReason: string | undefined, contentLength: number, attempt: number) => {
          // 异常的finishReason直接重试
          const abnormalReasons = ['unknown', 'error'];
          if (finishReason && abnormalReasons.includes(finishReason)) {
            return {
              shouldRetry: true,
              delay: Math.min(1000 * Math.pow(2, attempt), 8000), // 指数退避，最长8秒
              adjustPrompt: false,
              reason: `Abnormal finish reason: ${finishReason}`,
              priority: 'high'
            };
          }
          
          // Token限制 - 重试但调整配置
          const tokenLimitReasons = ['length', 'max_tokens', 'MAX_TOKENS'];
          if (finishReason && tokenLimitReasons.includes(finishReason)) {
            return {
              shouldRetry: true,
              delay: 500,
              adjustPrompt: true,
              reason: `Token limit reached: ${finishReason}`,
              priority: 'high'
            };
          }
          
          // 其他情况不重试（包括content_filter, stop等）
          return {
            shouldRetry: false,
            delay: 0,
            reason: `Normal finish reason: ${finishReason}`,
            priority: 'none'
          };
        };
        
        // 获取重试策略
        const retryStrategy = getRetryStrategy(currentFinishReason, content.length, attempt);
        
        // 执行重试决策
        if (retryStrategy.shouldRetry && attempt < maxRetries) {
          const errorMsg = `Final report generation requires retry: ${retryStrategy.reason} on attempt ${attempt}/${maxRetries}`;
          this.logger.warn(errorMsg, {
            retryStrategy: {
              reason: retryStrategy.reason,
              priority: retryStrategy.priority,
              delay: retryStrategy.delay,
              adjustPrompt: retryStrategy.adjustPrompt,
              finishReason: currentFinishReason,
              willRetry: true
            },
            contentAnalysis: {
              rawLength: content.length,
              trimmedLength: content.trim().length,
              contentPreview: content.substring(0, 200),
              contentSuffix: content.length > 200 ? content.slice(-100) : content,
              isEmpty: content.length === 0,
              isOnlyWhitespace: content.length > 0 && content.trim().length === 0
            },
            responseAnalysis: {
              streamChunks: streamChunks,
              timeToFirstChunk: firstChunkTime ? firstChunkTime - startTime : null,
              totalStreamTime: Date.now() - startTime,
              reasoningLength: reasoningContent.length,
              sourceCount: sourceCount
            },
            retryInfo: {
              attempt,
              maxRetries,
              willRetry: attempt < maxRetries
            }
          }, true);
          
          if (attempt === maxRetries) {
            throw new Error(`Failed to generate adequate content after ${maxRetries} attempts. ${retryStrategy.reason}`);
          }
          
          // 根据重试策略调整prompt
          if (retryStrategy.adjustPrompt) {
            if (currentFinishReason === 'length' || currentFinishReason === 'max_tokens' || currentFinishReason === 'MAX_TOKENS') {
              this.logger.info(`Adjusting prompt for token limit on retry ${attempt + 1}`, {
                originalLength: enhancedPrompt.length,
                finishReason: currentFinishReason
              });
              // 对于token限制，在下次重试时会自动添加提示
            } else if (retryStrategy.reason.includes('Content filtered')) {
              this.logger.info(`Adjusting prompt for content filter on retry ${attempt + 1}`, {
                finishReason: currentFinishReason,
                contentLength: content.length
              });
              // 内容过滤的prompt调整会在重试循环开始时处理
            } else if (retryStrategy.reason.includes('too short')) {
              this.logger.info(`Adjusting prompt for short content on retry ${attempt + 1}`, {
                contentLength: content.length,
                expectedMinimum: 1000
              });
              // 短内容的prompt调整会在重试循环开始时处理
            }
          }
          
          // 在重试前，累积当前尝试产生的内容（即使不完整也保留）
          if (content.trim().length > 0) {
            if (accumulatedContent.length > 0) {
              accumulatedContent += "\n\n---\n\n"; // 分隔符区分不同重试的内容
            }
            accumulatedContent += content;
              
            this.logger.debug(`Accumulated content from failed attempt ${attempt}`, {
              currentContentLength: content.length,
              accumulatedContentLength: accumulatedContent.length,
              finishReason: currentFinishReason,
              willRetry: true
            });
          }

          // 应用重试延迟
          if (retryStrategy.delay > 0) {
            this.logger.debug(`Applying retry delay: ${retryStrategy.delay}ms`, {
              attempt: attempt + 1,
              reason: retryStrategy.reason
            });
            await new Promise(resolve => setTimeout(resolve, retryStrategy.delay));
          }
          
          continue; // 重试
        }

        // 改进标题提取逻辑，跳过礼貌用语，找到真正的标题
        const extractTitleFromContent = (content: string): string => {
          const lines = content.split('\n').map(line => line.trim()).filter(line => line);
          
          // 查找以#开头的标题行
          for (const line of lines) {
            if (line.startsWith('#')) {
              const title = line.replaceAll('#', '').trim();
              if (title.length >= 10) {
                return title;
              }
            }
          }
          
          // 如果没有找到标题行，查找第一个实质性内容行（跳过礼貌用语）
          const skipPhrases = ['好的，分析师', '好的', '分析师', 'Hello', 'Hi', 'Thank you', '谢谢'];
          
          for (const line of lines) {
            // 跳过短行和礼貌用语
            if (line.length < 10) continue;
            
            const isSkippable = skipPhrases.some(phrase => 
              line.toLowerCase().startsWith(phrase.toLowerCase()) ||
              line.toLowerCase().includes(phrase.toLowerCase())
            );
            
            if (!isSkippable) {
              // 截取合适长度作为标题，移除markdown符号
              const cleanTitle = line
                .replaceAll('#', '')
                .replaceAll('*', '')
                .replaceAll('**', '')
                .replaceAll('`', '')
                .trim();
                
              if (cleanTitle.length >= 10) {
                return cleanTitle.length > 100 ? cleanTitle.substring(0, 100) + '...' : cleanTitle;
              }
            }
          }
          
          // 最后的备选：使用内容中的第一个句子作为标题
          const firstSentence = content.split(/[。！？\.\!\?]/)[0]?.trim();
          if (firstSentence && firstSentence.length >= 10) {
            const cleanTitle = firstSentence
              .replaceAll('#', '')
              .replaceAll('*', '')
              .replaceAll('**', '')
              .replaceAll('`', '')
              .trim();
            return cleanTitle.length > 100 ? cleanTitle.substring(0, 100) + '...' : cleanTitle;
          }
          
          // 如果还是找不到合适的标题，使用默认标题
          return 'Deep Research Analysis Report';
        };
        
        // 在成功生成内容后，累积到全局内容中（用于数据库存储）
        if (content.trim().length > 0) {
          if (accumulatedContent.length > 0) {
            accumulatedContent += "\n\n---\n\n"; // 分隔符区分不同重试的内容
          }
          accumulatedContent += content;
        }

        // 创建最终报告结果，使用当前成功的内容（用于客户端显示）
        const title = extractTitleFromContent(content);

        const finalReportResult: FinalReportResult = {
          title,
          finalReport: content, // 使用当前成功的内容
          learnings,
          sources,
          images,
        };

        // 注意：累积内容会被BackgroundTaskManager自动保存到数据库

        // 验证报告质量
        const qualityCheck = this.validateReportQuality(finalReportResult);
        
        // 使用完整日志输出质量检查结果
        this.logger.info('Final report quality check', qualityCheck, true);
        
        if (!qualityCheck.isValid && attempt < maxRetries) {
          this.logger.warn(`Quality check failed on attempt ${attempt}/${maxRetries}, retrying`, {
            qualityIssues: qualityCheck.issues,
            qualityMetrics: qualityCheck.metrics,
            retryDecision: {
              attempt,
              maxRetries,
              willRetry: true,
              reasonForRetry: 'Quality check failed'
            },
            contentAnalysis: {
              currentGeneratedLength: content.length,
              accumulatedLength: accumulatedContent.length,
              expectedMinimum: 500,
              actualTitle: title,
              titleLength: title.length,
              hasMarkdownStructure: /#{1,6}\s/.test(content),
              estimatedReadingTime: Math.ceil(content.split(/\s+/).length / 200) // 200 words per minute
            }
          }, true);
          continue; // 重试
        }

        this.logger.logStep('writeFinalReport', 'end', {
          contentLength: content.length,
          accumulatedContentLength: accumulatedContent.length,
          title,
          duration,
          qualityCheck,
          hasReasoning: reasoningContent.length > 0,
          totalAttempts: attempt,
          success: true
        });

        this.onMessage("progress", {
          step: "final-report",
          status: "end",
          data: {
            ...finalReportResult,
            finishReason: currentFinishReason || 'stop' // 传递finishReason信息
          },
        });
        
        return finalReportResult;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(`Unknown error on attempt ${attempt}`);
        
        // 在异常情况下也累积已生成的内容（如果有的话）
        if (content && content.trim().length > 0) {
          if (accumulatedContent.length > 0) {
            accumulatedContent += "\n\n---\n\n"; // 分隔符区分不同重试的内容
          }
          accumulatedContent += content;
          
          this.logger.debug(`Accumulated content from failed attempt ${attempt} (exception)`, {
            currentContentLength: content.length,
            accumulatedContentLength: accumulatedContent.length,
            error: lastError.message,
            willRetry: attempt < maxRetries
          });
        }
        
        // 检查是否为网络或API相关的错误
        const isNetworkError = lastError.message.toLowerCase().includes('network') || 
                               lastError.message.toLowerCase().includes('timeout') ||
                               lastError.message.toLowerCase().includes('connection') ||
                               lastError.message.toLowerCase().includes('fetch');
        
        const isAPIError = lastError.message.toLowerCase().includes('api') ||
                          lastError.message.toLowerCase().includes('unauthorized') ||
                          lastError.message.toLowerCase().includes('forbidden') ||
                          lastError.message.toLowerCase().includes('rate limit');
        
        this.logger.warn(`Final report generation failed on attempt ${attempt}/${maxRetries}`, {
          error: {
            message: lastError.message,
            stack: lastError.stack,
            name: lastError.name,
            type: isNetworkError ? 'network' : isAPIError ? 'api' : 'unknown',
            isNetworkError,
            isAPIError
          },
          requestDetails: {
            modelUsed: this.options.AIProvider.thinkingModel,
            promptLength: enhancedPrompt.length,
            systemPromptLength: systemPrompt.length,
            attempt,
            timeSinceStart: Date.now() - startTime
          },
          retryInfo: {
            willRetry: attempt < maxRetries,
            remainingAttempts: maxRetries - attempt,
            nextRetryDelay: attempt < maxRetries ? 1000 * attempt : 0
          },
          context: {
            inputDataSize: {
              reportPlanLength: reportPlan.length,
              learningsCount: learnings.length,
              sourcesCount: sources.length
            }
          }
        }, true);
        
        // 检测API欠费错误并发送通知（异步非阻塞）
        if (lastError instanceof Error) {
          this.handleApiCreditError(lastError, {
            provider: this.options.AIProvider.provider,
            model: this.options.AIProvider.thinkingModel,
            operation: 'writeFinalReport',
            additionalInfo: {
              attempt,
              maxRetries,
              reportPlanLength: reportPlan.length,
              tasksCount: tasks.length,
              promptLength: enhancedPrompt.length,
              timeSinceStart: Date.now() - startTime
            }
          });
        }
        
        if (attempt === maxRetries) {
          break; // 最后一次尝试失败，退出循环
        }
        
        // 延迟后重试
        const retryDelay = 1000 * attempt;
        this.logger.debug(`Retrying after ${retryDelay}ms delay`, { attempt, nextAttempt: attempt + 1 });
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    // 所有重试均失败
    const finalError = new Error(`Failed to generate final report after ${maxRetries} attempts. ${lastError?.message || 'Unknown error'}`);
    
    this.logger.error('All final report generation attempts failed', finalError, {
      reportPlanLength: reportPlan.length,
      taskCount: tasks.length,
      systemPromptLength: systemPrompt.length,
      finalPromptLength: finalPrompt.length,
      totalAttempts: maxRetries,
      lastError: lastError?.message,
      failureSummary: {
        allAttemptsFailed: true,
        totalRetryTime: Date.now() - overallStartTime,
        possibleCauses: [
          finalPrompt.length > 50000 ? 'Prompt too long (>50k chars)' : null,
          !this.options.AIProvider.apiKey ? 'Missing API key' : null,
          lastError?.message.toLowerCase().includes('rate limit') ? 'Rate limiting' : null,
          lastError?.message.toLowerCase().includes('network') ? 'Network issues' : null
        ].filter(Boolean)
      }
    }, true);

    // 检测最终错误是否为API欠费问题并发送通知（异步非阻塞）
    if (lastError instanceof Error) {
      this.handleApiCreditError(lastError, {
        provider: this.options.AIProvider.provider,
        model: this.options.AIProvider.thinkingModel,
        operation: 'writeFinalReport',
        additionalInfo: {
          finalFailure: true,
          totalAttempts: maxRetries,
          reportPlanLength: reportPlan.length,
          tasksCount: tasks.length,
          totalRetryTime: Date.now() - overallStartTime,
          possibleCauses: [
            finalPrompt.length > 50000 ? 'Prompt too long (>50k chars)' : null,
            !this.options.AIProvider.apiKey ? 'Missing API key' : null,
            lastError?.message.toLowerCase().includes('rate limit') ? 'Rate limiting' : null,
            lastError?.message.toLowerCase().includes('network') ? 'Network issues' : null
          ].filter(Boolean)
        }
      });
    }

    // 返回一个包含错误信息的报告，如果有累积内容则包含进去
    let finalReportContent = `# Final Report Generation Failed

## Error Details
- **Error Message**: ${lastError?.message || 'Unknown error'}
- **Total Attempts**: ${maxRetries}
- **Input Data**: ${tasks.length} research tasks processed
- **Prompt Length**: ${finalPrompt.length} characters

## Debugging Information
- Report Plan Length: ${reportPlan.length} characters
- Total Learning Content: ${learnings.reduce((sum, learning) => sum + learning.length, 0)} characters
- Sources Available: ${sources.length}
- Images Available: ${images.length}
- **Accumulated Content**: ${accumulatedContent.length} characters from attempts

## Possible Causes
1. Prompt too long (${finalPrompt.length} chars) - consider reducing input content
2. AI model content filtering blocking output
3. Network or API service issues
4. Model overload or rate limiting

## Next Steps
1. Check API provider status and rate limits
2. Try reducing the amount of learning content
3. Verify API keys and model availability
4. Consider using a different AI model

*This error report was generated automatically after ${maxRetries} failed attempts.*`;

    // 如果有累积的内容，将其添加到错误报告中
    if (accumulatedContent.trim().length > 0) {
      finalReportContent += `

## Partial Content Generated During Attempts

The following content was generated during the ${maxRetries} attempts but did not complete successfully:

---

${accumulatedContent}

---

*End of partial content*`;
    }

    const errorReportResult: FinalReportResult = {
      title: accumulatedContent.length > 100 ? "Partial Report Generated" : "Error: Failed to Generate Report",
      finalReport: finalReportContent,
      learnings,
      sources,
      images,
    };

    this.logger.logStep('writeFinalReport', 'end', {
      contentLength: errorReportResult.finalReport.length,
      title: errorReportResult.title,
      duration: 0,
      qualityCheck: { isValid: false, issues: ['Generated error report due to failures'] },
      hasReasoning: false,
      totalAttempts: maxRetries,
      success: false
    });

    this.onMessage("progress", {
      step: "final-report",
      status: "end",
      data: errorReportResult,
    });

    return errorReportResult;
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
          model: `${this.options.AIProvider.thinkingModel}/${this.options.AIProvider.taskModel}`,
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
