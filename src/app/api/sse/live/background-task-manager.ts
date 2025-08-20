/**
 * Background Task Manager - Manages background research tasks
 * Separated from the main route for better organization
 */

import { logger } from "@/utils/logger";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as os from "node:os";
// PostgreSQL数据库统一支持
import { createAsyncDatabase, getDatabaseHealth } from './database-factory';
import { withErrorRecovery, createErrorContext } from "./error-handler";
import { NotificationService } from "@/utils/notification";
import { notificationConfig } from "@/utils/notification/config";

export interface TaskProgress {
  step: string;
  percentage: number;
  status: 'running' | 'paused' | 'completed' | 'failed';
  messages: string[];
  result?: any;
  error?: string;
  timestamp: string;
}

export interface TaskRequestParams {
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

class BackgroundTaskManager {
  private static instance: BackgroundTaskManager;
  private tasks: Map<string, TaskProgress> = new Map();
  private runningTasks: Map<string, Promise<any>> = new Map();
  private taskOutputs: Map<string, string[]> = new Map();
  private taskParams: Map<string, any> = new Map();
  private storageDir: string;
  private db!: any; // 统一PostgreSQL数据库接口
  private isInitialized = false;
  private notificationService: NotificationService;
  
  // 并发控制增强
  private taskLocks: Map<string, Promise<void>> = new Map(); // 任务锁
  private concurrentTasksLimit = 5; // 同时运行的最大任务数
  private taskStartTimes: Map<string, number> = new Map(); // 任务开始时间
  
  // 智能内存管理
  private taskAccessTimes: Map<string, number> = new Map(); // 任务最后访问时间
  private taskAccessCount: Map<string, number> = new Map(); // 任务访问次数
  private taskValueScore: Map<string, number> = new Map(); // 任务价值分数
  
  // 缓存性能监控
  private cacheStats = {
    hits: 0,
    misses: 0,
    validationTime: 0,
    averageValidationTime: 0,
    totalRequests: 0,
    lastResetTime: Date.now()
  };
  
  // Memory management
  private clientConnections: Map<string, number> = new Map();
  private maxConnectionsPerTask = 100;
  private maxTasks = 1000;
  private maxMemoryUsage: number = 500 * 1024 * 1024; // Default 500MB, will be recalculated
  private systemTotalMemory: number = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private lastCleanupTime = Date.now();
  private memoryPressureLevel = 0; // 0-3: normal, warning, critical, emergency

  private constructor() {
    this.storageDir = path.join(process.cwd(), 'data', 'tasks');
    this.notificationService = new NotificationService(notificationConfig);
    this.initializeMemorySettings();
  }

