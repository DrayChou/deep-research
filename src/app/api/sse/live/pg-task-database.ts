/**
 * PostgreSQL任务数据库适配器
 * 为background-task-manager提供PostgreSQL支持
 * 统一的PostgreSQL数据库访问层
 */

import { NextRequest } from 'next/server';
import { SimplePGAdapter, TaskData as PGTaskData } from '@/utils/database/simple-pg-adapter';
import { logger } from '@/utils/logger';

const pgTaskLogger = logger.getInstance('PGTaskDatabase');

// 兼容现有的任务进度接口
interface TaskProgress {
  step: string;
  percentage: number;
  status: 'running' | 'paused' | 'completed' | 'failed';
  messages: string[];
  result?: any;
  error?: string;
  timestamp: string;
}

// 兼容现有的请求参数接口
interface TaskRequestParams {
  userId?: string;
  userMessageId?: string;
  topicId?: string;
  query: string;
  language: string;
  aiProvider: string;
  thinkingModel: string;
  taskModel: string;
  searchProvider: string;
  maxResult: number;
  enableCitationImage: boolean;
  enableReferences: boolean;
  mode?: string;
  dataBaseUrl?: string;
}

// 兼容现有的任务数据接口
interface TaskData {
  taskId: string;
  progress: TaskProgress;
  outputs: string[];
  lastSaved: string;
  requestParams: TaskRequestParams;
  createdAt: string;
  updatedAt: string;
  currentStep?: string;
  stepStatus?: string;
  finishReason?: string;
  isValidComplete?: boolean;
  lastStepCompletedAt?: string;
}

// 任务状态数据接口
interface TaskStatusData {
  currentStep?: string;
  stepStatus?: string;
  finishReason?: string;
  isValidComplete?: boolean;
  lastStepCompletedAt?: string;
}

// 兼容现有的数据库接口
interface DatabaseInterface {
  saveTask(taskId: string, progress: TaskProgress, outputs: string[], requestParams: TaskRequestParams): void;
  saveTaskWithStatus(taskId: string, progress: TaskProgress, outputs: string[], requestParams: TaskRequestParams, statusData: TaskStatusData): void;
  getTask(taskId: string): TaskData | null;
  getAllTasks(): TaskData[];
  deleteTask(taskId: string): void;
  archiveTask(taskId: string): void;
  getTaskStats(): { total: number; running: number; completed: number; failed: number };
  getTasksByStatus(status: 'running' | 'paused' | 'completed' | 'failed'): TaskData[];
  healthCheck(): { status: 'ok' | 'error'; message: string };
  cleanupOldTasks(daysToKeep: number): number;
  close(): void;
}

/**
 * PostgreSQL任务数据库实现
 * 将现有的任务管理接口适配到PostgreSQL
 */
export class PostgreSQLTaskDatabase implements DatabaseInterface {
  private pgAdapter: SimplePGAdapter;
  private currentRequest: NextRequest | null = null;
  private taskCache: Map<string, TaskData> = new Map();
  private cacheTimestamps: Map<string, number> = new Map();
  private cacheTimeout: number = 5 * 60 * 1000; // 5分钟缓存
  
  constructor() {
    this.pgAdapter = SimplePGAdapter.getInstance();
    pgTaskLogger.info('PostgreSQL task database initialized');
  }
  
  /**
   * 设置当前请求上下文（用于提取客户环境信息）
   */
  setRequestContext(request: NextRequest): void {
    this.currentRequest = request;
  }
  
