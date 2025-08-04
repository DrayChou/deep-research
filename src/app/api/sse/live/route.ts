/* eslint-disable @typescript-eslint/no-require-imports */
import { NextResponse, type NextRequest } from "next/server";
import DeepResearch from "@/utils/deep-research";
import { multiApiKeyPolling } from "@/utils/model";
import { getProviderModelFields, hasValidApiKey, hasValidSearchApiKey } from "@/utils/provider-config";
import {
  optionalJwtAuthMiddleware,
  getAIProviderConfig,
  getSearchProviderConfig,
} from "../../utils";
import { logger } from "@/utils/logger";
import * as path from "node:path";
import TaskDatabase from "./task-database";

// 创建SSE API专用的日志实例
const sseLogger = logger.getInstance('SSE-Live');

// 后台任务系统
interface TaskProgress {
  step: string;
  percentage: number;
  status: 'running' | 'paused' | 'completed' | 'failed';
  messages: string[];
  result?: any;
  error?: string;
  timestamp: string;
}

class BackgroundTaskManager {
  private static instance: BackgroundTaskManager;
  private tasks: Map<string, TaskProgress> = new Map();
  private runningTasks: Map<string, Promise<any>> = new Map();
  private taskOutputs: Map<string, string[]> = new Map();
  private taskParams: Map<string, any> = new Map(); // 存储任务的请求参数
  private storageDir: string;
  private db!: TaskDatabase; // 在initializeDatabaseSync()中初始化
  // 简化客户端连接跟踪 - 仅用于日志记录
  private clientConnections: Map<string, number> = new Map(); // taskId -> client count

  private constructor() {
    this.storageDir = path.join(process.cwd(), 'data', 'tasks');
    // 同步初始化数据库 - 如果失败则抛出错误阻止实例创建
    this.initializeDatabaseSync();
    // 立即加载任务，确保在构造函数完成前完成初始化
    this.loadTasksFromDatabase();
  }

  private initializeDatabaseSync(): void {
    try {
      console.log('Initializing BackgroundTaskManager database...');
      this.db = new TaskDatabase(this.storageDir);
      console.log('✓ BackgroundTaskManager database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize BackgroundTaskManager database:', error);
      sseLogger.error('Database initialization failed, application cannot start without database', error instanceof Error ? error : new Error(String(error)));
      throw error; // 重新抛出错误，阻止BackgroundTaskManager实例创建
    }
  }

  static getInstance(): BackgroundTaskManager {
    if (!BackgroundTaskManager.instance) {
      try {
        console.log('Creating BackgroundTaskManager singleton instance...');
        BackgroundTaskManager.instance = new BackgroundTaskManager();
        console.log('✓ BackgroundTaskManager singleton created successfully');
      } catch (error) {
        console.error('Failed to create BackgroundTaskManager singleton:', error);
        throw error;
      }
    }
    return BackgroundTaskManager.instance;
  }

  // 从数据库加载任务
  private loadTasksFromDatabase(): void {
    try {
      if (!this.db) {
        console.log('Database not available, skipping task loading');
        return;
      }
      
      const allTasks = this.db.getAllTasks();
      for (const task of allTasks) {
        this.tasks.set(task.taskId, task.progress);
        this.taskOutputs.set(task.taskId, task.outputs);
        this.taskParams.set(task.taskId, task.requestParams); // 加载请求参数
        
        // 如果任务状态是running，将其标记为paused（因为服务器重启了）
        if (task.progress.status === 'running') {
          this.updateTaskProgress(task.taskId, { status: 'paused' });
        }
      }
      console.log(`Loaded ${this.tasks.size} tasks from database`);
    } catch (error) {
      console.error('Failed to load tasks from database:', error);
      // 如果加载任务失败，重新抛出错误阻止实例创建
      throw error;
    }
  }

  // 保存任务到数据库
  private saveTaskToDatabase(taskId: string): void {
    try {
      if (!this.db) {
        throw new Error('Database not available');
      }
      
      const task = this.tasks.get(taskId);
      const outputs = this.taskOutputs.get(taskId) || [];
      const requestParams = this.taskParams.get(taskId);
      
      if (task && requestParams) {
        this.db.saveTask(taskId, task, outputs, requestParams);
      }
    } catch (error) {
      console.error(`Failed to save task ${taskId} to database:`, error);
      throw error; // 重新抛出错误
    }
  }

