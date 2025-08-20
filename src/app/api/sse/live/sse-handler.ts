/**
 * SSE Live Handler - Handles Server-Sent Events for live research tasks
 * Breaks down the large GET function into manageable components
 */

import { NextResponse, type NextRequest } from "next/server";
import DeepResearch from "@/utils/deep-research";
import { multiApiKeyPolling } from "@/utils/model";
import { getProviderModelFields } from "@/utils/provider-config";
import { splitTextByCompleteLines } from "@/utils/text";
import {
  optionalJwtAuthMiddleware,
  getAIProviderConfig,
  getSearchProviderConfig,
} from "../../utils";
import { logger } from "@/utils/logger";
import BackgroundTaskManager from "./background-task-manager";
import { FinalReportValidator } from './final-report-validator';


export class SSELiveHandler {
  private requestLogger: any;
  private taskManager!: BackgroundTaskManager;
  private requestId: string;
  private clientId: string;

  constructor(
    private req: NextRequest
  ) {
    this.requestLogger = logger.getInstance('SSE-Live');
    this.requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async initialize(): Promise<void> {
    this.taskManager = await BackgroundTaskManager.getInstance();
  }

  async handleRequest(): Promise<NextResponse> {
    this.logRequestStart();
    
    // 确保任务管理器已初始化
    await this.initialize();
    
    // Authentication
    const authResult = await this.authenticate();
    if (!authResult.valid) {
      return this.createErrorResponse(authResult.error || 'Authentication failed', 401);
    }

    // Configuration
    const config = this.buildConfiguration(authResult);
    if (!config) {
      return this.createErrorResponse('Configuration error', 500);
    }

    // Task management with intelligent retry logic
    const taskId = this.generateTaskId(config);
    const existingTask = this.taskManager.getTask(taskId);

    // Use async validation for better database access
    const validationResult = await this.taskManager.getTaskValidationResultAsync(taskId, config.forceRestart);
    
    if (existingTask && validationResult === 'invalid') {
      // Task exists but is invalid (failed or has invalid finishReason)
      this.requestLogger.info("Found invalid task, archiving and restarting", { 
        taskId,
        taskStatus: existingTask.status,
        validationResult,
        forceRestart: config.forceRestart,
        reason: config.forceRestart ? "Force restart requested" : "Task is invalid or failed - needs restart" 
      });
      
      // Archive the invalid task for debugging
      await this.taskManager.archiveInvalidTask(taskId, config.forceRestart ? "Force restart requested" : "Invalid task state - restarting");
    } else if (existingTask && validationResult === 'running') {
      // Task is currently running, let it continue
      this.requestLogger.info("Found running task, connecting to existing stream", { 
        taskId,
        taskStatus: existingTask.status,
        validationResult,
        reason: "Task is currently running" 
      });
    }

    // Get task status after potential archiving
    const finalExistingTask = this.taskManager.getTask(taskId);

    // Create SSE stream
    const stream = this.createSSEStream(taskId, finalExistingTask, config);
    
    return this.createSSEResponse(stream, config);
  }

  private logRequestStart(): void {
    this.requestLogger.info('New request', {
      requestId: this.requestId,
      clientId: this.clientId,
      url: this.req.url,
      searchParams: Object.fromEntries(this.req.nextUrl.searchParams.entries())
    });
  }

  private async authenticate() {
    return await optionalJwtAuthMiddleware(this.req);
  }

  private createErrorResponse(message: string, code: number): NextResponse {
    return NextResponse.json(
      { error: message, code },
      { status: code }
    );
  }

  private buildConfiguration(authResult: any) {
    try {
      const getValueFromSearchParams = (key: string) => {
        return this.req.nextUrl.searchParams.get(key);
      };

      const allSearchParams = Object.fromEntries(this.req.nextUrl.searchParams.entries());
      
      // Basic parameters
      const query = getValueFromSearchParams("query") || "";
      const language = getValueFromSearchParams("language") || "zh-CN";
      const maxResult = Number(getValueFromSearchParams("maxResult")) || 50;
      const enableCitationImage = getValueFromSearchParams("enableCitationImage") !== "false";
      const enableReferences = getValueFromSearchParams("enableReferences") !== "false";
      
      // Task control parameters
      const forceRestart = getValueFromSearchParams("forceRestart") === "true" || getValueFromSearchParams("restart") === "true";

      // AI and Search provider configuration
      const aiConfig = getAIProviderConfig(authResult.config || {}, this.req);
      const searchConfig = getSearchProviderConfig(authResult.config || {}, this.req);

      // Security checks
      if (!aiConfig.provider || aiConfig.provider.trim() === '') {
        this.requestLogger.error('AI provider is empty, this should not happen');
        return null;
      }

      if (!searchConfig.searchProvider || searchConfig.searchProvider.trim() === '') {
        this.requestLogger.error('Search provider is empty, this should not happen');
        return null;
      }

      // Model configuration - Support comma-separated model arrays for fallback/retry
      const config = authResult.config || {};
      const modelConfig = getProviderModelFields(aiConfig.provider, config);
      
      // Parse comma-separated models into arrays for intelligent fallback
      const parseModelString = (modelStr: string | null): string[] => {
        if (!modelStr || modelStr.trim() === '') return [];
        return modelStr.split(',').map(model => model.trim()).filter(model => model.length > 0);
      };
      
      // Merge URL params with JWT config: URL params get priority, JWT config becomes fallback
      const mergeModelArrays = (urlParam: string | null, jwtConfig: string): string[] => {
        const urlModels = parseModelString(urlParam);
        const jwtModels = parseModelString(jwtConfig);
        
        // Use Set for efficient deduplication while maintaining order
        const seen = new Set<string>();
        const combined: string[] = [];
        
        // Add URL models first (highest priority)
        urlModels.forEach(model => {
          if (!seen.has(model)) {
            seen.add(model);
            combined.push(model);
          }
        });
        
        // Add JWT models as fallbacks (deduplicated)  
        jwtModels.forEach(model => {
          if (!seen.has(model)) {
            seen.add(model);
            combined.push(model);
          }
        });
        
        return combined.length > 0 ? combined : ['gpt-4o'];
      };
      
      const thinkingModel = mergeModelArrays(
        getValueFromSearchParams("thinkingModel"), 
        modelConfig.thinkingModel || ''
      );
      const taskModel = mergeModelArrays(
        getValueFromSearchParams("taskModel"), 
        modelConfig.networkingModel || ''
      );

      this.requestLogger.info('Configuration', {
        aiProvider: aiConfig.provider,
        searchProvider: searchConfig.searchProvider,
        modelMerging: {
          urlThinkingModel: getValueFromSearchParams("thinkingModel"),
          urlTaskModel: getValueFromSearchParams("taskModel"),
          jwtThinkingModel: modelConfig.thinkingModel,
          jwtTaskModel: modelConfig.networkingModel,
          mergedThinkingModel: `[${thinkingModel.join(', ')}]`,
          mergedTaskModel: `[${taskModel.join(', ')}]`,
          thinkingModelCount: thinkingModel.length,
          taskModelCount: taskModel.length
        },
        thinkingModels: thinkingModel,
        taskModels: taskModel,
        originalModelConfig: modelConfig
      });

      return {
        allSearchParams,
        query,
        language,
        maxResult,
        enableCitationImage,
        enableReferences,
        forceRestart,
        aiConfig,
        searchConfig,
        thinkingModel,
        taskModel,
        config
      };
    } catch (error) {
      this.requestLogger.error('Configuration build failed', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  private generateTaskId(config: any): string {
    const taskParams = {
      ...config.allSearchParams,
      aiProvider: config.aiConfig.provider,
      thinkingModel: Array.isArray(config.thinkingModel) ? config.thinkingModel.join(',') : config.thinkingModel,
      taskModel: Array.isArray(config.taskModel) ? config.taskModel.join(',') : config.taskModel,
      searchProvider: config.searchConfig.searchProvider,
      query: config.query,
      language: config.language,
      maxResult: config.maxResult,
      enableCitationImage: config.enableCitationImage,
      enableReferences: config.enableReferences
    };

    const taskId = this.taskManager.generateTaskId(taskParams);
    
    this.requestLogger.info('Generated task ID', {
      taskId,
      includedParams: Object.keys(taskParams)
    });

    return taskId;
  }

  private createSSEStream(taskId: string, existingTask: any, config: any): ReadableStream {
    const encoder = new TextEncoder();
    
    return new ReadableStream({
      start: async (controller) => {
        const streamHandler = new SSEStreamHandler(
          controller,
          encoder,
          this.req,
          this.taskManager,
          this.requestLogger,
          this.requestId,
          this.clientId,
          taskId,
          existingTask,
          config
        );

        await streamHandler.handleStream();
      }
    });
  }

  private createSSEResponse(stream: ReadableStream, config: any): NextResponse {
    const taskId = this.generateTaskId(config);
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*",
        "X-Model-Name": `${config.aiConfig.provider} (T:[${config.thinkingModel.join(',')}], Task:[${config.taskModel.join(',')}])`,
        "X-Search-Provider": config.searchConfig.searchProvider || "Not configured",
        "X-Request-ID": this.requestId,
        "X-Task-ID": taskId,
      }
    });
  }
}

class SSEStreamHandler {
  private isClientConnected: boolean = true;

