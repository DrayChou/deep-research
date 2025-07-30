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
import { logger } from "@/utils/logger";

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
  onMessage: (event: string, data: any) => void = () => {};
  private logger: logger;
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

  public async getThinkingModel() {
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
      this.logger.error('Failed to create thinking model', error, config);
      throw error;
    }
  }

  public async getTaskModel() {
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
      this.logger.error('Failed to create task model', error, config);
      throw error;
    }
  }

  getResponseLanguagePrompt() {
    return this.options.language
      ? `**Respond in ${this.options.language}**`
      : `**Respond in the same language as the user's language**`;
  }

  public async writeReportPlan(query: string): Promise<string> {
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
  }

  public async generateSERPQuery(
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
    
    const data = JSON.parse(removeJsonMarkdown(content));
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
      this.logger.error('SERP query validation failed', null, { 
        error: result.error.message,
        content,
        data
      });
      throw new Error(result.error.message);
    }
  }

  public async runSearchTask(
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
        try {
          const result = await createSearchProvider({
            query: item.query,
            ...this.options.searchProvider,
          });

          sources = result.sources || [];
          images = result.images;
        } catch (err) {
          const errorMessage = `[${provider}]: ${
            err instanceof Error ? err.message : "Search Failed"
          }`;
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
                `[${idx + 1}]: ${item.url}${
                  item.title ? ` "${item.title.replaceAll('"', " ")}"` : ""
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

  public async writeFinalReport(
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
                  `[${idx + 1}]: ${item.url}${
                    item.title ? ` "${item.title.replaceAll('"', " ")}"` : ""
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

  public async start(
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
      
      this.logger.error('Deep research failed', err, errorDetails);
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