  // 生成任务ID - 包含所有相关参数，使用强哈希算法
  generateTaskId(allParams: Record<string, any>): string {
    // 提取所有影响任务结果的参数
    const fingerprint = {
      // 基础查询参数
      query: (allParams.query || '').trim().toLowerCase(),
      language: allParams.language || 'zh-CN',
      maxResult: Number(allParams.maxResult) || 50,
      enableCitationImage: allParams.enableCitationImage !== 'false',
      enableReferences: allParams.enableReferences !== 'false',
      
      // AI配置
      aiProvider: allParams.aiProvider,
      thinkingModel: allParams.thinkingModel,
      taskModel: allParams.taskModel,
      
      // 搜索配置
      searchProvider: allParams.searchProvider,
      
      // 用户相关参数
      userId: allParams.userId,
      userMessageId: allParams.userMessageId,
      topicId: allParams.topicId,
      
      // 其他可能影响结果的参数
      mode: allParams.mode,
      dataBaseUrl: allParams.dataBaseUrl,
      
      // 时间戳用于区分不同时间的相同请求（可选）
      // timestamp: Math.floor(Date.now() / (1000 * 60 * 5)) // 5分钟粒度
    };
    
    // 使用crypto模块生成强哈希
    const crypto = require('node:crypto');
    const str = JSON.stringify(fingerprint, Object.keys(fingerprint).sort());
    const hash = crypto.createHash('sha256').update(str, 'utf8').digest('hex');
    
    // 返回32位十六进制字符串（避免重复）
    return hash.substring(0, 32);
  }

  // 获取任务状态
  getTask(taskId: string): TaskProgress | null {
    return this.tasks.get(taskId) || null;
  }

  // 获取任务的所有输出
  getTaskOutput(taskId: string): string[] {
    return this.taskOutputs.get(taskId) || [];
  }

  // 设置任务参数
  setTaskParams(taskId: string, params: any): void {
    this.taskParams.set(taskId, params);
  }

  // 添加任务输出并保存到数据库
  private addTaskOutput(taskId: string, output: string): void {
    const outputs = this.taskOutputs.get(taskId) || [];
    outputs.push(output);
    this.taskOutputs.set(taskId, outputs);
    
    // 同步保存到数据库
    this.saveTaskToDatabase(taskId);
  }

  // 启动后台任务
  async startBackgroundTask(
    taskId: string,
    deepResearchInstance: any,
    query: string,
    enableCitationImage: boolean,
    enableReferences: boolean,
    requestParams: any
  ): Promise<void> {
    // 如果任务已存在且正在运行，直接返回
    if (this.runningTasks.has(taskId)) {
      return;
    }

    // 保存任务参数
    this.taskParams.set(taskId, requestParams);

    // 初始化任务进度
    this.tasks.set(taskId, {
      step: 'initializing',
      percentage: 0,
      status: 'running',
      messages: [],
      timestamp: new Date().toISOString()
    });

    this.taskOutputs.set(taskId, []);

    // 包装onMessage以收集输出
    
    deepResearchInstance.onMessage = (event: string, data: any) => {
      if (event === "message") {
        this.addTaskOutput(taskId, data.text);
        this.updateTaskProgress(taskId, {
          messages: [data.text]
        });
      } else if (event === "progress") {
        const percentage = this.calculateProgress(data.step, data.status);
        this.updateTaskProgress(taskId, {
          step: data.step,
          percentage,
          status: 'running'
        });
      } else if (event === "error") {
        this.updateTaskProgress(taskId, {
          status: 'failed',
          error: data.message || 'Unknown error'
        });
      }
    };

    // 启动后台任务
    const taskPromise = deepResearchInstance.start(query, enableCitationImage, enableReferences)
      .then((result: any) => {
        this.updateTaskProgress(taskId, {
          status: 'completed',
          percentage: 100,
          result,
          timestamp: new Date().toISOString()
        });
        this.runningTasks.delete(taskId);
        sseLogger.info('Background task completed', { taskId });
      })
      .catch((error: any) => {
        this.updateTaskProgress(taskId, {
          status: 'failed',
          error: error.message || 'Unknown error',
          timestamp: new Date().toISOString()
        });
        this.runningTasks.delete(taskId);
        sseLogger.error('Background task failed', error, { taskId });
      });

    this.runningTasks.set(taskId, taskPromise);
    sseLogger.info('Background task started', { taskId });
  }