  constructor(
    private controller: ReadableStreamDefaultController,
    private encoder: TextEncoder,
    private req: NextRequest,
    private taskManager: BackgroundTaskManager,
    private requestLogger: any,
    private requestId: string,
    private clientId: string,
    private taskId: string,
    private existingTask: any,
    private config: any
  ) {
    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers(): void {
    this.req.signal.addEventListener("abort", () => {
      this.requestLogger.info("Client disconnected", { 
        taskId: this.taskId, 
        clientId: this.clientId 
      });
      this.isClientConnected = false;
      this.taskManager.unregisterClient(this.taskId);
    });
  }

  async handleStream(): Promise<void> {
    this.taskManager.registerClient(this.taskId);
    
    this.requestLogger.info("Client connected", { 
      taskId: this.taskId, 
      clientId: this.clientId,
      existingTaskStatus: this.existingTask?.status,
      isTaskRunning: this.taskManager.isTaskRunning(this.taskId),
      clientCount: this.taskManager.getClientCount(this.taskId)
    });

    // Handle completed tasks
    if (this.existingTask?.status === 'completed') {
      await this.handleCompletedTask();
      return;
    }

    // Handle running/paused tasks
    if (this.existingTask?.status === 'running' || this.existingTask?.status === 'paused') {
      await this.handleExistingTask();
      return;
    }

    // Handle new tasks
    await this.handleNewTask();
  }

  private async handleCompletedTask(): Promise<void> {
    this.requestLogger.info("Found completed task, validating cache quality", { taskId: this.taskId });
    
    // 验证缓存的final-report完整性
    const validationResult = FinalReportValidator.validateTaskCache(this.existingTask);
    
    if (validationResult.isValid) {
      this.requestLogger.info("Cache validation passed, returning cached result", { 
        taskId: this.taskId,
        validation: FinalReportValidator.getValidationMessage(validationResult)
      });
      
      const outputs = this.taskManager.getTaskOutput(this.taskId);
      await this.streamOutputs(outputs);
      this.controller.close();
    } else {
      this.requestLogger.warn("Cache validation failed, restarting task", { 
        taskId: this.taskId,
        reason: validationResult.reason,
        validation: FinalReportValidator.getValidationMessage(validationResult)
      });
      
      // 归档无效缓存任务
      await this.taskManager.archiveInvalidTask(this.taskId, `Invalid final-report cache: ${validationResult.reason}`);
      
      // 重新开始执行任务
      await this.handleNewTask();
    }
  }

  private async handleExistingTask(): Promise<void> {
    this.requestLogger.info("Connecting to existing task", { 
      taskId: this.taskId, 
      clientId: this.clientId,
      status: this.existingTask.status,
      isRunning: this.taskManager.isTaskRunning(this.taskId),
      clientCount: this.taskManager.getClientCount(this.taskId)
    });

    // Replay existing outputs
    const existingOutputs = this.taskManager.getTaskOutput(this.taskId);
    await this.streamOutputs(existingOutputs);

    // Monitor for new output
    await this.monitorNewOutput(existingOutputs.length);
  }

  private async handleNewTask(): Promise<void> {
    this.requestLogger.info("Starting new background task", { taskId: this.taskId });

    const deepResearch = this.createDeepResearchInstance();
    
    // Start background task
    this.taskManager.startBackgroundTask(
      this.taskId,
      deepResearch,
      this.config.query,
      this.config.enableCitationImage,
      this.config.enableReferences,
      this.generateTaskParams()
    );

    // Monitor output
    await this.monitorNewOutput(0);
  }

  private async streamOutputs(outputs: string[]): Promise<void> {
    for (const output of outputs) {
      if (!this.isClientConnected) break;
      
      const lineChunks = splitTextByCompleteLines(output);
      for (const chunk of lineChunks) {
        if (!this.isClientConnected) break;
        this.controller.enqueue(this.encoder.encode(chunk));
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
  }

  private async monitorNewOutput(startIndex: number): Promise<void> {
    let outputIndex = startIndex;
    
    while (this.isClientConnected) {
      const currentTask = this.taskManager.getTask(this.taskId);
      if (!currentTask) break;

      const currentOutputs = this.taskManager.getTaskOutput(this.taskId);
      
      // Stream new outputs
      for (let i = outputIndex; i < currentOutputs.length; i++) {
        if (!this.isClientConnected) break;
        
        const lineChunks = splitTextByCompleteLines(currentOutputs[i]);
        for (const chunk of lineChunks) {
          if (!this.isClientConnected) break;
          this.controller.enqueue(this.encoder.encode(chunk));
          await new Promise(resolve => setTimeout(resolve, 30));
        }
        outputIndex++;
      }

      // Check if task is complete
      if (currentTask.status === 'completed' || currentTask.status === 'failed') {
        this.controller.close();
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  private createDeepResearchInstance(): DeepResearch {
    const processedApiKey = multiApiKeyPolling(this.config.aiConfig.apiKey);
    
    this.requestLogger.debug('Search configuration processed', {
      hasApiKey: !!this.config.searchConfig.apiKey,
      searchKeyCount: this.config.searchConfig.apiKey ? this.config.searchConfig.apiKey.split(',').length : 0,
      searchProvider: this.config.searchConfig.searchProvider
    });

    return new DeepResearch({
      language: this.config.language,
      AIProvider: {
        baseURL: this.config.aiConfig.apiProxy,
        apiKey: processedApiKey,
        provider: this.config.aiConfig.provider,
        thinkingModel: this.config.thinkingModel, // Now it's an array
        taskModel: this.config.taskModel, // Now it's an array
      },
      searchProvider: {
        baseURL: this.config.searchConfig.apiProxy,
        apiKey: this.config.searchConfig.apiKey,
        provider: this.config.searchConfig.searchProvider,
        maxResult: this.config.maxResult,
      },
      onMessage: (event, data) => {
        if (event === "message" && this.isClientConnected) {
          this.controller.enqueue(this.encoder.encode(data.text));
        } else if (event === "progress") {
          this.requestLogger.debug(
            `[${data.step}]: ${data.name ? `"${data.name}" ` : ""}${data.status}`
          );
          if (data.step === "final-report" && data.status === "end") {
            this.controller.close();
          }
        } else if (event === "error") {
          console.error(data);
          if (this.isClientConnected) {
            this.controller.close();
          }
        }
      },
    });
  }

  private generateTaskParams(): any {
    return {
      ...this.config.allSearchParams,
      aiProvider: this.config.aiConfig.provider,
      thinkingModel: Array.isArray(this.config.thinkingModel) ? this.config.thinkingModel.join(',') : this.config.thinkingModel,
      taskModel: Array.isArray(this.config.taskModel) ? this.config.taskModel.join(',') : this.config.taskModel,
      searchProvider: this.config.searchConfig.searchProvider,
      query: this.config.query,
      language: this.config.language,
      maxResult: this.config.maxResult,
      enableCitationImage: this.config.enableCitationImage,
      enableReferences: this.config.enableReferences
    };
  }
}