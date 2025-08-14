/**
 * 修正版增强 DeepResearch 方法
 * 关键修正：
 * 1. 绝不容忍 unknown finishReason - 必须重试
 * 2. 绝不降低质量阈值 - 宁愿失败也要保证质量
 */

import { MethodWithRotation, MethodExecutionContext } from './method-with-rotation';
import { parseSerpQueryJson } from './json-parser-utils';
import { StrictQualityValidator } from './strict-quality-validator';
import { streamText, generateText } from "ai";
import { getSystemPrompt, writeReportPlanPrompt, generateSerpQueriesPrompt, writeFinalReportPrompt } from "./prompts";
import { outputGuidelinesPrompt } from "@/constants/prompts";
import { ThinkTagStreamProcessor } from "@/utils/text";
import { getTokenUsageAnalysis } from "@/utils/model-limits";
import { tokenMonitor } from "@/utils/token-monitor";
import { Logger } from "@/utils/logger";
import { DeepResearchSearchTask, DeepResearchSearchResult } from './index';

interface FinalReportResult {
  title: string;
  finalReport: string;
  learnings: string[];
  sources: Array<{ url: string; title?: string }>;
  images: Array<{ url: string; description?: string }>;
}
import { pick, unique, flat } from "radash";

export class CorrectedEnhancedDeepResearchMethods {
  /**
   * 修正版 writeReportPlan - 严格质量要求，不容忍unknown
   */
  static async writeReportPlan(
    query: string,
    options: any,
    onMessage: (event: string, data: any) => void
  ): Promise<string> {
    const logger = Logger.getInstance('Corrected-writeReportPlan');
    
    logger.logStep('writeReportPlan', 'start', { 
      queryLength: query.length, 
      queryPreview: query.substring(0, 100) 
    });
    onMessage("progress", { step: "report-plan", status: "start" });

    const thinkingModels = Array.isArray(options.AIProvider.thinkingModel) 
      ? options.AIProvider.thinkingModel 
      : [options.AIProvider.thinkingModel];

    const context: MethodExecutionContext = {
      operation: 'writeReportPlan',
      models: thinkingModels,
      createModelInstance: async (modelName: string) => {
        return await MethodWithRotation.createModelInstance(
          modelName,
          options.AIProvider.provider,
          pick(options.AIProvider, ["baseURL", "apiKey"])
        );
      },
      validateResult: (result: { content: string; finishReason?: string }) => {
        // 使用严格质量验证器
        const validation = StrictQualityValidator.validateReportPlan(
          result.content, 
          result.finishReason
        );
        return {
          valid: validation.valid,
          error: validation.error
        };
      },
      additionalContext: {
        queryLength: query.length,
        queryPreview: query.substring(0, 100)
      }
    };

    const executionResult = await MethodWithRotation.execute(
      context,
      async (model, attempt) => {
        const startTime = Date.now();
        const thinkTagStreamProcessor = new ThinkTagStreamProcessor();
        const systemPrompt = getSystemPrompt();
        
        // 根据重试情况增强 prompt，但不降低质量要求
        let enhancedPrompt = [
          writeReportPlanPrompt(query),
          options.language ? `**Respond in ${options.language}**` : `**Respond in the same language as the user's language**`,
        ].join("\n\n");
        
        if (attempt.methodRetry > 1) {
          enhancedPrompt += `\n\nIMPORTANT: This is method retry ${attempt.methodRetry}/3 for model ${attempt.modelName}. Previous attempts failed quality checks. Please provide a comprehensive report plan with at least 50 characters. Ensure complete generation - do NOT stop mid-sentence.`;
        }
        
        if (attempt.totalAttempt > 1) {
          enhancedPrompt += `\n\nCRITICAL: Previous attempts with other models failed. This may be due to incomplete generation or quality issues. Please ensure your response is complete, substantial, and meets quality standards. Generate the FULL response.`;
        }

        logger.debug(`Report plan execution attempt`, {
          modelName: attempt.modelName,
          methodRetry: attempt.methodRetry,
          totalAttempt: attempt.totalAttempt,
          systemPromptLength: systemPrompt.length,
          userPromptLength: enhancedPrompt.length
        });

        const result = streamText({
          model,
          system: systemPrompt,
          prompt: enhancedPrompt,
        });

        let content = "";
        let reasoningContent = "";
        let finishReason: string | undefined;
        
        // 只在第一次尝试时发送开始标签
        if (attempt.totalAttempt === 1) {
          onMessage("message", { type: "text", text: "<report-plan>\n" });
        }

        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            thinkTagStreamProcessor.processChunk(
              part.textDelta,
              (data) => {
                content += data;
                onMessage("message", { type: "text", text: data });
              },
              (data) => {
                reasoningContent += data;
                onMessage("reasoning", { type: "text", text: data });
              }
            );
          } else if (part.type === "reasoning") {
            reasoningContent += part.textDelta;
            onMessage("reasoning", { type: "text", text: part.textDelta });
          } else if (part.type === "finish") {
            finishReason = part.finishReason;
          }
        }

        const duration = Date.now() - startTime;
        
        // Token分析
        const tokenAnalysis = getTokenUsageAnalysis(
          attempt.modelName,
          null,
          null,
          systemPrompt + '\n\n' + enhancedPrompt
        );
        
        logger.logLLMCall('writeReportPlan',
          { model: attempt.modelName, attempt: attempt.totalAttempt },
          { 
            promptLength: enhancedPrompt.length, 
            content: query,
            tokenAnalysis 
          },
          { 
            contentLength: content.length, 
            reasoningLength: reasoningContent.length,
            finishReason 
          },
          duration
        );

        // 返回内容和finishReason供验证
        return { 
          content: content.trim(), 
          finishReason,
          reasoningLength: reasoningContent.length 
        };
      },
      {
        maxModelRetries: 3,
        maxMethodRetries: 3,
        retryDelay: 1000
      }
    );

    if (!executionResult.success) {
      // 生成用户友好的错误消息
      const errorMessage = StrictQualityValidator.generateUserErrorMessage(
        'Report Plan',
        executionResult.attempts
      );
      
      logger.error('Report plan generation failed completely', executionResult.error, {
        totalAttempts: executionResult.attempts,
        allModelsAttempted: thinkingModels,
        userErrorMessage: errorMessage
      });
      
      throw new Error(errorMessage);
    }

    const { content } = executionResult.result!;
    
    logger.logStep('writeReportPlan', 'end', {
      contentLength: content.length,
      totalAttempts: executionResult.attempts,
      successfulModel: executionResult.successfulModel,
      executionTime: executionResult.executionTime,
      success: true
    });

    onMessage("message", { type: "text", text: "\n</report-plan>\n\n" });
    onMessage("progress", {
      step: "report-plan",
      status: "end",
      data: content,
    });

    return content;
  }

  /**
   * 修正版 generateSERPQuery - 严格JSON验证，不容忍unknown
   */
  static async generateSERPQuery(
    reportPlan: string,
    options: any,
    onMessage: (event: string, data: any) => void
  ): Promise<DeepResearchSearchTask[]> {
    const logger = Logger.getInstance('Corrected-generateSERPQuery');
    
    logger.logStep('generateSERPQuery', 'start', { reportPlanLength: reportPlan.length });
    onMessage("progress", { step: "serp-query", status: "start" });

    const thinkingModels = Array.isArray(options.AIProvider.thinkingModel) 
      ? options.AIProvider.thinkingModel 
      : [options.AIProvider.thinkingModel];

    const context: MethodExecutionContext = {
      operation: 'generateSERPQuery',
      models: thinkingModels,
      createModelInstance: async (modelName: string) => {
        return await MethodWithRotation.createModelInstance(
          modelName,
          options.AIProvider.provider,
          pick(options.AIProvider, ["baseURL", "apiKey"])
        );
      },
      validateResult: (result: { tasks: DeepResearchSearchTask[]; finishReason?: string }) => {
        // 使用严格质量验证器
        const validation = StrictQualityValidator.validateSerpQueries(
          result.tasks, 
          result.finishReason
        );
        return {
          valid: validation.valid,
          error: validation.error
        };
      },
      additionalContext: {
        reportPlanLength: reportPlan.length
      }
    };

    const executionResult = await MethodWithRotation.execute(
      context,
      async (model, attempt) => {
        const startTime = Date.now();
        const systemPrompt = getSystemPrompt();
        const userPrompt = [
          generateSerpQueriesPrompt(reportPlan),
          options.language ? `**Respond in ${options.language}**` : `**Respond in the same language as the user's language**`,
        ].join("\n\n");

        // 根据重试情况增强 prompt，强调完整性
        let enhancedPrompt = userPrompt;
        if (attempt.methodRetry > 1) {
          enhancedPrompt += '\n\nIMPORTANT: Previous attempts failed. Please respond with COMPLETE, valid JSON format only. No markdown, no extra text, just the complete JSON array. Ensure the JSON is not truncated.';
        }
        if (attempt.methodRetry > 2) {
          enhancedPrompt += '\n\nCRITICAL: This is the final method retry. You MUST return complete, valid JSON. Format: [{"query": "...", "researchGoal": "..."}]. Do not stop generation mid-way.';
        }
        if (attempt.totalAttempt > 3) {
          enhancedPrompt += '\n\nFINAL ATTEMPT: All previous models/attempts failed. Ensure JSON is properly formatted with no extra characters and is COMPLETELY generated.';
        }

        logger.debug('SERP query generation attempt', {
          modelName: attempt.modelName,
          methodRetry: attempt.methodRetry,
          totalAttempt: attempt.totalAttempt,
          systemPromptLength: systemPrompt.length,
          userPromptLength: enhancedPrompt.length
        });

        const { text, finishReason } = await generateText({
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
        
        // Token分析
        const tokenAnalysis = getTokenUsageAnalysis(
          attempt.modelName,
          null,
          null,
          systemPrompt + '\n\n' + enhancedPrompt
        );
        
        logger.logLLMCall('generateSERPQuery',
          { model: attempt.modelName, attempt: attempt.totalAttempt },
          { 
            promptLength: enhancedPrompt.length, 
            reportPlanLength: reportPlan.length,
            tokenAnalysis 
          },
          { 
            responseLength: text.length, 
            parsedContentLength: content.length,
            finishReason 
          },
          duration
        );

        // 使用强化的 JSON 解析器
        const parseResult = parseSerpQueryJson(content);
        
        if (!parseResult.success) {
          logger.warn('JSON parsing failed', {
            modelName: attempt.modelName,
            attempt: attempt.totalAttempt,
            finishReason,
            error: parseResult.error,
            contentLength: content.length,
            contentPreview: content.substring(0, 300),
            appliedFixes: parseResult.appliedFixes
          });
          throw new Error(`JSON parsing failed: ${parseResult.error}`);
        }

        const tasks: DeepResearchSearchTask[] = parseResult.data!.map(
          (item: { query: string; researchGoal?: string }) => ({
            query: item.query,
            researchGoal: item.researchGoal || "",
          })
        );

        logger.debug('SERP queries parsed successfully', {
          modelName: attempt.modelName,
          totalAttempts: attempt.totalAttempt,
          totalQueries: tasks.length,
          finishReason,
          parseResult: {
            success: parseResult.success,
            appliedFixes: parseResult.appliedFixes
          }
        });

        // 返回任务和finishReason供验证
        return { 
          tasks, 
          finishReason,
          rawContent: content,
          appliedFixes: parseResult.appliedFixes 
        };
      },
      {
        maxModelRetries: 3,
        maxMethodRetries: 3,
        retryDelay: 300
      }
    );

    if (!executionResult.success) {
      const errorMessage = StrictQualityValidator.generateUserErrorMessage(
        'SERP Query Generation',
        executionResult.attempts
      );
      
      logger.error('SERP query generation failed completely', executionResult.error, {
        totalAttempts: executionResult.attempts,
        allModelsAttempted: thinkingModels,
        userErrorMessage: errorMessage
      });
      
      throw new Error(errorMessage);
    }

    const { tasks } = executionResult.result!;
    
    // 分析查询的语言特征（保持原有逻辑）
    const bilingualQueries = tasks.filter(task => 
      /[\u4e00-\u9fff]/.test(task.query) && /[a-zA-Z]/.test(task.query)
    );
    const chineseOnlyQueries = tasks.filter(task => 
      /[\u4e00-\u9fff]/.test(task.query) && !/[a-zA-Z]/.test(task.query)
    );
    const englishOnlyQueries = tasks.filter(task => 
      !/[\u4e00-\u9fff]/.test(task.query) && /[a-zA-Z]/.test(task.query)
    );

    logger.info('Generated SERP queries (Corrected Enhanced)', {
      totalQueries: tasks.length,
      totalAttempts: executionResult.attempts,
      successfulModel: executionResult.successfulModel,
      bilingualQueries: bilingualQueries.length,
      chineseOnlyQueries: chineseOnlyQueries.length,
      englishOnlyQueries: englishOnlyQueries.length,
      optimizationRate: `${Math.round((bilingualQueries.length / tasks.length) * 100)}%`,
      queries: tasks.map((task, index) => ({
        index: index + 1,
        query: task.query,
        researchGoal: task.researchGoal.substring(0, 100) + (task.researchGoal.length > 100 ? '...' : ''),
        type: bilingualQueries.includes(task) ? 'bilingual' : 
              chineseOnlyQueries.includes(task) ? 'chinese' : 'english'
      }))
    });

    logger.logStep('generateSERPQuery', 'end', {
      taskCount: tasks.length,
      totalAttempts: executionResult.attempts,
      successfulModel: executionResult.successfulModel,
      executionTime: executionResult.executionTime,
      queries: tasks.map(t => t.query.substring(0, 50))
    });

    onMessage("progress", {
      step: "serp-query",
      status: "end",
      data: tasks,
    });
    
    return tasks;
  }

  /**
   * 修正版 writeFinalReport - 绝不容忍incomplete报告
   */
  static async writeFinalReport(
    reportPlan: string,
    tasks: DeepResearchSearchResult[],
    enableCitationImage: boolean,
    enableReferences: boolean,
    options: any,
    onMessage: (event: string, data: any) => void
  ): Promise<FinalReportResult> {
    const logger = Logger.getInstance('Corrected-writeFinalReport');
    
    logger.logStep('writeFinalReport', 'start', {
      taskCount: tasks.length,
      enableCitationImage,
      enableReferences
    });
    onMessage("progress", { step: "final-report", status: "start" });

    const learnings = tasks.map((item) => item.learning);
    const sources = unique(
      flat(tasks.map((item) => item.sources || [])),
      (item) => item.url
    );
    const images = unique(
      flat(tasks.map((item) => item.images || [])),
      (item) => item.url
    );

    const thinkingModels = Array.isArray(options.AIProvider.thinkingModel) 
      ? options.AIProvider.thinkingModel 
      : [options.AIProvider.thinkingModel];

    const context: MethodExecutionContext = {
      operation: 'writeFinalReport',
      models: thinkingModels,
      createModelInstance: async (modelName: string) => {
        return await MethodWithRotation.createModelInstance(
          modelName,
          options.AIProvider.provider,
          pick(options.AIProvider, ["baseURL", "apiKey"])
        );
      },
      validateResult: (result: { finalReport: string; finishReason?: string }) => {
        // 使用严格质量验证器
        const validation = StrictQualityValidator.validateFinalReport(
          result.finalReport, 
          result.finishReason
        );
        return {
          valid: validation.valid,
          error: validation.error
        };
      },
      additionalContext: {
        reportPlanLength: reportPlan.length,
        taskCount: tasks.length,
        learningsCount: learnings.length,
        sourcesCount: sources.length
      }
    };

    const executionResult = await MethodWithRotation.execute(
      context,
      async (model, attempt) => {
        const startTime = Date.now();
        const thinkTagStreamProcessor = new ThinkTagStreamProcessor();
        
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
          options.language ? `**Respond in ${options.language}**` : `**Respond in the same language as the user's language**`,
        ].join("\n\n");

        // 增强 prompt 以确保完整性
        let enhancedPrompt = finalPrompt;
        if (attempt.methodRetry > 1) {
          enhancedPrompt += `\n\nIMPORTANT: This is method retry ${attempt.methodRetry}/3 for model ${attempt.modelName}. Previous attempts failed quality checks. Please provide a comprehensive final report with at least 500 characters. Ensure COMPLETE generation - do NOT stop mid-sentence or mid-paragraph.`;
        }
        if (attempt.totalAttempt > 1) {
          enhancedPrompt += `\n\nCRITICAL: Previous attempts with other models failed. Generate the FULL, COMPLETE report. Do not truncate. Ensure the report reaches its natural conclusion.`;
        }

        logger.debug('Final report execution attempt', {
          modelName: attempt.modelName,
          methodRetry: attempt.methodRetry,
          totalAttempt: attempt.totalAttempt,
          systemPromptLength: systemPrompt.length,
          finalPromptLength: enhancedPrompt.length
        });

        const result = streamText({
          model,
          system: systemPrompt,
          prompt: enhancedPrompt,
        });

        let content = "";
        let reasoningContent = "";
        let finishReason: string | undefined;
        
        // 只在第一次尝试时发送开始标签
        if (attempt.totalAttempt === 1) {
          onMessage("message", { type: "text", text: "<final-report>\n" });
        }

        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            thinkTagStreamProcessor.processChunk(
              part.textDelta,
              (data) => {
                content += data;
                onMessage("message", { type: "text", text: data });
              },
              (data) => {
                reasoningContent += data;
                onMessage("reasoning", { type: "text", text: data });
              }
            );
          } else if (part.type === "reasoning") {
            reasoningContent += part.textDelta;
            onMessage("reasoning", { type: "text", text: part.textDelta });
          } else if (part.type === "finish") {
            finishReason = part.finishReason;
          }
        }

        const duration = Date.now() - startTime;
        
        // Token分析
        const tokenAnalysis = tokenMonitor.monitorAIRequest({
          modelName: attempt.modelName,
          operation: 'writeFinalReport',
          promptText: enhancedPrompt,
          responseText: content,
          finishReason
        });
        
        logger.logLLMCall('writeFinalReport',
          { 
            model: attempt.modelName, 
            attempt: attempt.totalAttempt,
            enableCitationImage,
            enableReferences
          },
          { 
            promptLength: enhancedPrompt.length, 
            learningsCount: learnings.length,
            sourcesCount: sources.length,
            imagesCount: images.length,
            tokenAnalysis 
          },
          { 
            contentLength: content.length, 
            reasoningLength: reasoningContent.length,
            finishReason
          },
          duration
        );

        // 添加引用（如果需要）
        if (sources.length > 0 && enableReferences && !(/\[([^\]]+)\]\(https?:\/\/[^\)]+\)/.test(content))) {
          const sourceContent =
            "\n\n---\n\n## References\n\n" +
            sources
              .map(
                (item, idx) =>
                  `${idx + 1}. [${item.title || 'Source'}](${item.url})`
              )
              .join("\n");
          content += sourceContent;
        }

        return {
          title: "Deep Research Analysis Report",
          finalReport: content.trim(),
          learnings,
          sources,
          images,
          finishReason,
          reasoningLength: reasoningContent.length
        };
      },
      {
        maxModelRetries: 3,
        maxMethodRetries: 3,
        retryDelay: 2000
      }
    );

    if (!executionResult.success) {
      const errorMessage = StrictQualityValidator.generateUserErrorMessage(
        'Final Report',
        executionResult.attempts
      );
      
      logger.error('Final report generation failed completely', executionResult.error, {
        totalAttempts: executionResult.attempts,
        allModelsAttempted: thinkingModels,
        userErrorMessage: errorMessage
      });
      
      throw new Error(errorMessage);
    }

    const result = executionResult.result!;
    
    logger.logStep('writeFinalReport', 'end', {
      contentLength: result.finalReport.length,
      totalAttempts: executionResult.attempts,
      successfulModel: executionResult.successfulModel,
      executionTime: executionResult.executionTime,
      learningsCount: result.learnings.length,
      sourcesCount: result.sources.length,
      imagesCount: result.images.length,
      success: true
    });

    onMessage("message", { type: "text", text: "\n</final-report>\n\n" });
    onMessage("progress", {
      step: "final-report",
      status: "end",
      data: result,
    });

    return result;
  }
}