  /**
   * 将现有的任务数据转换为PostgreSQL格式
   */
  private convertToPostgreSQLFormat(
    taskId: string,
    progress: TaskProgress,
    outputs: string[],
    requestParams: TaskRequestParams,
    statusData?: TaskStatusData
  ): PGTaskData {
    const now = new Date();
    
    // Handle undefined progress with safe defaults
    const safeProgress = progress || {
      step: 'unknown',
      percentage: 0,
      status: 'running',
      messages: [],
      timestamp: now.toISOString()
    };
    
    return {
      task_id: taskId,
      current_step: statusData?.currentStep || safeProgress.step,
      step_status: statusData?.stepStatus || safeProgress.status,
      finish_reason: statusData?.finishReason || undefined,
      is_valid_complete: statusData?.isValidComplete || safeProgress.status === 'completed',
      retry_count: 0, // 现有系统不跟踪重试次数
      processing_time: null, // 可以计算，但现有系统没有这个概念
      last_saved: now,
      last_step_completed_at: statusData?.lastStepCompletedAt ? 
        new Date(statusData.lastStepCompletedAt) : undefined,
      progress: { ...safeProgress },
      outputs: { messages: outputs },
      request_params: { ...requestParams },
      model_config: null,
      error_message: safeProgress.error || null,
      user_agent: null,
      ip_address: null,
      is_deleted: false,
      version: 1,
      // 用户环境信息字段 - 从请求中提取或设为null
      browser_name: null,
      browser_version: null,
      os_name: null,
      os_version: null,
      device_type: null,
      cpu_cores: null,
      memory_size: null,
      screen_resolution: null,
      timezone: null,
      language: null,
      platform: null,
      cpu_architecture: null
    };
  }
  
  /**
   * 将PostgreSQL数据转换回现有格式
   */
  private convertFromPostgreSQLFormat(pgTask: PGTaskData): TaskData {
    const progress: TaskProgress = {
      step: pgTask.current_step || 'unknown',
      percentage: (pgTask.progress as any)?.percentage || 0,
      status: (pgTask.step_status as 'running' | 'paused' | 'completed' | 'failed') || 'running',
      messages: (pgTask.progress as any)?.messages || [],
      result: (pgTask.progress as any)?.result,
      error: pgTask.error_message || (pgTask.progress as any)?.error,
      timestamp: pgTask.last_saved.toISOString()
    };
    
    return {
      taskId: pgTask.task_id,
      progress,
      outputs: Array.isArray(pgTask.outputs) ? pgTask.outputs : (pgTask.outputs as any)?.messages || [],
      lastSaved: pgTask.last_saved.toISOString(),
      requestParams: pgTask.request_params as TaskRequestParams,
      createdAt: pgTask.created_at?.toISOString() || pgTask.last_saved.toISOString(),
      updatedAt: pgTask.updated_at?.toISOString() || pgTask.last_saved.toISOString(),
      currentStep: pgTask.current_step || undefined,
      stepStatus: pgTask.step_status || undefined,
      finishReason: pgTask.finish_reason || undefined,
      isValidComplete: pgTask.is_valid_complete || false,
      lastStepCompletedAt: pgTask.last_step_completed_at?.toISOString()
    };
  }
  
  /**
   * 保存任务（同步接口）
   */
  saveTask(taskId: string, progress: TaskProgress, outputs: string[], requestParams: TaskRequestParams): void {
    // 转为异步执行
    this.saveTaskAsync(taskId, progress, outputs, requestParams).catch(error => {
      pgTaskLogger.error(`Failed to save task ${taskId}`, error instanceof Error ? error : new Error(String(error)));
    });
  }
  
