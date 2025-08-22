/**
 * SSE Live Handler - Handles Server-Sent Events for live research tasks
 * Breaks down the large GET function into manageable components
 */

import { NextResponse, type NextRequest } from "next/server";
import DeepResearch from "@/utils/deep-research";
import { multiApiKeyPolling } from "@/utils/model";
import { getProviderModelFields } from "@/utils/provider-config";
import {
  optionalJwtAuthMiddleware,
  getAIProviderConfig,
  getSearchProviderConfig,
} from "../../utils";
import { logger } from "@/utils/logger";
import BackgroundTaskManager from "./background-task-manager";


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

  private async initializeTaskManager() {
    if (!this.taskManager) {
      this.taskManager = await BackgroundTaskManager.getInstance();
    }
  }

  async handleRequest(): Promise<NextResponse> {
    this.logRequestStart();
    
    // Initialize task manager
    await this.initializeTaskManager();
    
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

    // 恢复原始的缓存逻辑
    const taskId = this.generateTaskId(config);
    
    // 添加调试信息
    this.requestLogger.info("🔍 开始缓存检查", { 
      taskId: taskId.substring(0, 16) + '...', 
      forceRestart: config.forceRestart,
      taskManagerInitialized: !!this.taskManager
    });
    
    // 调试：显示TaskManager实例信息
    console.log(`🏭 TaskManager instance info:`, {
      instanceExists: !!this.taskManager,
      isInitialized: this.taskManager?.isInitialized,
      totalTasksInMemory: this.taskManager?.getMemoryTaskCount?.() || 0,
      runningTasks: this.taskManager?.getRunningTaskCount?.() || 0
    });
    
    // 显示所有内存中的任务
    this.taskManager?.debugShowAllTasks?.();
    
    const existingTask = await this.taskManager.getTask(taskId);
    this.requestLogger.info("📋 现有任务检查", { 
      taskId: taskId.substring(0, 16) + '...', 
      existingTask: !!existingTask,
      taskStatus: existingTask?.status,
      taskMessages: existingTask?.messages?.length
    });
    
    if (!config.forceRestart) {
      const validationResult = await this.taskManager.getTaskValidationResult(taskId, config.forceRestart);
      this.requestLogger.info("✅ 缓存验证结果", { 
        taskId: taskId.substring(0, 16) + '...', 
        validationResult,
        existingTask: !!existingTask
      });
      
      if (existingTask && (validationResult === 'valid' || validationResult === 'running')) {
        if (validationResult === 'valid') {
          this.requestLogger.info("🎯 Cache hit - returning cached result", { 
            taskId: taskId.substring(0, 16) + '...', 
            validationResult,
            taskStatus: existingTask.status 
          });
          
          const outputs = await this.taskManager.getTaskOutput(taskId);
          this.requestLogger.info("📤 获取缓存输出", { 
            taskId: taskId.substring(0, 16) + '...', 
            outputCount: outputs.length
          });
          const cacheStream = this.createCacheStream(outputs);
          return this.createSSEResponse(cacheStream, config);
        } else if (validationResult === 'running') {
          this.requestLogger.info("🔄 Found running task - connecting to live stream", { 
            taskId: taskId.substring(0, 16) + '...', 
            taskStatus: existingTask.status,
            currentStep: existingTask.step
          });
          
          // 创建运行中任务的实时流
          const liveStream = this.createRunningTaskStream(taskId);
          return this.createSSEResponse(liveStream, config);
        }
      }
      
      if (existingTask && validationResult === 'invalid') {
        this.requestLogger.info("⚠️ Found invalid task, will restart", { 
          taskId: taskId.substring(0, 16) + '...',
          taskStatus: existingTask.status,
          validationResult
        });
      }
      
      if (!existingTask) {
        this.requestLogger.info("🆕 任务不存在，创建新任务", { 
          taskId: taskId.substring(0, 16) + '...'
        });
      }
    } else {
      this.requestLogger.info("🔄 强制重启，跳过缓存", { 
        taskId: taskId.substring(0, 16) + '...'
      });
    }

    // 执行新任务（使用后台任务分离）
    const stream = this.createBackgroundTaskStream(taskId, config);
    
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

  /**
   * 创建后台任务流（使用BackgroundTaskManager的分离机制）
   */
  private createBackgroundTaskStream(taskId: string, config: any): ReadableStream {
    const encoder = new TextEncoder();
    
    return new ReadableStream({
      start: async (controller) => {
        try {
          // 构建任务请求参数
          const taskParams = {
            query: config.query,
            language: config.language,
            aiProvider: config.aiConfig.provider,
            thinkingModel: Array.isArray(config.thinkingModel) ? config.thinkingModel.join(',') : config.thinkingModel,
            taskModel: Array.isArray(config.taskModel) ? config.taskModel.join(',') : config.taskModel,
            searchProvider: config.searchConfig.searchProvider,
            maxResult: config.maxResult,
            enableCitationImage: config.enableCitationImage,
            enableReferences: config.enableReferences,
            userId: config.allSearchParams.userId,
            userMessageId: config.allSearchParams.userMessageId,
            topicId: config.allSearchParams.topicId,
            mode: config.allSearchParams.mode,
            dataBaseUrl: config.allSearchParams.dataBaseUrl
          };

          // 创建DeepResearch实例
          const deepResearch = new DeepResearch({
            language: config.language,
            AIProvider: {
              baseURL: config.aiConfig.apiProxy,
              apiKey: multiApiKeyPolling(config.aiConfig.apiKey),
              provider: config.aiConfig.provider,
              thinkingModel: config.thinkingModel,
              taskModel: config.taskModel,
            },
            searchProvider: {
              baseURL: config.searchConfig.apiProxy,
              apiKey: config.searchConfig.apiKey,
              provider: config.searchConfig.searchProvider,
              maxResult: config.maxResult,
            }
          });

          // 定义外部回调，用于实时流式传输
          let controllerClosed = false;
          const externalOnMessage = (event: string, data: any) => {
            if (controllerClosed) {
              // 控制器已关闭，忽略后续消息
              return;
            }
            
            if (event === "message") {
              // 实时传输消息到客户端
              try {
                controller.enqueue(encoder.encode(data.text));
              } catch (error) {
                if (error instanceof Error && error.message.includes('Controller is already closed')) {
                  controllerClosed = true;
                  this.requestLogger.debug('Controller already closed, ignoring message');
                } else {
                  throw error;
                }
              }
            } else if (event === "progress") {
              this.requestLogger.debug(`[${data.step}]: ${data.status}`);
              if (data.step === "final-report" && data.status === "end") {
                // 任务完成，关闭SSE流
                this.requestLogger.info("💾 后台任务完成，关闭客户端流", { 
                  taskId: taskId.substring(0, 16) + '...'
                });
                if (!controllerClosed) {
                  controller.close();
                  controllerClosed = true;
                }
              }
            } else if (event === "error") {
              this.requestLogger.error('Background task failed', data);
              if (!controllerClosed) {
                controller.close();
                controllerClosed = true;
              }
            }
          };

          // 启动后台任务（独立执行，客户端断开不影响）
          await this.taskManager.startBackgroundTask(
            taskId, 
            deepResearch, 
            config.query,
            config.enableCitationImage,
            config.enableReferences,
            taskParams,
            externalOnMessage  // 提供实时回调
          );

        } catch (error) {
          this.requestLogger.error('Background task startup failed', error instanceof Error ? error : new Error(String(error)));
          controller.close();
        }
      }
    });
  }


  /**
   * 创建运行中任务的实时流
   */
  private createRunningTaskStream(taskId: string): ReadableStream {
    const encoder = new TextEncoder();
    
    return new ReadableStream({
      start: async (controller) => {
        try {
          // 首先发送已有的输出
          const existingOutputs = await this.taskManager.getTaskOutput(taskId);
          for (const output of existingOutputs) {
            controller.enqueue(encoder.encode(output));
          }
          
          // 然后注册实时输出监听器
          const unsubscribe = this.taskManager.subscribeToTask(taskId, (event: string, data: any) => {
            try {
              if (event === "message" && data.text) {
                controller.enqueue(encoder.encode(data.text));
              } else if (event === "progress" && data.step === "final-report" && data.status === "end") {
                // 任务完成，关闭流
                controller.close();
                if (unsubscribe) unsubscribe();
              }
            } catch (error) {
              console.error('Error in running task stream:', error);
              controller.close();
              if (unsubscribe) unsubscribe();
            }
          });
          
          // 检查任务是否已经完成（防止竞争条件）
          const currentTask = await this.taskManager.getTask(taskId);
          if (!currentTask || currentTask.status === 'completed' || currentTask.status === 'failed') {
            controller.close();
            if (unsubscribe) unsubscribe();
          }
          
        } catch (error) {
          this.requestLogger.error('Error creating running task stream', error instanceof Error ? error : new Error(String(error)));
          controller.close();
        }
      }
    });
  }

  /**
   * 创建缓存流式输出
   */
  private createCacheStream(outputs: string[]): ReadableStream {
    const encoder = new TextEncoder();
    let outputIndex = 0;
    
    return new ReadableStream({
      start(controller) {
        const streamOutputs = () => {
          if (outputIndex < outputs.length) {
            const output = outputs[outputIndex++];
            controller.enqueue(encoder.encode(output));
            
            // 缓存返回应该更快一些
            setTimeout(streamOutputs, 10);
          } else {
            controller.close();
          }
        };
        
        // 立即开始输出
        streamOutputs();
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