  // 更新任务进度并保存到数据库
  private updateTaskProgress(taskId: string, updates: Partial<TaskProgress>): void {
    const current = this.tasks.get(taskId);
    if (current) {
      const updated = {
        ...current,
        ...updates,
        timestamp: new Date().toISOString()
      };
      this.tasks.set(taskId, updated);
      
      // 同步保存到数据库
      this.saveTaskToDatabase(taskId);
    }
  }

  // 计算进度百分比
  private calculateProgress(step: string, status: string): number {
    const steps = ['report-plan', 'serp-query', 'search', 'final-report'];
    const stepIndex = steps.indexOf(step);
    if (stepIndex === -1) return 0;
    
    let percentage = (stepIndex / steps.length) * 100;
    if (status === 'end') {
      percentage += (100 / steps.length);
    }
    
    return Math.min(percentage, 100);
  }

  // 检查任务是否正在运行
  isTaskRunning(taskId: string): boolean {
    return this.runningTasks.has(taskId);
  }

  // 注册客户端连接
  registerClient(taskId: string): void {
    const count = this.clientConnections.get(taskId) || 0;
    this.clientConnections.set(taskId, count + 1);
  }

  // 注销客户端连接
  unregisterClient(taskId: string): void {
    const count = this.clientConnections.get(taskId) || 0;
    if (count > 1) {
      this.clientConnections.set(taskId, count - 1);
    } else {
      this.clientConnections.delete(taskId);
    }
  }

  // 获取任务的客户端数量
  getClientCount(taskId: string): number {
    return this.clientConnections.get(taskId) || 0;
  }

  // 清理完成的任务（废弃 - 用户要求保留所有任务以支持断线重连）
  // cleanupTask 已被移除，任务会持久保存以支持用户随时重连
}

// export const runtime = "edge"; // 禁用Edge Runtime以支持文件系统操作
export const dynamic = "force-dynamic";
export const preferredRegion = [
  "cle1",
  "iad1",
  "pdx1",
  "sfo1",
  "sin1",
  "syd1",
  "hnd1",
  "kix1",
];

