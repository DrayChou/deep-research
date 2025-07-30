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
  constructor(options: DeepResearchOptions) {
    this.options = options;
    this.logger = logger.getInstance('DeepResearch');
    if (isFunction(options.onMessage)) {
      this.onMessage = options.onMessage;
    }
    this.logger.info('DeepResearch initialized', {
      aiProvider: options.AIProvider.provider,
      thinkingModel: options.AIProvider.thinkingModel,
      taskModel: options.AIProvider.taskModel,
      searchProvider: options.searchProvider.provider,
      language: options.language
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
    const thinkTagStreamProcessor = new ThinkTagStreamProcessor();

    const startTime = Date.now();
    const systemPrompt = getSystemPrompt();
    const userPrompt = [
      writeReportPlanPrompt(query),
      this.getResponseLanguagePrompt(),
    ].join("\n\n");

    this.logger.debug('Report plan prompt', {
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      userPromptPreview: userPrompt.substring(0, 200)
    });

    try {
      const model = await this.getThinkingModel();
      const result = streamText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
      });
      let content = "";
      let reasoningContent = "";
      this.onMessage("message", { type: "text", text: "<report-plan>\n" });

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
      this.onMessage("message", { type: "text", text: "\n</report-plan>\n\n" });

      const duration = Date.now() - startTime;
      this.logger.logLLMCall('writeReportPlan',
        { model: this.options.AIProvider.thinkingModel },
        { promptLength: userPrompt.length, content: query },
        { contentLength: content.length, reasoningLength: reasoningContent.length },
        duration
      );

      this.logger.logStep('writeReportPlan', 'end', {
        contentLength: content.length,
        duration,
        hasReasoning: reasoningContent.length > 0
      });

      this.onMessage("progress", {
        step: "report-plan",
        status: "end",
        data: content,
      });
      return content;
    } catch (error) {
      this.logger.error('Failed to write report plan', error instanceof Error ? error : undefined, {
        queryLength: query.length,
        systemPromptLength: getSystemPrompt().length,
        userPromptLength: userPrompt.length
      });
      throw error;
    }
  }

  async generateSERPQuery(
    reportPlan: string
  ): Promise<DeepResearchSearchTask[]> {
    this.logger.logStep('generateSERPQuery', 'start', { reportPlanLength: reportPlan.length });
    this.onMessage("progress", { step: "serp-query", status: "start" });
    const thinkTagStreamProcessor = new ThinkTagStreamProcessor();

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

    try {
      const model = await this.getThinkingModel();
      const { text } = await generateText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
      });
      const querySchema = getSERPQuerySchema();
      let content = "";
      thinkTagStreamProcessor.processChunk(text, (data) => {
        content += data;
      });

      const duration = Date.now() - startTime;
      this.logger.logLLMCall('generateSERPQuery',
        { model: this.options.AIProvider.thinkingModel },
        { promptLength: userPrompt.length, reportPlanLength: reportPlan.length },
        { responseLength: text.length, parsedContentLength: content.length },
        duration
      );

      // 改进的 JSON 解析，添加重试策略 - 重新调用 AI 接口
      let data;
      let parseSuccess = false;
      let retryCount = 0;
      const maxRetries = 3;
      
      // 初始AI调用
      let aiText = text;
      let processedContent = content;
      
      while (!parseSuccess && retryCount < maxRetries) {
        try {
          const cleanedContent = removeJsonMarkdown(processedContent);
          this.logger.debug(`Attempting to parse SERP query JSON (attempt ${retryCount + 1}/${maxRetries})`, {
            originalLength: aiText.length,
            processedLength: processedContent.length,
            cleanedLength: cleanedContent.length,
            cleanedPreview: cleanedContent.substring(0, 200) + (cleanedContent.length > 200 ? '...' : '')
          });
          
          data = JSON.parse(cleanedContent);
          parseSuccess = true;
          
          this.logger.info('SERP query JSON parsed successfully', {
            attempt: retryCount + 1,
            dataLength: Array.isArray(data) ? data.length : 0
          });
          
        } catch (parseError) {
          retryCount++;
          
          this.logger.warn(`JSON parse failed (attempt ${retryCount}/${maxRetries}), retrying with new AI call`, {
            error: parseError instanceof Error ? parseError.message : 'Unknown parse error',
            contentPreview: processedContent.substring(0, 300) + (processedContent.length > 300 ? '...' : ''),
            contentLength: processedContent.length,
            fullOriginalContent: aiText,
            fullCleanedContent: removeJsonMarkdown(processedContent)
          });
          
          if (retryCount < maxRetries) {
            // 重新调用AI接口获取新的结果
            this.logger.info(`Retrying AI call for SERP query generation (attempt ${retryCount + 1}/${maxRetries})`);
            
            try {
              const retryModel = await this.getThinkingModel();
              const enhancedPrompt = userPrompt + 
                (retryCount > 1 ? '\n\nIMPORTANT: Please respond with valid JSON format only. No markdown, no extra text, just the JSON array.' : '') +
                (retryCount > 2 ? '\n\nCRITICAL: You MUST return valid JSON. Format: [{"query": "...", "researchGoal": "..."}]' : '');
              
              const { text: retryText } = await generateText({
                model: retryModel,
                system: systemPrompt,
                prompt: enhancedPrompt,
              });
              
              // 重新处理返回的内容
              processedContent = "";
              const retryThinkTagProcessor = new ThinkTagStreamProcessor();
              retryThinkTagProcessor.processChunk(retryText, (data) => {
                processedContent += data;
              });
              retryThinkTagProcessor.end();
              aiText = retryText;
              
              this.logger.debug('Retrieved new AI response for SERP query', {
                retryAttempt: retryCount + 1,
                responseLength: retryText.length,
                processedLength: processedContent.length
              });
              
            } catch (retryError) {
              this.logger.error('AI retry call failed', retryError instanceof Error ? retryError : undefined);
              // 如果AI调用失败，继续下一次重试
            }
            
            // 短暂延迟后继续
            await new Promise(resolve => setTimeout(resolve, 200 * retryCount));
          } else {
            // 如果所有重试都失败了，抛出异常中断任务
            this.logger.error('SERP query JSON parsing failed after all retries', undefined, {
              retryAttempts: maxRetries,
              lastResponse: aiText,
              lastProcessedContent: processedContent,
              errorDetails: 'AI returned malformed JSON that could not be repaired after multiple attempts'
            });
            
            throw new Error(`Failed to parse SERP query JSON after ${maxRetries} attempts. AI response was not in valid JSON format. Please check the AI model configuration and prompts.`);
          }
        }
      }
        
        // 尝试修复常见的 JSON 格式问题
        let repairedContent = removeJsonMarkdown(content);
        
        // 修复 1: 移除 thinking 标签残留
        repairedContent = repairedContent.replace(/e_start|e_end|<think>|<\/think>/g, '');
        
        // 修复 2: 移除多余的换行和空格
        repairedContent = repairedContent.replace(/\n\s*\n/g, '\n').trim();
        
        // 修复 3: 尝试找到 JSON 数组的开始和结束
        const arrayStart = repairedContent.indexOf('[');
        const arrayEnd = repairedContent.lastIndexOf(']');
        
        if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
          repairedContent = repairedContent.substring(arrayStart, arrayEnd + 1);
          this.logger.debug('Extracted JSON array from content', {
            extractedLength: repairedContent.length,
            extractedPreview: repairedContent.substring(0, 200)
          });
        }
        
        try {
          data = JSON.parse(repairedContent);
          this.logger.info('JSON repair successful', {
            repairSteps: 'Applied standard JSON repair procedures',
            finalContent: repairedContent
          });
        } catch (repairError) {
          this.logger.error('JSON repair failed', repairError instanceof Error ? repairError : undefined, {
            originalContent: content,
            repairedContent,
            parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
            repairError: repairError instanceof Error ? repairError.message : 'Unknown error',
            repairStepsApplied: [
              'Removed JSON markdown formatting',
              'Removed thinking tag remnants',
              'Normalized whitespace',
              'Extracted JSON array boundaries'
            ]
          });
          
          // 如果所有重试都失败了，抛出异常中断任务
          this.logger.error('JSON repair failed after all retry attempts', repairError instanceof Error ? repairError : undefined, {
            originalContent: content,
            repairedContent,
            parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
            repairError: repairError instanceof Error ? repairError.message : 'Unknown error',
            repairStepsApplied: [
              'Removed JSON markdown formatting',
              'Removed thinking tag remnants',
              'Normalized whitespace',
              'Extracted JSON array boundaries'
            ],
            retryAttempts: maxRetries
          });
          
          throw new Error(`Failed to parse SERP query JSON after ${maxRetries} attempts. AI response was not in valid JSON format. Please check the AI model configuration and prompts.`);
        }
      }
      
      thinkTagStreamProcessor.end();
      const result = querySchema.safeParse(data);

      if (result.success) {
        const tasks: DeepResearchSearchTask[] = data.map(
          (item: { query: string; researchGoal?: string }) => ({
            query: item.query,
            researchGoal: item.researchGoal || "",
          })
        );

        this.logger.logStep('generateSERPQuery', 'end', {
          taskCount: tasks.length,
          duration,
          queries: tasks.map(t => t.query.substring(0, 50))
        });

        this.onMessage("progress", {
          step: "serp-query",
          status: "end",
          data: tasks,
        });
        return tasks;
      } else {
        this.logger.error('SERP query validation failed', undefined, {
          error: result.error.message,
          content,
          data
        });
        throw new Error(result.error.message);
      }
    } catch (error) {
      this.logger.error('Failed to generate SERP query', error instanceof Error ? error : undefined, {
        reportPlanLength: reportPlan.length,
        systemPromptLength: systemPrompt.length,
        userPromptLength: userPrompt.length
      });
      throw error;
    }

    

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
      }

      this.onMessage("message", { type: "text", text: "<search-task>\n" });
      this.onMessage("message", { type: "text", text: `## ${item.query}\n\n` });
      this.onMessage("message", {
        type: "text",
        text: `${addQuoteBeforeAllLine(item.researchGoal)}\n\n`,
      });
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
    const thinkTagStreamProcessor = new ThinkTagStreamProcessor();

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
    const startTime = Date.now();
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
      imagesCount: images.length
    });

    try {
      const model = await this.getThinkingModel();
      const result = streamText({
        model,
        system: systemPrompt,
        prompt: finalPrompt,
      });
      let content = "";
      let reasoningContent = "";
      let sourceCount = 0;

      this.onMessage("message", { type: "text", text: "<final-report>\n" });

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
        } else if (part.type === "source") {
          sources.push(part.source);
          sourceCount++;
        } else if (part.type === "finish") {
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
          }

          // 记录完成状态
          this.logger.debug('Final report generation finished', {
            providerMetadata: part.providerMetadata,
            usage: part.usage,
            finishReason: part.finishReason
          });
        }
      }
      this.onMessage("message", { type: "text", text: "\n</final-report>\n\n" });
      thinkTagStreamProcessor.end();

      const duration = Date.now() - startTime;

      // 记录LLM调用详情
      this.logger.logLLMCall('writeFinalReport',
        {
          model: this.options.AIProvider.thinkingModel,
          enableCitationImage,
          enableReferences
        },
        {
          promptLength: finalPrompt.length,
          learningsCount: learnings.length,
          sourcesCount: sources.length,
          imagesCount: images.length
        },
        {
          contentLength: content.length,
          reasoningLength: reasoningContent.length,
          sourceCount: sourceCount
        },
        duration
      );

      const title = content
        .split("\n")[0]
        .replaceAll("#", "")
        .replaceAll("*", "")
        .trim();

      const finalReportResult: FinalReportResult = {
        title,
        finalReport: content,
        learnings,
        sources,
        images,
      };

      // 验证报告质量
      const qualityCheck = this.validateReportQuality(finalReportResult);
      this.logger.logStep('writeFinalReport', 'end', {
        contentLength: content.length,
        title,
        duration,
        qualityCheck,
        hasReasoning: reasoningContent.length > 0
      });

      this.onMessage("progress", {
        step: "final-report",
        status: "end",
        data: finalReportResult,
      });
      return finalReportResult;
    } catch (error) {
      this.logger.error('Failed to write final report', error instanceof Error ? error : undefined, {
        reportPlanLength: reportPlan.length,
        taskCount: tasks.length,
        systemPromptLength: systemPrompt.length,
        finalPromptLength: finalPrompt.length
      });
      throw error;
    }
  }

  // 合并和去重API keys
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

    return {
      isValid: issues.length === 0,
      issues,
      metrics: {
        contentLength: report.finalReport.length,
        titleLength: report.title?.length || 0,
        learningsCount: report.learnings.length,
        sourcesCount: report.sources.length,
        imagesCount: report.images.length
      }
    };
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

      // 重新抛出错误，包含原始错误信息
      const enhancedError = new Error(errorMessage);
      enhancedError.stack = err instanceof Error ? err.stack : undefined;
      throw enhancedError;
    }
  }
}

export default DeepResearch;