  /**
   * 异步初始化数据库
   */
  private async initializeDatabase(): Promise<void> {
    try {
      console.log('Initializing BackgroundTaskManager with database factory...');
      
      // 使用统一的PostgreSQL数据库实例
      this.db = await createAsyncDatabase();
      
      // 检查数据库健康状态
      const health = await getDatabaseHealth();
      console.log('Database health check:', health);
      
      this.isInitialized = true;
      console.log('✅ BackgroundTaskManager databases initialized successfully');
    } catch (error) {
      console.error('Failed to initialize BackgroundTaskManager database:', error);
      logger.getInstance('BackgroundTaskManager').error('Database initialization failed', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private initializeMemorySettings(): void {
    // Get system total memory
    this.systemTotalMemory = os.totalmem();
    
    // Calculate memory allocation based on system resources
    const systemMemoryGB = this.systemTotalMemory / (1024 * 1024 * 1024);
    
    if (systemMemoryGB <= 2) {
      // Low memory systems: use 20% of total memory
      this.maxMemoryUsage = Math.floor(this.systemTotalMemory * 0.20);
    } else if (systemMemoryGB <= 8) {
      // Medium memory systems: use 35% of total memory
      this.maxMemoryUsage = Math.floor(this.systemTotalMemory * 0.35);
    } else if (systemMemoryGB <= 16) {
      // High memory systems: use 40% of total memory with 6GB cap
      this.maxMemoryUsage = Math.min(
        Math.floor(this.systemTotalMemory * 0.40),
        6 * 1024 * 1024 * 1024 // 6GB cap
      );
    } else {
      // Very high memory systems: use 30% with 12GB cap
      this.maxMemoryUsage = Math.min(
        Math.floor(this.systemTotalMemory * 0.30),
        12 * 1024 * 1024 * 1024 // 12GB cap
      );
    }
    
    // Ensure minimum 512MB allocation for better performance
    this.maxMemoryUsage = Math.max(this.maxMemoryUsage, 512 * 1024 * 1024);
    
    console.log(`Memory allocation: ${Math.round(this.maxMemoryUsage / 1024 / 1024)}MB / ${Math.round(systemMemoryGB * 1024)}MB (${Math.round((this.maxMemoryUsage / this.systemTotalMemory) * 100)}%)`);
  }

  // Legacy method removed - using PostgreSQL only

  static async getInstance(): Promise<BackgroundTaskManager> {
    if (!BackgroundTaskManager.instance) {
      try {
        console.log('Creating BackgroundTaskManager singleton instance...');
        BackgroundTaskManager.instance = new BackgroundTaskManager();
        await BackgroundTaskManager.instance.initialize();
        console.log('✅ BackgroundTaskManager singleton created successfully');
      } catch (error) {
        console.error('Failed to create BackgroundTaskManager singleton:', error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    }
    // 确保实例已完全初始化
    if (!BackgroundTaskManager.instance.isInitialized) {
      await BackgroundTaskManager.instance.initialize();
    }
    return BackgroundTaskManager.instance;
  }

  /**
   * 完整初始化，包括数据库和任务加载
   */
  private async initialize(): Promise<void> {
    await this.initializeDatabase();
    await this.loadTasksFromDatabase();
    this.startCleanupProcess();
  }

  private async loadTasksFromDatabase(): Promise<void> {
    const context = createErrorContext('load-tasks-from-database');
    
    await withErrorRecovery(async () => {
      if (!this.db || !this.isInitialized) {
        console.log('Database not available or not initialized, skipping task loading');
        return;
      }
      
      try {
        const allTasks = await this.db.getAllTasks();
        console.log(`Found ${allTasks.length} tasks in database`);
        
        for (const task of allTasks) {
          // Check memory limits
          if (this.tasks.size >= this.maxTasks) {
            await this.cleanupOldTasks();
            if (this.tasks.size >= this.maxTasks) {
              console.warn('Maximum task limit reached, skipping additional tasks');
              break;
            }
          }

          this.tasks.set(task.taskId, task.progress);
          this.taskOutputs.set(task.taskId, task.outputs);
          this.taskParams.set(task.taskId, task.requestParams);
          
          if (task.progress.status === 'running') {
            await this.updateTaskProgress(task.taskId, { status: 'paused' });
          }
        }
        console.log(`Successfully loaded ${this.tasks.size} tasks from database`);
      } catch (error) {
        console.error('Error loading tasks from database:', error);
        throw error;
      }
    }, context, async () => {
      // Fallback: Start with empty task state
      console.log('Starting with empty task state due to database loading failure');
    });
  }

  private startCleanupProcess(): void {
    // More frequent cleanup with smart scheduling
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 5 * 60 * 1000); // Every 5 minutes
    
    // Log memory stats and performance reports
    setInterval(() => {
      const memUsage = process.memoryUsage();
      this.updateMemoryPressureLevel(memUsage);
      if (this.memoryPressureLevel > 0 || process.env.NODE_ENV === 'development') {
        console.log(`[Memory Monitor] Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(this.maxMemoryUsage / 1024 / 1024)}MB (Level: ${this.memoryPressureLevel})`);
      }
      
      // 每10分钟输出一次性能报告
      const now = Date.now();
      if (now - this.cacheStats.lastResetTime > 10 * 60 * 1000 && this.cacheStats.totalRequests > 0) {
        this.logPerformanceReport();
      }
    }, 60 * 1000); // Every minute
  }

  private async performCleanup(): Promise<void> {
    try {
      const now = Date.now();
      const timeSinceLastCleanup = now - this.lastCleanupTime;
      
      // Smart cleanup frequency based on memory pressure
      const minCleanupInterval = this.memoryPressureLevel > 1 ? 2 * 60 * 1000 : 5 * 60 * 1000; // 2min if critical, otherwise 5min
      
      if (timeSinceLastCleanup < minCleanupInterval) {
        return;
      }

      console.log('Starting BackgroundTaskManager cleanup...');
      
      // Check memory usage and update pressure level
      const memoryUsage = process.memoryUsage();
      this.updateMemoryPressureLevel(memoryUsage);
      const heapUsed = memoryUsage.heapUsed;
      
      console.log('Memory usage before cleanup:', {
        heapUsed: `${Math.round(heapUsed / 1024 / 1024)}MB`,
        maxMemory: `${Math.round(this.maxMemoryUsage / 1024 / 1024)}MB`,
        systemTotal: `${Math.round(this.systemTotalMemory / 1024 / 1024 / 1024 * 100) / 100}GB`,
        usagePercent: `${Math.round((heapUsed / this.maxMemoryUsage) * 100)}%`,
        pressureLevel: this.memoryPressureLevel
      });

      // Use gradual cleanup based on pressure level
      const cleanupPerformed = await this.performGradualCleanup();
      
      if (!cleanupPerformed) {
        // Normal maintenance cleanup
        this.cleanupOldTasks();
        this.cleanupOrphanedConnections();
        await this.cleanupLargeOutputs();
      }
      
      // 清理过期的任务和锁（每次清理都执行）
      this.cleanupExpiredTasks();
      
      // 清理统计数据
      this.cleanupTaskStats();

      this.lastCleanupTime = now;
      
      const finalMemoryUsage = process.memoryUsage();
      this.updateMemoryPressureLevel(finalMemoryUsage);
      console.log('Memory usage after cleanup:', {
        heapUsed: `${Math.round(finalMemoryUsage.heapUsed / 1024 / 1024)}MB`,
        usagePercent: `${Math.round((finalMemoryUsage.heapUsed / this.maxMemoryUsage) * 100)}%`,
        pressureLevel: this.memoryPressureLevel,
        freed: `${Math.round((heapUsed - finalMemoryUsage.heapUsed) / 1024 / 1024)}MB`
      });
      
      console.log('BackgroundTaskManager cleanup completed');
    } catch (error) {
      console.error('Cleanup process failed:', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private aggressiveCleanup(): void {
    console.log('Performing aggressive cleanup...');
    
    // Remove all completed tasks older than 1 day
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const tasksToDelete: string[] = [];
    
    for (const [taskId, task] of this.tasks.entries()) {
      const taskTimestamp = new Date(task.timestamp).getTime();
      if (task.status === 'completed' && taskTimestamp < oneDayAgo) {
        console.log(`激进清理：删除超过1天的任务 ${taskId.substring(0, 16)}...`);
        tasksToDelete.push(taskId);
      }
    }

    // Delete up to 50% of completed tasks
    const maxDelete = Math.floor(tasksToDelete.length * 0.5);
    for (let i = 0; i < Math.min(maxDelete, tasksToDelete.length); i++) {
      this.deleteTask(tasksToDelete[i]);
    }

    console.log(`Aggressively deleted ${Math.min(maxDelete, tasksToDelete.length)} completed tasks`);
  }

  private async cleanupLargeOutputs(): Promise<void> {
    // Clean up tasks with very large outputs
    const maxOutputSize = 1000; // Maximum lines per task
    const tasksToClean: string[] = [];
    
    for (const [taskId, outputs] of this.taskOutputs.entries()) {
      if (outputs.length > maxOutputSize) {
        tasksToClean.push(taskId);
      }
    }

    // Trim large outputs
    for (const taskId of tasksToClean) {
      const outputs = this.taskOutputs.get(taskId);
      if (outputs) {
        // Keep only the most recent 80% of outputs
        const keepCount = Math.floor(maxOutputSize * 0.8);
        const trimmedOutputs = outputs.slice(-keepCount);
        this.taskOutputs.set(taskId, trimmedOutputs);
        
        console.log(`Trimmed outputs for task ${taskId}: ${outputs.length} -> ${trimmedOutputs.length}`);
        
        // Update database
        try {
          if (this.db) {
            const task = this.tasks.get(taskId);
            const requestParams = this.taskParams.get(taskId);
            if (task && requestParams) {
              await this.db.saveTask(taskId, task, trimmedOutputs, requestParams);
            }
          }
        } catch (error) {
          console.error(`Failed to save trimmed outputs for task ${taskId}:`, error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  }

  private cleanupOldTasks(): void {
    if (this.tasks.size <= this.maxTasks * 0.8) return;

    // 使用智能清理策略
    this.performIntelligentCleanup();
  }

  /**
   * 智能清理策略：基于访问频率和价值分数进行清理
   */
  private performIntelligentCleanup(): void {
    const now = Date.now();
    const tasksToDelete: Array<{taskId: string, priority: number}> = [];
    
    for (const [taskId, task] of this.tasks.entries()) {
      // 跳过运行中的任务
      if (task.status === 'running' || this.runningTasks.has(taskId)) continue;
      
      // 计算任务的清理优先级（数值越高越优先被清理）
      const cleanupPriority = this.calculateCleanupPriority(taskId, task, now);
      
      if (cleanupPriority > 0) {
        tasksToDelete.push({ taskId, priority: cleanupPriority });
      }
    }

    // 按优先级排序（高优先级先删除）
    tasksToDelete.sort((a, b) => b.priority - a.priority);

    const targetDeleteCount = this.tasks.size - Math.floor(this.maxTasks * 0.8);
    const actualDeleteCount = Math.min(tasksToDelete.length, targetDeleteCount);
    
    for (let i = 0; i < actualDeleteCount; i++) {
      const taskId = tasksToDelete[i].taskId;
      console.log(`Smart cleanup: removing task ${taskId.substring(0, 16)}... (priority: ${tasksToDelete[i].priority.toFixed(2)})`);
      this.deleteTask(taskId);
    }

    console.log(`Smart cleanup completed: removed ${actualDeleteCount} tasks based on usage patterns`);
  }

  /**
   * 计算任务的清理优先级
   * 返回值越高表示越应该被清理
   */
  private calculateCleanupPriority(taskId: string, task: TaskProgress, now: number): number {
    // 基础参数
    const taskAge = now - new Date(task.timestamp).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    // 获取访问统计
    const lastAccess = this.taskAccessTimes.get(taskId) || new Date(task.timestamp).getTime();
    const accessCount = this.taskAccessCount.get(taskId) || 0;
    const valueScore = this.taskValueScore.get(taskId) || 0;
    
    // 时间因子：越老的任务优先级越高
    const ageFactor = Math.log(1 + taskAge / oneDayMs); // 对数增长
    
    // 访问因子：越少被访问的任务优先级越高
    const timeSinceAccess = now - lastAccess;
    const accessFactor = Math.log(1 + timeSinceAccess / oneDayMs) / Math.log(2 + accessCount);
    
    // 价值因子：价值越低的任务优先级越高
    const valueFactor = Math.max(0, 1 - valueScore / 100);
    
    // 状态因子：失败的任务更容易被清理
    const statusFactor = task.status === 'failed' ? 2.0 : 
                        task.status === 'completed' ? 1.0 : 0.1;
    
    // 综合优先级计算
    const priority = (ageFactor * 0.3 + accessFactor * 0.4 + valueFactor * 0.2 + statusFactor * 0.1) * 100;
    
    // 设置最小阈值：超过7天且未访问的任务必须清理
    const forceCleanup = taskAge > 7 * oneDayMs && timeSinceAccess > 3 * oneDayMs;
    
    return forceCleanup ? Math.max(priority, 1000) : priority;
  }

  /**
   * 记录任务访问统计
   */
  private recordTaskAccess(taskId: string): void {
    const now = Date.now();
    this.taskAccessTimes.set(taskId, now);
    
    const currentCount = this.taskAccessCount.get(taskId) || 0;
    this.taskAccessCount.set(taskId, currentCount + 1);
    
    // 计算价值分数：基于访问频率和时间分布
    this.updateTaskValueScore(taskId);
  }

  /**
   * 更新任务价值分数
   */
  private updateTaskValueScore(taskId: string): void {
    const accessCount = this.taskAccessCount.get(taskId) || 0;
    const lastAccess = this.taskAccessTimes.get(taskId) || Date.now();
    const task = this.tasks.get(taskId);
    
    if (!task) return;
    
    const now = Date.now();
    const taskAge = now - new Date(task.timestamp).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    // 基于多个因子计算价值分数
    let valueScore = 0;
    
    // 访问频率分数（0-30分）
    const accessFrequencyScore = Math.min(30, accessCount * 3);
    
    // 最近访问分数（0-25分）
    const timeSinceAccess = now - lastAccess;
    const recentAccessScore = Math.max(0, 25 - (timeSinceAccess / oneDayMs) * 5);
    
    // 内容完整性分数（0-25分）
    const outputs = this.taskOutputs.get(taskId) || [];
    const contentScore = task.status === 'completed' && outputs.length > 0 ? 25 : 0;
    
    // 任务类型分数（0-20分）
    const typeScore = task.status === 'completed' ? 20 : 
                     task.status === 'running' ? 15 : 0;
    
    valueScore = accessFrequencyScore + recentAccessScore + contentScore + typeScore;
    
    this.taskValueScore.set(taskId, Math.min(100, valueScore));
  }

  /**
   * 清理过期的统计数据
   */
  private cleanupTaskStats(): void {
    const now = Date.now();
    const maxStatsAge = 30 * 24 * 60 * 60 * 1000; // 30天
    
    // 清理不存在任务的统计数据
    for (const taskId of this.taskAccessTimes.keys()) {
      if (!this.tasks.has(taskId)) {
        this.taskAccessTimes.delete(taskId);
        this.taskAccessCount.delete(taskId);
        this.taskValueScore.delete(taskId);
      }
    }
    
    console.log('Task statistics cleaned up');
  }

  /**
   * 记录缓存命中
   */
  private recordCacheHit(): void {
    this.cacheStats.hits++;
  }

  /**
   * 记录缓存未命中
   */
  private recordCacheMiss(): void {
    this.cacheStats.misses++;
  }

  /**
   * 更新验证时间统计
   */
  private updateValidationTimeStats(validationTime: number): void {
    this.cacheStats.validationTime += validationTime;
    this.cacheStats.averageValidationTime = this.cacheStats.validationTime / this.cacheStats.totalRequests;
  }

  /**
   * 获取缓存性能统计
   */
  getCachePerformanceStats(): any {
    const now = Date.now();
    const timeSinceReset = now - this.cacheStats.lastResetTime;
    const hoursAlive = timeSinceReset / (1000 * 60 * 60);
    
    const hitRate = this.cacheStats.totalRequests > 0 ? 
      (this.cacheStats.hits / this.cacheStats.totalRequests) * 100 : 0;
    
    return {
      // 基础统计
      totalRequests: this.cacheStats.totalRequests,
      cacheHits: this.cacheStats.hits,
      cacheMisses: this.cacheStats.misses,
      hitRate: `${hitRate.toFixed(2)}%`,
      
      // 性能统计
      averageValidationTime: `${this.cacheStats.averageValidationTime.toFixed(2)}ms`,
      totalValidationTime: `${this.cacheStats.validationTime.toFixed(2)}ms`,
      
      // 内存使用统计
      tasksInMemory: this.tasks.size,
      runningTasks: this.runningTasks.size,
      availableSlots: this.concurrentTasksLimit - this.runningTasks.size,
      
      // 智能管理统计
      taskStats: {
        totalTracked: this.taskAccessTimes.size,
        highValueTasks: Array.from(this.taskValueScore.entries())
          .filter(([_, score]) => score > 80)
          .length,
        averageValueScore: this.calculateAverageValueScore()
      },
      
      // 系统信息
      uptime: `${hoursAlive.toFixed(2)} hours`,
      memoryPressureLevel: this.memoryPressureLevel,
      lastCleanup: new Date(this.lastCleanupTime).toISOString()
    };
  }

  /**
   * 计算平均价值分数
   */
  private calculateAverageValueScore(): number {
    if (this.taskValueScore.size === 0) return 0;
    
    const totalScore = Array.from(this.taskValueScore.values())
      .reduce((sum, score) => sum + score, 0);
    
    return totalScore / this.taskValueScore.size;
  }

  /**
   * 重置缓存统计
   */
  resetCacheStats(): void {
    this.cacheStats = {
      hits: 0,
      misses: 0,
      validationTime: 0,
      averageValidationTime: 0,
      totalRequests: 0,
      lastResetTime: Date.now()
    };
    console.log('Cache statistics reset');
  }

  /**
   * 定期输出性能报告
   */
  private logPerformanceReport(): void {
    const stats = this.getCachePerformanceStats();
    
    console.log('\n=== Background Task Manager Performance Report ===');
    console.log(`Cache Hit Rate: ${stats.hitRate} (${stats.cacheHits}/${stats.totalRequests})`);
    console.log(`Average Validation Time: ${stats.averageValidationTime}`);
    console.log(`Tasks in Memory: ${stats.tasksInMemory}, Running: ${stats.runningTasks}`);
    console.log(`High Value Tasks: ${stats.taskStats.highValueTasks}`);
    console.log(`Memory Pressure: Level ${stats.memoryPressureLevel}`);
    console.log('===============================================\n');
    
    // 预测性清理建议
    this.analyzeAndSuggestCleanup(stats);
  }

  /**
   * 预测性缓存清理分析
   */
  private analyzeAndSuggestCleanup(stats: any): void {
    const suggestions: string[] = [];
    
    // 分析缓存命中率
    const hitRate = parseFloat(stats.hitRate.replace('%', ''));
    if (hitRate < 50 && stats.totalRequests > 20) {
      suggestions.push('LOW_HIT_RATE: Consider reviewing task validation logic or caching strategy');
    }
    
    // 分析内存使用
    const memoryUsagePercent = this.memoryPressureLevel;
    if (memoryUsagePercent > 2) {
      suggestions.push('HIGH_MEMORY: Immediate aggressive cleanup recommended');
    } else if (memoryUsagePercent > 1) {
      suggestions.push('MODERATE_MEMORY: Proactive cleanup suggested');
    }
    
    // 分析任务价值分布
    const avgValueScore = stats.taskStats.averageValueScore;
    if (avgValueScore < 40 && stats.tasksInMemory > 100) {
      suggestions.push('LOW_VALUE_TASKS: Many tasks have low value scores, consider cleanup');
    }
    
    // 预测未来内存需求
    const memoryTrend = this.predictMemoryTrend();
    if (memoryTrend > 0.8) {
      suggestions.push('MEMORY_TREND: Memory usage trending upward, preemptive cleanup advised');
    }
    
    if (suggestions.length > 0) {
      console.log('🤖 Predictive Cleanup Suggestions:');
      suggestions.forEach(suggestion => console.log(`   • ${suggestion}`));
      
      // 自动执行建议的清理
      this.executeAutomaticCleanup(suggestions);
    }
  }

  /**
   * 预测内存使用趋势
   */
  private predictMemoryTrend(): number {
    // 简单的线性趋势预测
    const currentUsage = process.memoryUsage().heapUsed;
    const maxUsage = this.maxMemoryUsage;
    
    // 基于当前任务增长率和内存使用率预测
    const taskGrowthRate = this.tasks.size / Math.max(1, (Date.now() - this.cacheStats.lastResetTime) / (60 * 60 * 1000)); // tasks per hour
    const projectedTasks = this.tasks.size + (taskGrowthRate * 2); // 2 hours ahead
    const avgTaskMemory = this.tasks.size > 0 ? currentUsage / this.tasks.size : 0;
    const projectedMemory = projectedTasks * avgTaskMemory;
    
    return Math.min(1, projectedMemory / maxUsage);
  }

  /**
   * 执行自动清理建议
   */
  private executeAutomaticCleanup(suggestions: string[]): void {
    let cleanupPerformed = false;
    
    for (const suggestion of suggestions) {
      if (suggestion.startsWith('HIGH_MEMORY') || suggestion.startsWith('MEMORY_TREND')) {
        console.log('🧹 Executing automatic aggressive cleanup due to memory concerns');
        this.aggressiveCleanup();
        cleanupPerformed = true;
        break;
      }
    }
    
    if (!cleanupPerformed) {
      for (const suggestion of suggestions) {
        if (suggestion.startsWith('LOW_VALUE_TASKS') || suggestion.startsWith('MODERATE_MEMORY')) {
          console.log('🧹 Executing automatic smart cleanup based on task value');
          this.performIntelligentCleanup();
          cleanupPerformed = true;
          break;
        }
      }
    }
    
    if (cleanupPerformed) {
      console.log('✅ Automatic cleanup completed');
    }
  }

  /**
   * 智能预加载建议
   */
  private suggestPreloading(): string[] {
    const suggestions: string[] = [];
    
    // 分析访问模式
    const recentlyAccessedTasks = Array.from(this.taskAccessTimes.entries())
      .filter(([_, accessTime]) => Date.now() - accessTime < 24 * 60 * 60 * 1000) // 24小时内
      .sort((a, b) => b[1] - a[1]) // 按访问时间排序
      .slice(0, 10); // 前10个
    
    if (recentlyAccessedTasks.length > 5) {
      suggestions.push('FREQUENT_ACCESS: Consider implementing predictive preloading for frequently accessed tasks');
    }
    
    // 分析查询模式
    const highValueTasks = Array.from(this.taskValueScore.entries())
      .filter(([_, score]) => score > 70)
      .length;
    
    if (highValueTasks > 20) {
      suggestions.push('HIGH_VALUE_CACHE: Large number of high-value tasks suggest good caching effectiveness');
    }
    
    return suggestions;
  }

  private cleanupOrphanedConnections(): void {
    for (const [taskId, connectionCount] of this.clientConnections.entries()) {
      if (connectionCount === 0 && !this.runningTasks.has(taskId)) {
        this.clientConnections.delete(taskId);
      }
    }
  }

  private async saveTaskToDatabase(taskId: string, statusData?: any): Promise<void> {
    const context = createErrorContext('save-task-to-database', taskId);
    
    await withErrorRecovery(async () => {
      if (!this.db) {
        throw new Error('Database not available');
      }
      
      const task = this.tasks.get(taskId);
      const outputs = this.taskOutputs.get(taskId) || [];
      const requestParams = this.taskParams.get(taskId);
      
      if (task && requestParams) {
        if (statusData && 'saveTaskWithStatus' in this.db) {
          await this.db.saveTaskWithStatus(taskId, task, outputs, requestParams, statusData);
        } else {
          await this.db.saveTask(taskId, task, outputs, requestParams);
        }
      } else {
        console.warn(`Cannot save task ${taskId} to database:`, {
          hasTask: !!task,
          hasRequestParams: !!requestParams,
          taskStatus: task?.status,
          outputCount: outputs.length
        });
      }
    }, context, async () => {
      // Fallback: Log to console only
      console.warn(`Database save failed for task ${taskId}, continuing without persistence`);
    });
  }

  generateTaskId(allParams: Record<string, any>): string {
    const userMessageId = allParams.userMessageId;
    if (userMessageId && typeof userMessageId === 'string' && userMessageId.trim() !== '') {
      console.log(`Using userMessageId as task ID: ${userMessageId}`);
      return userMessageId.trim();
    }
    
    console.log('No userMessageId found, generating task ID from parameters');
    
    // 标准化参数格式，确保一致的TaskID生成
    const normalizeModelString = (model: any): string => {
      if (!model) return '';
      if (typeof model === 'string') return model.trim();
      if (Array.isArray(model)) return model.map(m => String(m).trim()).sort().join(',');
      return String(model).trim();
    };
    
    const normalizeBooleanParam = (param: any): boolean => {
      if (typeof param === 'boolean') return param;
      if (typeof param === 'string') return param.toLowerCase() !== 'false';
      return Boolean(param);
    };
    
    const fingerprint = {
      query: (allParams.query || '').trim().toLowerCase(),
      language: (allParams.language || 'zh-CN').trim().toLowerCase(),
      maxResult: Number(allParams.maxResult) || 50,
      enableCitationImage: normalizeBooleanParam(allParams.enableCitationImage),
      enableReferences: normalizeBooleanParam(allParams.enableReferences),
      aiProvider: (allParams.aiProvider || '').trim(),
      thinkingModel: normalizeModelString(allParams.thinkingModel),
      taskModel: normalizeModelString(allParams.taskModel),
      searchProvider: (allParams.searchProvider || '').trim(),
      userId: (allParams.userId || '').trim(),
      topicId: (allParams.topicId || '').trim(),
      mode: (allParams.mode || '').trim(),
      dataBaseUrl: (allParams.dataBaseUrl || '').trim(),
    };
    
    const str = JSON.stringify(fingerprint, Object.keys(fingerprint).sort());
    const hash = crypto.createHash('sha256').update(str, 'utf8').digest('hex');
    
    console.log(`Generated TaskID from fingerprint:`, {
      fingerprintSize: str.length,
      taskId: hash.substring(0, 16) + '...',
      normalizedParams: {
        thinkingModel: fingerprint.thinkingModel,
        taskModel: fingerprint.taskModel,
        query: fingerprint.query.substring(0, 50) + '...'
      }
    });
    
    return hash.substring(0, 32);
  }

  async getTask(taskId: string): Promise<TaskProgress | null> {
    // 记录任务访问
    this.recordTaskAccess(taskId);
    
    // 首先检查内存中的运行中任务
    const memoryTask = this.tasks.get(taskId);
    if (memoryTask && memoryTask.status === 'running') {
      return memoryTask;
    }
    
    // 从数据库获取已完成的任务
    if (this.db) {
      try {
        const dbTask = await this.db.getTask(taskId);
        if (dbTask && dbTask.progress) {
          // 转换数据库格式到内存格式
          return {
            step: dbTask.currentStep || dbTask.progress.step || 'unknown',
            percentage: dbTask.progress.percentage || 0,
            status: dbTask.progress.status as 'running' | 'paused' | 'completed' | 'failed',
            messages: (dbTask.outputs?.messages) || dbTask.progress.messages || [],
            timestamp: dbTask.lastSaved || dbTask.progress.timestamp || new Date().toISOString()
          };
        }
      } catch (error) {
        console.error(`Error getting task ${taskId} from database:`, error);
      }
    }
    
    return null;
  }

  getDatabase() {
    return this.db;
  }

  /**
   * 设置任务为完成状态（保存到内存和数据库）
   */
  setTaskCompleted(taskId: string, messages: string[]): void {
    // 保存到内存
    this.tasks.set(taskId, {
      step: 'final-report',
      percentage: 100,
      status: 'completed',
      messages,
      timestamp: new Date().toISOString()
    });
    
    // 同时保存到taskOutputs Map中，保持向后兼容
    this.taskOutputs.set(taskId, messages);
    
    // 确保有最基本的请求参数，否则数据库保存会失败
    if (!this.taskParams.has(taskId)) {
      // 提供默认的请求参数以避免数据库保存错误
      this.taskParams.set(taskId, {
        query: 'Unknown', // 从messages中可能可以推断，但现在用默认值
        language: 'zh-CN',
        aiProvider: 'unknown',
        thinkingModel: 'unknown',
        taskModel: 'unknown',
        searchProvider: 'unknown',
        maxResult: 50,
        enableCitationImage: true,
        enableReferences: true
      });
    }
    
    // 异步保存到数据库（不阻塞响应）
    const statusData = {
      currentStep: 'final-report',
      stepStatus: 'completed',
      finishReason: 'stop',
      isValidComplete: true,
      lastStepCompletedAt: new Date().toISOString()
    };
    
    this.saveTaskToDatabase(taskId, statusData).catch(error => {
      console.error(`Failed to save completed task ${taskId} to database:`, error);
    });
  }

  /**
   * 设置任务为完成状态（带配置参数，用于SSE Handler）
   */
  setTaskCompletedWithConfig(taskId: string, messages: string[], config: any): void {
    // 保存到内存
    this.tasks.set(taskId, {
      step: 'final-report',
      percentage: 100,
      status: 'completed',
      messages,
      timestamp: new Date().toISOString()
    });
    
    // 同时保存到taskOutputs Map中，保持向后兼容
    this.taskOutputs.set(taskId, messages);
    
    // 保存真实的请求参数
    this.taskParams.set(taskId, config);
    
    // 异步保存到数据库（不阻塞响应）
    const statusData = {
      currentStep: 'final-report',
      stepStatus: 'completed',
      finishReason: 'stop',
      isValidComplete: true,
      lastStepCompletedAt: new Date().toISOString()
    };
    
    this.saveTaskToDatabase(taskId, statusData).catch(error => {
      console.error(`Failed to save completed task ${taskId} to database:`, error);
    });
  }

  /**
   * 获取任务输出 - 从数据库获取已完成任务的输出
   */
  async getTaskOutput(taskId: string): Promise<string[]> {
    // 优先从内存获取运行中任务的输出
    const memoryOutputs = this.taskOutputs.get(taskId);
    if (memoryOutputs) {
      return memoryOutputs;
    }
    
    // 从内存TaskProgress获取运行中任务
    const memoryTask = this.tasks.get(taskId);
    if (memoryTask && memoryTask.messages) {
      return memoryTask.messages;
    }
    
    // 从数据库获取已完成任务的输出
    if (this.db) {
      try {
        const dbTask = await this.db.getTask(taskId);
        if (dbTask && dbTask.outputs) {
          // 处理数据库格式转换后的数据结构
          if (Array.isArray(dbTask.outputs)) {
            // 转换后的格式：outputs直接是string[]数组
            return dbTask.outputs;
          } else if (dbTask.outputs.messages && Array.isArray(dbTask.outputs.messages)) {
            // 原始数据库格式：outputs是{messages: string[]}对象
            return dbTask.outputs.messages;
          }
        }
      } catch (error) {
        console.error(`Error getting task output ${taskId} from database:`, error);
      }
    }
    
    return [];
  }

  /**
   * 异步版本的任务验证 - 从数据库验证任务状态
   */
  async getTaskValidationResult(taskId: string, forceRestart: boolean = false): Promise<'valid' | 'running' | 'invalid'> {
    const startTime = performance.now();
    this.cacheStats.totalRequests++;
    
    try {
      // 如果强制重新开始，直接返回invalid来触发新任务
      if (forceRestart) {
        console.log(`Task ${taskId}: Force restart requested`);
        this.recordCacheMiss();
        return 'invalid';
      }

      // 首先检查内存中的运行中任务
      const memoryTask = this.tasks.get(taskId);
      if (memoryTask && memoryTask.status === 'running') {
        this.recordCacheHit();
        return 'running';
      }
      
      // 从数据库检查已完成的任务
      if (!this.db) {
        console.log(`Task ${taskId}: Database not available, cannot validate`);
        this.recordCacheMiss();
        return 'invalid';
      }
      
      const dbTask = await this.db.getTask(taskId);
      if (!dbTask || !dbTask.progress) {
        this.recordCacheMiss();
        return 'invalid';
      }
      
      // 检查任务是否正在运行
      if (dbTask.progress.status === 'running') {
        this.recordCacheHit();
        return 'running';
      }
      
      const result = this.validateTaskCompleteness(taskId, dbTask);
      
      // 记录缓存统计
      if (result === 'valid') {
        this.recordCacheHit();
      } else {
        this.recordCacheMiss();
      }
      
      return result;
      
    } catch (error) {
      console.error(`Error validating task ${taskId}:`, error);
      this.recordCacheMiss();
      return 'invalid';
    } finally {
      // 更新验证时间统计
      const validationTime = performance.now() - startTime;
      this.updateValidationTimeStats(validationTime);
    }
  }

  /**
   * 验证任务完整性的统一方法
   */
  private validateTaskCompleteness(taskId: string, dbTask: any): 'valid' | 'invalid' {
    // 使用统一的数据格式转换
    const outputMessages = this.normalizeTaskOutputs(dbTask.outputs);
    
    if (dbTask.progress.status === 'completed' && outputMessages.length > 0) {
      // 检查是否包含有效的final-report内容
      const allOutputContent = outputMessages.join('');
      const hasStartTag = allOutputContent.includes('<final-report>');
      const hasEndTag = allOutputContent.includes('</final-report>');
      const hasSubstantialContent = allOutputContent.length > 1000;
      const hasValidFinalReport = hasStartTag && hasEndTag && hasSubstantialContent;
      
      if (hasValidFinalReport) {
        console.log(`Task ${taskId}: Valid completed task found with final-report`);
        return 'valid';
      } else {
        console.log(`Task ${taskId}: Completed task found but invalid final-report - tags: ${hasStartTag}/${hasEndTag}, length: ${allOutputContent.length}`);
        return 'invalid';
      }
    }
    
    console.log(`Task ${taskId}: Task not completed or no outputs`, {
      status: dbTask.progress.status,
      outputCount: outputMessages.length
    });
    return 'invalid';
  }

  /**
   * 统一的数据输出格式转换方法
   */
  private normalizeTaskOutputs(outputs: any): string[] {
    if (!outputs) return [];
    
    if (Array.isArray(outputs)) {
      return outputs.map((item: any) => String(item));
    }
    
    if (typeof outputs === 'object' && outputs.messages && Array.isArray(outputs.messages)) {
      return outputs.messages.map((item: any) => String(item));
    }
    
    if (typeof outputs === 'string') {
      return [outputs];
    }
    
    console.warn('Unexpected outputs format in BackgroundTaskManager', { outputsType: typeof outputs });
    return [];
  }

  /**
   * 获取任务锁（防止并发创建相同任务）
   */
  private async acquireTaskLock(taskId: string): Promise<void> {
    const existingLock = this.taskLocks.get(taskId);
    if (existingLock) {
      // 等待现有的锁释放
      await existingLock;
    }
    
    // 创建新的锁
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    
    this.taskLocks.set(taskId, lockPromise);
    
    // 将释放函数绑定到锁对象上，以便后续调用
    (lockPromise as any).release = releaseLock!;
  }

  /**
   * 释放任务锁
   */
  private releaseTaskLock(taskId: string): void {
    const lock = this.taskLocks.get(taskId);
    if (lock && (lock as any).release) {
      (lock as any).release();
      this.taskLocks.delete(taskId);
    }
  }

  /**
   * 清理过期的任务锁和状态
   */
  private cleanupExpiredTasks(): void {
    const now = Date.now();
    const maxTaskTime = 30 * 60 * 1000; // 30分钟超时
    
    for (const [taskId, startTime] of this.taskStartTimes.entries()) {
      if (now - startTime > maxTaskTime) {
        console.warn(`Task ${taskId} exceeded maximum time limit, cleaning up`);
        
        // 清理相关状态
        this.runningTasks.delete(taskId);
        this.taskStartTimes.delete(taskId);
        this.releaseTaskLock(taskId);
        
        // 更新任务状态为失败
        this.updateTaskProgress(taskId, {
          status: 'failed',
          error: 'Task exceeded maximum execution time'
        });
      }
    }
  }

  // Legacy V2 database methods removed - using PostgreSQL only

  /**
   * 智能判断任务状态，决定是否可以直接返回缓存结果
   * 返回值：
   * - 'valid': 可以直接返回
   * - 'running': 任务正在运行中 
   * - 'invalid': 任务无效，需要归档重试
   */


  // PostgreSQL数据库版本已删除 - 使用上面的简化内存缓存版本

  /**
   * 向后兼容的方法
   */
  async isTaskValidForDirectReturn(taskId: string): Promise<boolean> {
    return (await this.getTaskValidationResult(taskId)) === 'valid';
  }

  // PostgreSQL数据库版本已删除 - 使用上面的增强内存缓存版本

  /**
   * 归档无效任务，为重新执行做准备
   */
  async archiveInvalidTask(taskId: string, reason: string): Promise<void> {
    const context = createErrorContext('archive-invalid-task', taskId);
    
    await withErrorRecovery(async () => {
      if (!this.db) {
        console.warn(`Cannot archive task ${taskId}: Database not available`);
        return;
      }
      
      // 归档数据库中的任务（重命名为带时间戳的ID）
      this.db.archiveTask(taskId);
      
      // 清理内存中的任务状态
      this.tasks.delete(taskId);
      this.taskOutputs.delete(taskId);
      this.taskParams.delete(taskId);
      this.runningTasks.delete(taskId);
      this.clientConnections.delete(taskId);
      
      console.log(`Task ${taskId} archived due to: ${reason}`);
      
    }, context, async () => {
      console.error(`Failed to archive task ${taskId}, continuing without archiving`);
    });
  }

  setTaskParams(taskId: string, params: any): void {
    this.taskParams.set(taskId, params);
  }

  private async addTaskOutput(taskId: string, output: string): Promise<void> {
    const outputs = this.taskOutputs.get(taskId) || [];
    outputs.push(output);
    this.taskOutputs.set(taskId, outputs);
    
    await this.saveTaskToDatabase(taskId);
  }

  private updateMemoryPressureLevel(memoryUsage: NodeJS.MemoryUsage): void {
    const usagePercent = (memoryUsage.heapUsed / this.maxMemoryUsage) * 100;
    
    if (usagePercent < 50) {
      this.memoryPressureLevel = 0; // Normal
    } else if (usagePercent < 65) {
      this.memoryPressureLevel = 1; // Warning
    } else if (usagePercent < 80) {
      this.memoryPressureLevel = 2; // Critical
    } else {
      this.memoryPressureLevel = 3; // Emergency
    }
  }

  private async performGradualCleanup(): Promise<boolean> {
    const startMemory = process.memoryUsage().heapUsed;
    let cleaned = false;

    switch (this.memoryPressureLevel) {
      case 1: // Warning - light cleanup
        await this.cleanupLargeOutputs();
        this.cleanupOrphanedConnections();
        cleaned = true;
        break;
        
      case 2: // Critical - moderate cleanup
        this.cleanupOldTasks();
        await this.cleanupLargeOutputs();
        this.cleanupOrphanedConnections();
        // Remove completed tasks older than 24 hours (instead of 2 hours for better caching)
        const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
        for (const [taskId, task] of this.tasks.entries()) {
          if (task.status === 'completed' && 
              new Date(task.timestamp).getTime() < twentyFourHoursAgo) {
            console.log(`清理超过24小时的已完成任务: ${taskId.substring(0, 16)}...`);
            this.deleteTask(taskId);
          }
        }
        cleaned = true;
        break;
        
      case 3: // Emergency - aggressive cleanup
        this.aggressiveCleanup();
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        cleaned = true;
        break;
        
      default:
        // Normal - no cleanup needed
        break;
    }

    const endMemory = process.memoryUsage().heapUsed;
    const freed = startMemory - endMemory;
    
    if (cleaned && freed > 0) {
      console.log(`Gradual cleanup freed ${Math.round(freed / 1024 / 1024)}MB (pressure level: ${this.memoryPressureLevel})`);
    }
    
    return cleaned;
  }

  async startBackgroundTask(
    taskId: string,
    deepResearchInstance: any,
    query: string,
    enableCitationImage: boolean,
    enableReferences: boolean,
    requestParams: any,
    externalOnMessage?: (event: string, data: any) => void  // 新增：外部回调支持
  ): Promise<void> {
    // 增强的并发控制和原子性检查
    await this.acquireTaskLock(taskId);
    
    try {
      // 双重检查防止并发创建相同任务
      if (this.runningTasks.has(taskId)) {
        console.log(`Task ${taskId} already running, skipping duplicate start`);
        return;
      }
      
      // 检查并发任务数量限制
      if (this.runningTasks.size >= this.concurrentTasksLimit) {
        throw new Error(`Maximum concurrent tasks (${this.concurrentTasksLimit}) reached. Please wait for other tasks to complete.`);
      }
      
      // 最后一次验证任务状态，防止重复执行已完成的任务
      const validationResult = await this.getTaskValidationResult(taskId);
      if (validationResult === 'valid') {
        console.log(`Task ${taskId} is already valid, will not restart`);
        return;
      }
      
      this.taskStartTimes.set(taskId, Date.now());
      console.log(`Starting background task ${taskId} (${this.runningTasks.size + 1}/${this.concurrentTasksLimit} slots)`);
      
    } finally {
      this.releaseTaskLock(taskId);
    }

    // Smart memory management with gradual cleanup
    const memoryUsage = process.memoryUsage();
    this.updateMemoryPressureLevel(memoryUsage);
    
    // Try gradual cleanup first based on pressure level
    if (this.memoryPressureLevel > 0) {
      console.log(`Memory pressure detected (level ${this.memoryPressureLevel}), performing gradual cleanup`);
      await this.performGradualCleanup();
      
      // Re-evaluate after cleanup
      const newMemoryUsage = process.memoryUsage();
      this.updateMemoryPressureLevel(newMemoryUsage);
      
      // If still in emergency state, deny the request
      if (this.memoryPressureLevel >= 3) {
        throw new Error(`System memory usage too high to start new task (pressure level: ${this.memoryPressureLevel})`);
      }
    }

    // Check task limits
    if (this.tasks.size >= this.maxTasks) {
      this.cleanupOldTasks();
      if (this.tasks.size >= this.maxTasks) {
        throw new Error('Maximum task limit reached');
      }
    }

    this.taskParams.set(taskId, requestParams);

    this.tasks.set(taskId, {
      step: 'initializing',
      percentage: 0,
      status: 'running',
      messages: [],
      timestamp: new Date().toISOString()
    });

    this.taskOutputs.set(taskId, []);

    // 创建统一的onMessage处理器，支持多个回调
    deepResearchInstance.onMessage = async (event: string, data: any) => {
      // 1. 调用外部回调（SSE处理器）
      if (externalOnMessage) {
        externalOnMessage(event, data);
      }
      
      // 2. 执行我们的数据库保存逻辑
      if (event === "message") {
        await this.addTaskOutput(taskId, data.text);
        await this.updateTaskProgress(taskId, {
          messages: [data.text]
        });
      } else if (event === "progress") {
        const percentage = this.calculateProgress(data.step, data.status);
        
        // 准备状态数据
        const statusData: {
          currentStep: any;
          stepStatus: string;
          lastStepCompletedAt: string | undefined;
          finishReason?: string;
          isValidComplete?: boolean;
        } = {
          currentStep: data.step,
          stepStatus: data.status === 'end' ? 'completed' : 'running',
          lastStepCompletedAt: data.status === 'end' ? new Date().toISOString() : undefined
        };
        
        // 如果是最终报告完成且有结果数据，提取finishReason
        if (data.step === 'final-report' && data.status === 'end' && data.data?.finishReason) {
          statusData.finishReason = data.data.finishReason;
          statusData.isValidComplete = data.data.finishReason === 'stop';
        }
        
        // 根据步骤和状态决定任务总体状态
        const taskStatus = (data.step === 'final-report' && data.status === 'end') ? 'completed' : 'running';
        
        await this.updateTaskProgress(taskId, {
          step: data.step,
          percentage,
          status: taskStatus
        });
        
        // 保存状态信息到数据库
        await this.saveTaskToDatabase(taskId, statusData);
        
      } else if (event === "error") {
        const statusData = {
          currentStep: this.tasks.get(taskId)?.step || 'unknown',
          stepStatus: 'failed',
          finishReason: 'error',
          isValidComplete: false,
          lastStepCompletedAt: new Date().toISOString()
        };
        
        await this.updateTaskProgress(taskId, {
          status: 'failed',
          error: data.message || 'Unknown error'
        });
        
        // 保存错误状态
        await this.saveTaskToDatabase(taskId, statusData);
      }
    };

    const taskPromise = deepResearchInstance.start(query, enableCitationImage, enableReferences)
      .then(async (result: any) => {
        await this.updateTaskProgress(taskId, {
          status: 'completed',
          percentage: 100,
          result,
          timestamp: new Date().toISOString()
        });
        this.runningTasks.delete(taskId);
        this.taskStartTimes.delete(taskId);
        this.releaseTaskLock(taskId);
        
        logger.getInstance('BackgroundTaskManager').info('Background task completed', { 
          taskId, 
          runningTasks: this.runningTasks.size,
          availableSlots: this.concurrentTasksLimit - this.runningTasks.size
        });
      })
      .catch(async (error: any) => {
        await this.updateTaskProgress(taskId, {
          status: 'failed',
          error: error.message || 'Unknown error',
          timestamp: new Date().toISOString()
        });
        this.runningTasks.delete(taskId);
        this.taskStartTimes.delete(taskId);
        this.releaseTaskLock(taskId);
        
        logger.getInstance('BackgroundTaskManager').error('Background task failed', error, { 
          taskId,
          runningTasks: this.runningTasks.size,
          availableSlots: this.concurrentTasksLimit - this.runningTasks.size
        });
        
        // 检查是否为关键系统故障
        this.checkAndNotifyCriticalFailure(taskId, error, requestParams);
      });

    this.runningTasks.set(taskId, taskPromise);
    logger.getInstance('BackgroundTaskManager').info('Background task started', { taskId });
  }

  private async updateTaskProgress(taskId: string, updates: Partial<TaskProgress>): Promise<void> {
    const current = this.tasks.get(taskId);
    if (current) {
      const updated = {
        ...current,
        ...updates,
        timestamp: new Date().toISOString()
      };
      this.tasks.set(taskId, updated);
      
      await this.saveTaskToDatabase(taskId);
    }
  }

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

  isTaskRunning(taskId: string): boolean {
    return this.runningTasks.has(taskId);
  }

  registerClient(taskId: string): void {
    const currentCount = this.clientConnections.get(taskId) || 0;
    
    // Check connection limits
    if (currentCount >= this.maxConnectionsPerTask) {
      throw new Error(`Maximum connections per task (${this.maxConnectionsPerTask}) exceeded`);
    }
    
    // Check overall connection limits
    const totalConnections = Array.from(this.clientConnections.values())
      .reduce((sum, count) => sum + count, 0);
    
    if (totalConnections > this.maxTasks * 2) {
      // If we have too many total connections, clean up old ones
      this.cleanupOrphanedConnections();
      throw new Error('Too many active connections, please try again later');
    }
    
    this.clientConnections.set(taskId, currentCount + 1);
  }

  unregisterClient(taskId: string): void {
    const count = this.clientConnections.get(taskId) || 0;
    if (count > 1) {
      this.clientConnections.set(taskId, count - 1);
    } else {
      this.clientConnections.delete(taskId);
    }
  }

  getClientCount(taskId: string): number {
    return this.clientConnections.get(taskId) || 0;
  }

  deleteTask(taskId: string): void {
    this.tasks.delete(taskId);
    this.taskOutputs.delete(taskId);
    this.taskParams.delete(taskId);
    this.runningTasks.delete(taskId);
    this.taskStartTimes.delete(taskId);
    this.releaseTaskLock(taskId);
    this.clientConnections.delete(taskId);
    
    try {
      if (this.db) {
        this.db.deleteTask(taskId);
      }
    } catch (error) {
      console.error(`Failed to delete task ${taskId} from database:`, error instanceof Error ? error : new Error(String(error)));
    }
  }

  getStats(): {
    totalTasks: number;
    runningTasks: number;
    completedTasks: number;
    failedTasks: number;
    totalConnections: number;
    memoryUsage: NodeJS.MemoryUsage;
    health: 'healthy' | 'warning' | 'critical';
  } {
    let running = 0;
    let completed = 0;
    let failed = 0;
    
    for (const task of this.tasks.values()) {
      switch (task.status) {
        case 'running':
          running++;
          break;
        case 'completed':
          completed++;
          break;
        case 'failed':
          failed++;
          break;
      }
    }

    const totalConnections = Array.from(this.clientConnections.values())
      .reduce((sum, count) => sum + count, 0);

    const memoryUsage = process.memoryUsage();
    const memoryUsagePercent = (memoryUsage.heapUsed / this.maxMemoryUsage) * 100;
    
    let health: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (memoryUsagePercent > 90) {
      health = 'critical';
    } else if (memoryUsagePercent > 80) {
      health = 'warning';
    }

    return {
      totalTasks: this.tasks.size,
      runningTasks: running,
      completedTasks: completed,
      failedTasks: failed,
      totalConnections,
      memoryUsage,
      health
    };
  }

  performHealthCheck(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    stats: ReturnType<typeof BackgroundTaskManager.prototype.getStats>;
  } {
    const stats = this.getStats();
    const issues: string[] = [];

    // Memory checks
    const memoryUsagePercent = (stats.memoryUsage.heapUsed / this.maxMemoryUsage) * 100;
    if (memoryUsagePercent > 90) {
      issues.push('Memory usage critically high');
    } else if (memoryUsagePercent > 80) {
      issues.push('Memory usage high');
    }

    // Task count checks
    if (stats.totalTasks > this.maxTasks * 0.9) {
      issues.push('Task count approaching limit');
    }

    // Connection checks
    if (stats.totalConnections > this.maxTasks * 1.5) {
      issues.push('High number of active connections');
    }

    // Failed task checks
    const failedTaskRate = stats.failedTasks / Math.max(stats.totalTasks, 1);
    if (failedTaskRate > 0.1) {
      issues.push('High task failure rate');
    }

    return {
      status: stats.health,
      issues,
      stats
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    if (this.db) {
      this.db.close();
    }
    
    this.tasks.clear();
    this.runningTasks.clear();
    this.taskOutputs.clear();
    this.taskParams.clear();
    this.clientConnections.clear();
  }
  // 检查和通知关键系统故障
  private checkAndNotifyCriticalFailure(taskId: string, error: any, params: TaskRequestParams): void {
    try {
      const errorMessage = error?.message || 'Unknown error';
      const failureCount = this.getRecentFailureCount();
      
      // 判断是否为关键系统故障
      const isCriticalFailure = this.isCriticalSystemFailure(error, failureCount);
      
      if (isCriticalFailure) {
        logger.getInstance('BackgroundTaskManager').warn('检测到关键系统故障，发送警报', {
          taskId,
          errorMessage,
          failureCount,
          provider: params.aiProvider
        });

        this.notificationService.sendAsync({
          title: '🚨 背景任务管理器关键故障',
          content: this.formatTaskFailureAlert(taskId, error, params, failureCount),
          level: 'critical',
          source: 'Background Task Manager',
          tags: ['background-task-failure', 'critical', 'system-failure'],
          extra: {
            taskId,
            errorMessage,
            failureCount,
            aiProvider: params.aiProvider,
            searchProvider: params.searchProvider,
            query: params.query.substring(0, 100),
            detectedAt: new Date().toISOString()
          }
        });
      }
    } catch (notificationError) {
      // 通知发送失败不应该影响主流程
      logger.getInstance('BackgroundTaskManager').warn('背景任务故障通知发送失败', {
        taskId,
        error: notificationError instanceof Error ? notificationError.message : String(notificationError)
      });
    }
  }

  // 判断是否为关键系统故障
  private isCriticalSystemFailure(error: any, recentFailureCount: number): boolean {
    const errorMessage = error?.message || '';
    
    // 关键故障条件
    const criticalPatterns = [
      /all.*models.*failed/i,
      /system.*unavailable/i,
      /critical.*error/i,
      /connection.*refused/i,
      /timeout.*exceeded/i,
      /memory.*exhausted/i
    ];

    // 检查错误模式
    const hasCriticalPattern = criticalPatterns.some(pattern => pattern.test(errorMessage));
    
    // 检查失败频率 (5分钟内失败超过3次)
    const hasHighFailureRate = recentFailureCount >= 3;
    
    return hasCriticalPattern || hasHighFailureRate;
  }

  // 获取最近的失败次数
  private getRecentFailureCount(): number {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    let failureCount = 0;
    
    for (const [, task] of this.tasks.entries()) {
      if (task.status === 'failed' && 
          new Date(task.timestamp).getTime() > fiveMinutesAgo) {
        failureCount++;
      }
    }
    
    return failureCount;
  }

  // 格式化任务失败警报消息
  private formatTaskFailureAlert(taskId: string, error: any, params: TaskRequestParams, failureCount: number): string {
    const timestamp = new Date().toLocaleString('zh-CN');
    const errorMessage = error?.message || 'Unknown error';
    
    return `背景任务管理器检测到关键系统故障。

🔴 **影响范围**: 深度研究任务执行系统
📋 **失败任务ID**: ${taskId}
🔢 **近期失败次数**: ${failureCount} 次 (5分钟内)
🔧 **AI提供商**: ${params.aiProvider}
🔍 **搜索提供商**: ${params.searchProvider}
📝 **查询内容**: ${params.query.substring(0, 100)}${params.query.length > 100 ? '...' : ''}
❌ **错误详情**: ${errorMessage}
🕐 **检测时间**: ${timestamp}

⚠️ **需要立即处理**: 
- 检查AI提供商和搜索引擎服务状态
- 验证API密钥和配额
- 检查系统资源使用情况
- 查看详细错误日志定位问题`;
  }
}

export default BackgroundTaskManager;