  /**
   * 保存任务（异步实现）
   */
  private async saveTaskAsync(
    taskId: string, 
    progress: TaskProgress, 
    outputs: string[], 
    requestParams: TaskRequestParams
  ): Promise<void> {
    try {
      const pgTaskData = this.convertToPostgreSQLFormat(taskId, progress, outputs, requestParams);
      
      if (this.currentRequest) {
        await this.pgAdapter.saveTaskWithRequest(this.currentRequest, pgTaskData);
      } else {
        await this.pgAdapter.saveTask(pgTaskData);
      }
      
      pgTaskLogger.debug('Task saved successfully', { taskId });
    } catch (error) {
      pgTaskLogger.error('Failed to save task', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  /**
   * 保存任务（带状态）
   */
  saveTaskWithStatus(
    taskId: string,
    progress: TaskProgress,
    outputs: string[],
    requestParams: TaskRequestParams,
    statusData: TaskStatusData
  ): void {
    this.saveTaskWithStatusAsync(taskId, progress, outputs, requestParams, statusData).catch(error => {
      pgTaskLogger.error('Failed to save task with status', error instanceof Error ? error : new Error(String(error)));
    });
  }
  
  /**
   * 保存任务（带状态，异步实现）
   */
  private async saveTaskWithStatusAsync(
    taskId: string,
    progress: TaskProgress,
    outputs: string[],
    requestParams: TaskRequestParams,
    statusData: TaskStatusData
  ): Promise<void> {
    try {
      const pgTaskData = this.convertToPostgreSQLFormat(taskId, progress, outputs, requestParams, statusData);
      
      if (this.currentRequest) {
        await this.pgAdapter.saveTaskWithRequest(this.currentRequest, pgTaskData);
      } else {
        await this.pgAdapter.saveTask(pgTaskData);
      }
      
      pgTaskLogger.debug('Task with status saved successfully', { taskId });
    } catch (error) {
      pgTaskLogger.error('Failed to save task with status', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  /**
   * 获取任务（同步接口）
   * 使用简单缓存机制避免重复数据库查询
   */
  getTask(taskId: string): TaskData | null {
    try {
      // 检查内存缓存
      const cached = this.taskCache.get(taskId);
      const cacheTime = this.cacheTimestamps.get(taskId);
      
      if (cached && cacheTime && (Date.now() - cacheTime) < this.cacheTimeout) {
        pgTaskLogger.debug('Task retrieved from cache', { taskId });
        return cached;
      }
      
      // 缓存过期或不存在，需要异步加载
      // 同步接口限制：无法等待异步操作，返回null
      pgTaskLogger.debug('Task cache miss, needs async loading', { taskId });
      return null;
      
    } catch (error) {
      pgTaskLogger.error('Failed to get task (sync)', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }
  
  /**
   * 预加载任务到缓存（为同步接口准备数据）
   */
  async preloadTask(taskId: string): Promise<TaskData | null> {
    try {
      const pgTask = await this.pgAdapter.getTask(taskId);
      if (!pgTask) return null;
      
      const taskData = this.convertFromPostgreSQLFormat(pgTask);
      
      // 更新缓存
      this.taskCache.set(taskId, taskData);
      this.cacheTimestamps.set(taskId, Date.now());
      
      pgTaskLogger.debug('Task loaded and cached', { taskId });
      return taskData;
      
    } catch (error) {
      pgTaskLogger.error('Failed to preload task', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }
  
  /**
   * 获取任务（异步实现）
   */
  async getTaskAsync(taskId: string): Promise<TaskData | null> {
    try {
      const pgTask = await this.pgAdapter.getTask(taskId);
      if (!pgTask) {
        return null;
      }
      
      return this.convertFromPostgreSQLFormat(pgTask);
    } catch (error) {
      pgTaskLogger.error('Failed to get task', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }
  
  /**
   * 获取所有任务
   */
  getAllTasks(): TaskData[] {
    // 同步接口限制，返回空数组
    // 实际实现需要异步接口支持
    pgTaskLogger.warn('getAllTasks called synchronously - returning empty array');
    return [];
  }
  
  /**
   * 删除任务（软删除）
   */
  deleteTask(taskId: string): void {
    this.deleteTaskAsync(taskId).catch(error => {
      pgTaskLogger.error('Failed to delete task', error instanceof Error ? error : new Error(String(error)));
    });
  }
  
  private async deleteTaskAsync(taskId: string): Promise<void> {
    try {
      await this.pgAdapter.updateTaskStatus(taskId, {
        stepStatus: 'deleted',
        finishReason: 'user_deleted'
      });
      
      pgTaskLogger.debug('Task deleted successfully', { taskId });
    } catch (error) {
      pgTaskLogger.error('Failed to delete task', error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  /**
   * 归档任务
   */
  archiveTask(taskId: string): void {
    this.archiveTaskAsync(taskId).catch(error => {
      pgTaskLogger.error('Failed to archive task', error instanceof Error ? error : new Error(String(error)));
    });
  }
  
  private async archiveTaskAsync(taskId: string): Promise<void> {
    try {
      await this.pgAdapter.updateTaskStatus(taskId, {
        stepStatus: 'archived',
        finishReason: 'archived'
      });
      
      pgTaskLogger.debug('Task archived successfully', { taskId });
    } catch (error) {
      pgTaskLogger.error('Failed to archive task', error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  /**
   * 获取任务统计
   */
  getTaskStats(): { total: number; running: number; completed: number; failed: number } {
    // 返回默认值，实际实现需要异步支持
    return { total: 0, running: 0, completed: 0, failed: 0 };
  }
  
  /**
   * 根据状态获取任务
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getTasksByStatus(_status: 'running' | 'paused' | 'completed' | 'failed'): TaskData[] {
    // 返回空数组，实际实现需要异步支持
    return [];
  }
  
  /**
   * 健康检查
   */
  healthCheck(): { status: 'ok' | 'error'; message: string } {
    try {
      const poolStatus = this.pgAdapter.getPoolStatus();
      
      if (poolStatus.connected && poolStatus.totalConnections > 0) {
        return {
          status: 'ok',
          message: `PostgreSQL connected - ${poolStatus.totalConnections} connections`
        };
      } else {
        return {
          status: 'error',
          message: 'PostgreSQL not connected'
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * 清理旧任务
   */
  cleanupOldTasks(daysToKeep: number): number {
    // 异步操作，返回0
    this.cleanupOldTasksAsync(daysToKeep).catch(error => {
      pgTaskLogger.error('Failed to cleanup old tasks', error instanceof Error ? error : new Error(String(error)));
    });
    
    return 0; // 无法同步返回实际清理数量
  }
  
  private async cleanupOldTasksAsync(daysToKeep: number): Promise<number> {
    try {
      // 使用软删除标记过期任务
      // TODO: 实现实际的清理逻辑
      pgTaskLogger.info('Old tasks cleanup requested', { daysToKeep });
      return 0;
    } catch (error) {
      pgTaskLogger.error('Failed to cleanup old tasks', error instanceof Error ? error : new Error(String(error)));
      return 0;
    }
  }
  
  /**
   * 关闭数据库连接
   */
  close(): void {
    this.pgAdapter.close().catch(error => {
      pgTaskLogger.error('Failed to close PostgreSQL connection', error instanceof Error ? error : new Error(String(error)));
    });
  }
}

/**
 * 创建PostgreSQL任务数据库实例
 */
export function createPostgreSQLTaskDatabase(): PostgreSQLTaskDatabase {
  return new PostgreSQLTaskDatabase();
}

// 异步接口版本（推荐使用）
export interface AsyncDatabaseInterface {
  saveTask(taskId: string, progress: TaskProgress, outputs: string[], requestParams: TaskRequestParams): Promise<void>;
  saveTaskWithStatus(taskId: string, progress: TaskProgress, outputs: string[], requestParams: TaskRequestParams, statusData: TaskStatusData): Promise<void>;
  getTask(taskId: string): Promise<TaskData | null>;
  getAllTasks(): Promise<TaskData[]>;
  deleteTask(taskId: string): Promise<void>;
  archiveTask(taskId: string): Promise<void>;
  getTaskStats(): Promise<{ total: number; running: number; completed: number; failed: number }>;
  getTasksByStatus(status: 'running' | 'paused' | 'completed' | 'failed'): Promise<TaskData[]>;
  healthCheck(): Promise<{ status: 'ok' | 'error'; message: string }>;
  cleanupOldTasks(daysToKeep: number): Promise<number>;
  close(): Promise<void>;
}

/**
 * 异步PostgreSQL任务数据库实现（推荐）
 */
export class AsyncPostgreSQLTaskDatabase implements AsyncDatabaseInterface {
  private pgAdapter: SimplePGAdapter;
  private currentRequest: NextRequest | null = null;
  private taskCache: Map<string, TaskData> = new Map();
  
  constructor() {
    this.pgAdapter = SimplePGAdapter.getInstance();
    pgTaskLogger.info('Async PostgreSQL task database initialized');
  }
  
  setRequestContext(request: NextRequest): void {
    this.currentRequest = request;
  }
  
  /**
   * 从缓存中获取任务
   */
  private getCachedTask(taskId: string): TaskData | null {
    return this.taskCache.get(taskId) || null;
  }
  
  /**
   * 缓存任务
   */
  private cacheTask(task: TaskData): void {
    this.taskCache.set(task.taskId, task);
  }
  
  private convertToPostgreSQLFormat(
    taskId: string,
    progress: TaskProgress,
    outputs: string[],
    requestParams: TaskRequestParams,
    statusData?: TaskStatusData
  ): PGTaskData {
    const now = new Date();
    
    // 严格的数据类型检查 - 防止数据结构错乱
    if (typeof taskId !== 'string') {
      console.error('CRITICAL: taskId is not a string:', { 
        taskId, 
        type: typeof taskId,
        isObject: typeof taskId === 'object',
        keys: typeof taskId === 'object' ? Object.keys(taskId || {}) : undefined
      });
      
      // 尝试从对象中提取真正的taskId
      if (typeof taskId === 'object' && taskId && 'task_id' in taskId) {
        taskId = (taskId as any).task_id;
        console.warn('Extracted task_id from object:', taskId);
      } else if (typeof taskId === 'object' && taskId && 'taskId' in taskId) {
        taskId = (taskId as any).taskId;
        console.warn('Extracted taskId from object:', taskId);
      } else {
        throw new Error(`Invalid taskId type: ${typeof taskId}, value: ${JSON.stringify(taskId)}`);
      }
    }
    
    // 确保taskId是有效的字符串
    const safeTaskId = String(taskId).trim();
    if (!safeTaskId || safeTaskId === '[object Object]') {
      throw new Error(`Invalid taskId after conversion: "${safeTaskId}"`);
    }
    
    return {
      task_id: safeTaskId,
      current_step: statusData?.currentStep || progress?.step || 'unknown',
      step_status: statusData?.stepStatus || progress?.status || 'running',
      finish_reason: statusData?.finishReason || undefined,
      is_valid_complete: statusData?.isValidComplete || progress?.status === 'completed',
      retry_count: 0,
      processing_time: null,
      last_saved: now,
      last_step_completed_at: statusData?.lastStepCompletedAt ? 
        new Date(statusData.lastStepCompletedAt) : undefined,
      progress: progress || { step: 'unknown', percentage: 0, status: 'running', messages: [], timestamp: now.toISOString() },
      outputs: { messages: outputs },
      request_params: { ...requestParams },
      model_config: null,
      error_message: progress?.error || null,
      user_agent: null,
      ip_address: null,
      is_deleted: false,
      version: 1,
      // 用户环境信息字段 - 从请求中提取或设为null
      browser_name: null,
      browser_version: null,
      os_name: null,
      os_version: null,
      device_type: null,
      cpu_cores: null,
      memory_size: null,
      screen_resolution: null,
      timezone: null,
      language: null,
      platform: null,
      cpu_architecture: null
    };
  }
  
  private convertFromPostgreSQLFormat(pgTask: PGTaskData): TaskData {
    const progress: TaskProgress = {
      step: pgTask.current_step || 'unknown',
      percentage: (pgTask.progress as any)?.percentage || 0,
      status: (pgTask.step_status as 'running' | 'paused' | 'completed' | 'failed') || 'running',
      messages: (pgTask.progress as any)?.messages || [],
      result: (pgTask.progress as any)?.result,
      error: pgTask.error_message || (pgTask.progress as any)?.error,
      timestamp: pgTask.last_saved.toISOString()
    };
    
    return {
      taskId: pgTask.task_id,
      progress,
      outputs: Array.isArray(pgTask.outputs) ? pgTask.outputs : (pgTask.outputs as any)?.messages || [],
      lastSaved: pgTask.last_saved.toISOString(),
      requestParams: pgTask.request_params as TaskRequestParams,
      createdAt: pgTask.created_at?.toISOString() || pgTask.last_saved.toISOString(),
      updatedAt: pgTask.updated_at?.toISOString() || pgTask.last_saved.toISOString(),
      currentStep: pgTask.current_step || undefined,
      stepStatus: pgTask.step_status || undefined,
      finishReason: pgTask.finish_reason || undefined,
      isValidComplete: pgTask.is_valid_complete || false,
      lastStepCompletedAt: pgTask.last_step_completed_at?.toISOString()
    };
  }
  
  async saveTask(taskId: string, progress: TaskProgress, outputs: string[], requestParams: TaskRequestParams): Promise<void> {
    try {
      const pgTaskData = this.convertToPostgreSQLFormat(taskId, progress, outputs, requestParams);
      
      if (this.currentRequest) {
        await this.pgAdapter.saveTaskWithRequest(this.currentRequest, pgTaskData);
      } else {
        await this.pgAdapter.saveTask(pgTaskData);
      }
      
      // 缓存任务数据
      const taskData = this.convertFromPostgreSQLFormat(pgTaskData);
      this.cacheTask(taskData);
      
      pgTaskLogger.debug('Task saved successfully', { taskId });
    } catch (error) {
      pgTaskLogger.error('Failed to save task', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async saveTaskWithStatus(taskId: string, progress: TaskProgress, outputs: string[], requestParams: TaskRequestParams, statusData: TaskStatusData): Promise<void> {
    try {
      const pgTaskData = this.convertToPostgreSQLFormat(taskId, progress, outputs, requestParams, statusData);
      
      if (this.currentRequest) {
        await this.pgAdapter.saveTaskWithRequest(this.currentRequest, pgTaskData);
      } else {
        await this.pgAdapter.saveTask(pgTaskData);
      }
      
      pgTaskLogger.debug('Task with status saved successfully', { taskId });
    } catch (error) {
      pgTaskLogger.error('Failed to save task with status', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async getTask(taskId: string): Promise<TaskData | null> {
    try {
      const pgTask = await this.pgAdapter.getTask(taskId);
      if (!pgTask) {
        return null;
      }
      
      return this.convertFromPostgreSQLFormat(pgTask);
    } catch (error) {
      pgTaskLogger.error('Failed to get task', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }
  
  async getAllTasks(): Promise<TaskData[]> {
    // TODO: 实现获取所有任务的逻辑
    return [];
  }
  
  async deleteTask(taskId: string): Promise<void> {
    try {
      await this.pgAdapter.updateTaskStatus(taskId, {
        stepStatus: 'deleted',
        finishReason: 'user_deleted'
      });
      
      pgTaskLogger.debug('Task deleted successfully', { taskId });
    } catch (error) {
      pgTaskLogger.error('Failed to delete task', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async archiveTask(taskId: string): Promise<void> {
    try {
      await this.pgAdapter.updateTaskStatus(taskId, {
        stepStatus: 'archived',
        finishReason: 'archived'
      });
      
      pgTaskLogger.debug('Task archived successfully', { taskId });
    } catch (error) {
      pgTaskLogger.error('Failed to archive task', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async getTaskStats(): Promise<{ total: number; running: number; completed: number; failed: number }> {
    try {
      const stats = await this.pgAdapter.getTaskStatsByEnvironment();
      
      // 聚合所有环境的统计数据
      let total = 0, running = 0, completed = 0, failed = 0;
      
      Object.values(stats).forEach((envStats: any) => {
        total += envStats.total || 0;
        running += envStats.running || 0;
        completed += envStats.completed || 0;
        failed += envStats.failed || 0;
      });
      
      return { total, running, completed, failed };
    } catch (error) {
      pgTaskLogger.error('Failed to get task stats', error instanceof Error ? error : new Error(String(error)));
      return { total: 0, running: 0, completed: 0, failed: 0 };
    }
  }
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getTasksByStatus(_status: 'running' | 'paused' | 'completed' | 'failed'): Promise<TaskData[]> {
    // TODO: 实现根据状态获取任务的逻辑
    return [];
  }
  
  async healthCheck(): Promise<{ status: 'ok' | 'error'; message: string }> {
    try {
      const health = await this.pgAdapter.healthCheck();
      
      if (health.connected) {
        return {
          status: 'ok',
          message: 'PostgreSQL connected and healthy'
        };
      } else {
        return {
          status: 'error',
          message: health.error || 'PostgreSQL connection failed'
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  async cleanupOldTasks(daysToKeep: number): Promise<number> {
    try {
      // TODO: 实现清理旧任务的逻辑
      pgTaskLogger.info('Old tasks cleanup requested', { daysToKeep });
      return 0;
    } catch (error) {
      pgTaskLogger.error('Failed to cleanup old tasks', error instanceof Error ? error : new Error(String(error)));
      return 0;
    }
  }
  
  async close(): Promise<void> {
    await this.pgAdapter.close();
  }
}

export default PostgreSQLTaskDatabase;