export async function GET(req: NextRequest) {
  const requestLogger = logger.getInstance('SSE-Live');
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  requestLogger.info('New request', {
    requestId,
    clientId,
    url: req.url,
    searchParams: Object.fromEntries(req.nextUrl.searchParams.entries())
  });
  
  // 可选JWT验证和配置获取
  const authResult = await optionalJwtAuthMiddleware(req);
  if (!authResult.valid) {
    return NextResponse.json(
      { error: authResult.error || 'Authentication failed', code: 401 },
      { status: 401 }
    );
  }

  function getValueFromSearchParams(key: string) {
    return req.nextUrl.searchParams.get(key);
  }

  // 获取所有URL参数，用于生成任务ID
  const allSearchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  
  // 从URL参数获取基础参数  
  const query = getValueFromSearchParams("query") || "";
  const language = getValueFromSearchParams("language") || "zh-CN";
  const maxResult = Number(getValueFromSearchParams("maxResult")) || 50;
  const enableCitationImage = getValueFromSearchParams("enableCitationImage") !== "false";
  const enableReferences = getValueFromSearchParams("enableReferences") !== "false";

  // 获取AI和搜索提供商配置，其中包含了provider信息
  const aiConfig = getAIProviderConfig(authResult.config || {}, req);
  const searchConfig = getSearchProviderConfig(authResult.config || {}, req);
  
  // 额外的安全检查，确保provider不为空
  if (!aiConfig.provider || aiConfig.provider.trim() === '') {
    sseLogger.error('AI provider is empty, this should not happen');
    return NextResponse.json(
      { error: 'AI provider configuration is missing', code: 500 },
      { status: 500 }
    );
  }
  
  if (!searchConfig.searchProvider || searchConfig.searchProvider.trim() === '') {
    sseLogger.error('Search provider is empty, this should not happen');
    return NextResponse.json(
      { error: 'Search provider configuration is missing', code: 500 },
      { status: 500 }
    );
  }

  // 根据 provider 从配置中获取对应的模型
  const config = authResult.config || {};
  const modelConfig = getProviderModelFields(aiConfig.provider, config);
  
  // 允许URL参数覆盖配置
  const thinkingModel = getValueFromSearchParams("thinkingModel") || modelConfig.thinkingModel || 'gpt-4o';
  const taskModel = getValueFromSearchParams("taskModel") || modelConfig.networkingModel || 'gpt-4o';

  // 添加简化的配置调试日志
  sseLogger.info('Configuration', {
    aiProvider: aiConfig.provider,
    searchProvider: searchConfig.searchProvider,
    models: modelConfig
  });


  // 生成任务ID - 包含所有参数
  const taskManager = BackgroundTaskManager.getInstance();
  const taskParams = {
    ...allSearchParams, // 包含所有URL参数
    // 确保关键配置参数正确
    aiProvider: aiConfig.provider,
    thinkingModel,
    taskModel,
    searchProvider: searchConfig.searchProvider,
    query,
    language,
    maxResult,
    enableCitationImage,
    enableReferences
  };
  
  const taskId = taskManager.generateTaskId(taskParams);
  
  // 添加调试日志显示任务ID生成信息
  sseLogger.info('Generated task ID', {
    taskId,
    includedParams: Object.keys(taskParams)
  });

  // 检查任务状态
  const existingTask = taskManager.getTask(taskId);
  
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    start: async (controller) => {
      // 注册客户端连接
      taskManager.registerClient(taskId);
      
      sseLogger.info("Client connected", { 
        taskId, 
        clientId,
        existingTaskStatus: existingTask?.status,
        isTaskRunning: taskManager.isTaskRunning(taskId),
        clientCount: taskManager.getClientCount(taskId)
      });

      let isClientConnected = true;
      req.signal.addEventListener("abort", () => {
        sseLogger.info("Client disconnected", { taskId, clientId });
        isClientConnected = false;
        taskManager.unregisterClient(taskId);
      });

      // 处理已完成的任务 - 从头回放完整输出
      if (existingTask && existingTask.status === 'completed') {
        sseLogger.info("Returning completed task output", { taskId });
        
        const outputs = taskManager.getTaskOutput(taskId);
        for (const output of outputs) {
          if (!isClientConnected) break;
          controller.enqueue(encoder.encode(output));
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        controller.close();
        return;
      }

      // 处理正在运行或暂停的任务 - 从头回放完整输出
      if (existingTask && (existingTask.status === 'running' || existingTask.status === 'paused')) {
        sseLogger.info("Connecting to existing task", { 
          taskId, 
          clientId,
          status: existingTask.status,
          isRunning: taskManager.isTaskRunning(taskId),
          clientCount: taskManager.getClientCount(taskId)
        });
        
        // 回放所有历史输出
        const existingOutputs = taskManager.getTaskOutput(taskId);
        for (const output of existingOutputs) {
          if (!isClientConnected) break;
          controller.enqueue(encoder.encode(output));
          await new Promise(resolve => setTimeout(resolve, 30));
        }

        // 监听任务进度，实时输出新内容
        let outputIndex = existingOutputs.length;
        const checkForNewOutput = async () => {
          while (isClientConnected) {
            const currentTask = taskManager.getTask(taskId);
            if (!currentTask) break;

            const currentOutputs = taskManager.getTaskOutput(taskId);
            
            // 只输出新的内容
            for (let i = outputIndex; i < currentOutputs.length; i++) {
              if (!isClientConnected) break;
              controller.enqueue(encoder.encode(currentOutputs[i]));
              outputIndex++;
            }

            // 任务完成时关闭连接
            if (currentTask.status === 'completed' || currentTask.status === 'failed') {
              controller.close();
              break;
            }

            await new Promise(resolve => setTimeout(resolve, 500));
          }
        };

        checkForNewOutput();
        return;
      }

      // 使用之前已经获取的配置，避免重复获取导致 API Key 丢失
      // const aiConfig = getAIProviderConfig(authResult.config || {}, req);
      // const searchConfig = getSearchProviderConfig(authResult.config || {}, req);

      sseLogger.info('DeepResearch initialization parameters', {
        language,
        query: query ? `${query.substring(0, 50)}...` : 'Empty',
        aiProvider: {
          provider: aiConfig.provider,
          baseURL: aiConfig.apiProxy || 'Not configured',
          hasApiKey: hasValidApiKey(aiConfig.provider, config),
          thinkingModel,
          taskModel
        },
        searchProvider: {
          provider: searchConfig.searchProvider,
          baseURL: searchConfig.apiProxy || 'Not configured',
          hasApiKey: hasValidSearchApiKey(searchConfig.searchProvider, config),
          maxResult
        },
        options: {
          enableCitationImage,
          enableReferences
        }
      });

      const processedApiKey = multiApiKeyPolling(aiConfig.apiKey);
      // 不在这里预处理搜索API key，将原始的多key字符串传递给DeepResearch
      // 让DeepResearch内部处理key的选择和轮换
      
      // 使用日志记录搜索配置状态
      sseLogger.debug('Search configuration processed', {
        hasApiKey: !!searchConfig.apiKey,
        searchKeyCount: searchConfig.apiKey ? searchConfig.apiKey.split(',').length : 0,
        searchProvider: searchConfig.searchProvider
      });

      // 创建新任务
      sseLogger.info("Starting new background task", { taskId });
      
      const deepResearch = new DeepResearch({
        language,
        AIProvider: {
          baseURL: aiConfig.apiProxy,
          apiKey: processedApiKey,
          provider: aiConfig.provider,
          thinkingModel,
          taskModel,
        },
        searchProvider: {
          baseURL: searchConfig.apiProxy,
          apiKey: searchConfig.apiKey,
          provider: searchConfig.searchProvider,
          maxResult,
        },
        onMessage: (event, data) => {
          // 这个onMessage会被BackgroundTaskManager重写
          if (event === "message" && isClientConnected) {
            controller.enqueue(encoder.encode(data.text));
          } else if (event === "progress") {
            sseLogger.debug(
              `[${data.step}]: ${data.name ? `"${data.name}" ` : ""}${
                data.status
              }`
            );
            if (data.step === "final-report" && data.status === "end") {
              controller.close();
            }
          } else if (event === "error") {
            console.error(data);
            if (isClientConnected) {
              controller.close();
            }
          }
        },
      });

      // 启动后台任务（不等待完成）
      taskManager.startBackgroundTask(taskId, deepResearch, query, enableCitationImage, enableReferences, taskParams);

      // 实时监听任务输出
      let outputIndex = 0;
      const monitorTaskOutput = async () => {
        while (isClientConnected) {
          const currentTask = taskManager.getTask(taskId);
          if (!currentTask) break;

          const outputs = taskManager.getTaskOutput(taskId);
          
          // 输出新内容
          for (let i = outputIndex; i < outputs.length; i++) {
            if (!isClientConnected) break;
            controller.enqueue(encoder.encode(outputs[i]));
            outputIndex++;
          }

          // 任务完成时关闭连接
          if (currentTask.status === 'completed' || currentTask.status === 'failed') {
            controller.close();
            break;
          }

          await new Promise(resolve => setTimeout(resolve, 500));
        }
      };

      monitorTaskOutput();
    },
  });

  return new NextResponse(readableStream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",

      // 响应标题里输出当前使用的模型名称和请求ID
      "X-Model-Name": `${aiConfig.provider} (${thinkingModel}, ${taskModel})`,
      "X-Search-Provider": searchConfig.searchProvider || "Not configured",
      "X-Request-ID": requestId,
      "X-Task-ID": taskId,
    },
  });
}