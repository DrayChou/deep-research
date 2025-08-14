/**
 * 模型轮换管理器
 * 负责管理模型的智能轮换重试策略
 */

import { Logger } from "@/utils/logger";
import { NotificationService } from "@/utils/notification";
import { notificationConfig } from "@/utils/notification/config";

export interface ModelRotationConfig {
  maxModelRetries: number; // 模型轮换次数 (默认3)
  maxMethodRetries: number; // 方法级重试次数 (默认3) 
  retryDelay: number; // 重试间隔 (毫秒)
  operation: string; // 操作名称
}

export interface ModelRotationAttempt {
  modelIndex: number;
  modelName: string;
  methodRetry: number;
  totalAttempt: number;
  isLastModel: boolean;
  isLastMethodRetry: boolean;
  isLastOverallAttempt: boolean;
}

export class ModelRotationManager {
  private logger: Logger;
  private failedModels: Set<string> = new Set();
  private modelPerformance: Map<string, {successCount: number, failureCount: number}> = new Map();

  constructor(
    private models: string[],
    private config: ModelRotationConfig,
    private operationContext: any
  ) {
    this.logger = Logger.getInstance(`ModelRotation-${config.operation}`);
    this.validateConfig();
  }

  private validateConfig(): void {
    if (this.models.length === 0) {
      throw new Error(`No models configured for operation: ${this.config.operation}`);
    }
    
    this.logger.info('Model rotation manager initialized', {
      operation: this.config.operation,
      modelCount: this.models.length,
      models: this.models,
      maxModelRetries: this.config.maxModelRetries,
      maxMethodRetries: this.config.maxMethodRetries,
      totalMaxAttempts: this.config.maxModelRetries * this.config.maxMethodRetries
    });
  }

  /**
   * 生成重试尝试序列
   * 先轮换模型（3轮），再进行方法级重试（每个模型3次）
   */
  *generateAttempts(): Generator<ModelRotationAttempt> {
    let totalAttempt = 0;
    const totalMaxAttempts = this.config.maxModelRetries * this.config.maxMethodRetries;

    // 外层循环：模型轮换
    for (let modelRound = 1; modelRound <= this.config.maxModelRetries; modelRound++) {
      // 内层循环：每个模型的方法级重试
      for (let modelIndex = 0; modelIndex < this.models.length; modelIndex++) {
        const modelName = this.models[modelIndex];
        
        // 跳过已知失败的模型（除非是最后一轮）
        if (this.failedModels.has(modelName) && modelRound < this.config.maxModelRetries) {
          this.logger.debug('Skipping known failed model', { 
            modelName, 
            modelRound, 
            failedModels: Array.from(this.failedModels) 
          });
          continue;
        }

        for (let methodRetry = 1; methodRetry <= this.config.maxMethodRetries; methodRetry++) {
          totalAttempt++;
          
          const attempt: ModelRotationAttempt = {
            modelIndex,
            modelName,
            methodRetry,
            totalAttempt,
            isLastModel: modelIndex === this.models.length - 1,
            isLastMethodRetry: methodRetry === this.config.maxMethodRetries,
            isLastOverallAttempt: totalAttempt === totalMaxAttempts
          };

          this.logger.debug('Generated attempt', {
            ...attempt,
            modelRound,
            progress: `${totalAttempt}/${totalMaxAttempts}`
          });

          yield attempt;
        }
      }
    }
  }

  /**
   * 记录模型尝试结果
   */
  recordAttemptResult(
    attempt: ModelRotationAttempt, 
    success: boolean, 
    error?: Error,
    additionalContext?: any
  ): void {
    const { modelName } = attempt;
    
    // 更新性能统计
    if (!this.modelPerformance.has(modelName)) {
      this.modelPerformance.set(modelName, { successCount: 0, failureCount: 0 });
    }
    
    const performance = this.modelPerformance.get(modelName)!;
    if (success) {
      performance.successCount++;
      // 成功时从失败列表中移除
      this.failedModels.delete(modelName);
    } else {
      performance.failureCount++;
      // 连续失败时标记为失败模型
      if (performance.failureCount >= 2) {
        this.failedModels.add(modelName);
      }
    }

    const logData = {
      ...attempt,
      success,
      error: error?.message,
      modelPerformance: Object.fromEntries(this.modelPerformance),
      failedModels: Array.from(this.failedModels),
      ...additionalContext
    };

    if (success) {
      this.logger.info('Model attempt succeeded', logData);
    } else {
      this.logger.warn('Model attempt failed', logData);
      
      // 发送通知（如果是API欠费等严重错误）
      if (error && NotificationService.isApiCreditError(error.message)) {
        this.sendFailureNotification(attempt, error, additionalContext);
      }
    }
  }

  /**
   * 获取当前最佳模型推荐
   */
  getBestModel(): string {
    if (this.models.length === 1) return this.models[0];
    
    // 根据成功率选择最佳模型
    let bestModel = this.models[0];
    let bestScore = -1;
    
    for (const model of this.models) {
      const performance = this.modelPerformance.get(model);
      if (!performance) continue;
      
      const totalAttempts = performance.successCount + performance.failureCount;
      const successRate = totalAttempts > 0 ? performance.successCount / totalAttempts : 0;
      
      if (successRate > bestScore) {
        bestScore = successRate;
        bestModel = model;
      }
    }
    
    return bestModel;
  }

  /**
   * 计算重试延迟
   */
  calculateRetryDelay(attempt: ModelRotationAttempt): number {
    const baseDelay = this.config.retryDelay;
    
    // 模型切换时延迟较短，方法重试时使用指数退避
    if (attempt.methodRetry === 1) {
      return Math.min(baseDelay, 1000); // 模型切换最多1秒
    }
    
    // 指数退避，但有上限
    const exponentialDelay = baseDelay * Math.pow(1.5, attempt.methodRetry - 1);
    return Math.min(exponentialDelay, 10000); // 最大10秒
  }

  /**
   * 发送失败通知
   */
  private sendFailureNotification(
    attempt: ModelRotationAttempt, 
    error: Error,
    context?: any
  ): void {
    try {
      const notificationService = new NotificationService(notificationConfig);
      notificationService.sendApiCreditAlertAsync(
        `Model ${attempt.modelName} (${this.config.operation})`,
        error.message,
        {
          operation: this.config.operation,
          ...attempt,
          context: context || this.operationContext,
          timestamp: new Date().toISOString()
        }
      );
    } catch (notificationError) {
      this.logger.warn('Failed to send failure notification', {
        originalError: error.message,
        notificationError: notificationError instanceof Error ? notificationError.message : 'Unknown'
      });
    }
  }

  /**
   * 获取轮换统计信息
   */
  getRotationStats(): any {
    return {
      operation: this.config.operation,
      totalModels: this.models.length,
      failedModels: Array.from(this.failedModels),
      modelPerformance: Object.fromEntries(this.modelPerformance),
      bestModel: this.getBestModel(),
      config: this.config
    };
  }
}