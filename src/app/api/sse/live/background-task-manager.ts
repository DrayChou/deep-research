/**
 * Background Task Manager - Manages background research tasks
 * Separated from the main route for better organization
 */

import { logger } from "@/utils/logger";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as os from "node:os";
import TaskDatabase from "./task-database";
import { withErrorRecovery, createErrorContext } from "./error-handler";

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
  private db!: TaskDatabase;
  
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
    this.initializeMemorySettings();
    this.initializeDatabaseSync();
    this.loadTasksFromDatabase();
    this.startCleanupProcess();
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

  private initializeDatabaseSync(): void {
    try {
      console.log('Initializing BackgroundTaskManager database...');
      this.db = new TaskDatabase(this.storageDir);
      console.log('✓ BackgroundTaskManager database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize BackgroundTaskManager database:', error);
      logger.getInstance('BackgroundTaskManager').error('Database initialization failed', error instanceof Error ? error : new Error(String(error)));
      throw error;
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

  private async loadTasksFromDatabase(): Promise<void> {
    const context = createErrorContext('load-tasks-from-database');
    
    await withErrorRecovery(async () => {
      if (!this.db) {
        console.log('Database not available, skipping task loading');
        return;
      }
      
      const allTasks = this.db.getAllTasks();
      for (const task of allTasks) {
        // Check memory limits
        if (this.tasks.size >= this.maxTasks) {
          this.cleanupOldTasks();
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
      console.log(`Loaded ${this.tasks.size} tasks from database`);
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
    
    // Log memory stats every minute in development
    if (process.env.NODE_ENV === 'development') {
      setInterval(() => {
        const memUsage = process.memoryUsage();
        this.updateMemoryPressureLevel(memUsage);
        if (this.memoryPressureLevel > 0) {
          console.log(`[Memory Monitor] Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(this.maxMemoryUsage / 1024 / 1024)}MB (Level: ${this.memoryPressureLevel})`);
        }
      }, 60 * 1000); // Every minute
    }
  }

  private performCleanup(): void {
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
      const cleanupPerformed = this.performGradualCleanup();
      
      if (!cleanupPerformed) {
        // Normal maintenance cleanup
        this.cleanupOldTasks();
        this.cleanupOrphanedConnections();
        this.cleanupLargeOutputs();
      }

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
      console.error('Cleanup process failed:', error);
    }
  }

  private aggressiveCleanup(): void {
    console.log('Performing aggressive cleanup...');
    
    // Remove all completed tasks older than 1 day
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const tasksToDelete: string[] = [];
    
    for (const [taskId, task] of this.tasks.entries()) {
      const taskAge = Date.now() - new Date(task.timestamp).getTime();
      if (task.status === 'completed' && taskAge > oneDayAgo) {
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

  private cleanupLargeOutputs(): void {
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
              this.db.saveTask(taskId, task, trimmedOutputs, requestParams);
            }
          }
        } catch (error) {
          console.error(`Failed to save trimmed outputs for task ${taskId}:`, error);
        }
      }
    }
  }

  private cleanupOldTasks(): void {
    if (this.tasks.size <= this.maxTasks * 0.8) return;

    const tasksToDelete: string[] = [];
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    for (const [taskId, task] of this.tasks.entries()) {
      const taskAge = now - new Date(task.timestamp).getTime();
      if (taskAge > maxAge && task.status === 'completed') {
        tasksToDelete.push(taskId);
      }
    }

    // Delete oldest tasks first
    tasksToDelete.sort((a, b) => {
      const taskA = this.tasks.get(a);
      const taskB = this.tasks.get(b);
      if (!taskA || !taskB) return 0;
      return new Date(taskA.timestamp).getTime() - new Date(taskB.timestamp).getTime();
    });

    const deleteCount = Math.min(tasksToDelete.length, this.tasks.size - this.maxTasks * 0.8);
    for (let i = 0; i < deleteCount; i++) {
      const taskId = tasksToDelete[i];
      this.deleteTask(taskId);
    }
  }

  private cleanupOrphanedConnections(): void {
    for (const [taskId, connectionCount] of this.clientConnections.entries()) {
      if (connectionCount === 0 && !this.runningTasks.has(taskId)) {
        this.clientConnections.delete(taskId);
      }
    }
  }

  private async saveTaskToDatabase(taskId: string): Promise<void> {
    const context = createErrorContext('save-task-to-database', taskId);
    
    await withErrorRecovery(async () => {
      if (!this.db) {
        throw new Error('Database not available');
      }
      
      const task = this.tasks.get(taskId);
      const outputs = this.taskOutputs.get(taskId) || [];
      const requestParams = this.taskParams.get(taskId);
      
      if (task && requestParams) {
        this.db.saveTask(taskId, task, outputs, requestParams);
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
    const fingerprint = {
      query: (allParams.query || '').trim().toLowerCase(),
      language: allParams.language || 'zh-CN',
      maxResult: Number(allParams.maxResult) || 50,
      enableCitationImage: allParams.enableCitationImage !== 'false',
      enableReferences: allParams.enableReferences !== 'false',
      aiProvider: allParams.aiProvider,
      thinkingModel: allParams.thinkingModel,
      taskModel: allParams.taskModel,
      searchProvider: allParams.searchProvider,
      userId: allParams.userId,
      topicId: allParams.topicId,
      mode: allParams.mode,
      dataBaseUrl: allParams.dataBaseUrl,
    };
    
    const str = JSON.stringify(fingerprint, Object.keys(fingerprint).sort());
    const hash = crypto.createHash('sha256').update(str, 'utf8').digest('hex');
    
    return hash.substring(0, 32);
  }

  getTask(taskId: string): TaskProgress | null {
    return this.tasks.get(taskId) || null;
  }

  getTaskOutput(taskId: string): string[] {
    return this.taskOutputs.get(taskId) || [];
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

  private performGradualCleanup(): boolean {
    const startMemory = process.memoryUsage().heapUsed;
    let cleaned = false;

    switch (this.memoryPressureLevel) {
      case 1: // Warning - light cleanup
        this.cleanupLargeOutputs();
        this.cleanupOrphanedConnections();
        cleaned = true;
        break;
        
      case 2: // Critical - moderate cleanup
        this.cleanupOldTasks();
        this.cleanupLargeOutputs();
        this.cleanupOrphanedConnections();
        // Remove completed tasks older than 2 hours
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        for (const [taskId, task] of this.tasks.entries()) {
          if (task.status === 'completed' && 
              new Date(task.timestamp).getTime() < twoHoursAgo) {
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
    requestParams: any
  ): Promise<void> {
    if (this.runningTasks.has(taskId)) {
      return;
    }

    // Smart memory management with gradual cleanup
    const memoryUsage = process.memoryUsage();
    this.updateMemoryPressureLevel(memoryUsage);
    
    // Try gradual cleanup first based on pressure level
    if (this.memoryPressureLevel > 0) {
      console.log(`Memory pressure detected (level ${this.memoryPressureLevel}), performing gradual cleanup`);
      this.performGradualCleanup();
      
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

    deepResearchInstance.onMessage = async (event: string, data: any) => {
      if (event === "message") {
        await this.addTaskOutput(taskId, data.text);
        await this.updateTaskProgress(taskId, {
          messages: [data.text]
        });
      } else if (event === "progress") {
        const percentage = this.calculateProgress(data.step, data.status);
        await this.updateTaskProgress(taskId, {
          step: data.step,
          percentage,
          status: 'running'
        });
      } else if (event === "error") {
        await this.updateTaskProgress(taskId, {
          status: 'failed',
          error: data.message || 'Unknown error'
        });
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
        logger.getInstance('BackgroundTaskManager').info('Background task completed', { taskId });
      })
      .catch(async (error: any) => {
        await this.updateTaskProgress(taskId, {
          status: 'failed',
          error: error.message || 'Unknown error',
          timestamp: new Date().toISOString()
        });
        this.runningTasks.delete(taskId);
        logger.getInstance('BackgroundTaskManager').error('Background task failed', error, { taskId });
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
    this.clientConnections.delete(taskId);
    
    try {
      if (this.db) {
        this.db.deleteTask(taskId);
      }
    } catch (error) {
      console.error(`Failed to delete task ${taskId} from database:`, error);
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
}

export default BackgroundTaskManager;