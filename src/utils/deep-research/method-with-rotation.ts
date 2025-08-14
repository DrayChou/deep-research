/**
 * 带模型轮换的方法执行器
 * 为所有DeepResearch方法提供统一的模型轮换重试逻辑
 */

import { ModelRotationManager, ModelRotationConfig } from './model-rotation-manager';
import { Logger } from "@/utils/logger";

export interface MethodExecutionContext {
  operation: string;
  models: string[];
  createModelInstance: (modelName: string) => Promise<any>;
  validateResult?: (result: any) => { valid: boolean; error?: string };
  additionalContext?: any;
}

export interface MethodExecutionResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  successfulModel?: string;
  executionTime: number;
  rotationStats?: any;
}

/**
 * 通用的模型轮换方法执行器
 */
export class MethodWithRotation {
  private static readonly DEFAULT_CONFIG: Partial<ModelRotationConfig> = {
    maxModelRetries: 3,
    maxMethodRetries: 3, 
    retryDelay: 1000
  };

  /**
   * 执行带模型轮换的方法
   */
  static async execute<T>(
    context: MethodExecutionContext,
    methodFn: (model: any, attempt: any) => Promise<T>,
    config?: Partial<ModelRotationConfig>
  ): Promise<MethodExecutionResult<T>> {
    const startTime = Date.now();
    const logger = Logger.getInstance(`Method-${context.operation}`);
    
    const fullConfig: ModelRotationConfig = {
      maxModelRetries: this.DEFAULT_CONFIG.maxModelRetries!,
      maxMethodRetries: this.DEFAULT_CONFIG.maxMethodRetries!,
      retryDelay: this.DEFAULT_CONFIG.retryDelay!,
      ...config,
      operation: context.operation
    };

    const rotationManager = new ModelRotationManager(
      context.models,
      fullConfig,
      context.additionalContext
    );

    let lastError: Error | null = null;
    let totalAttempts = 0;

    logger.info('Starting method execution with model rotation', {
      operation: context.operation,
      modelCount: context.models.length,
      models: context.models,
      config: fullConfig
    });

    try {
      // 遍历所有重试尝试
      for (const attempt of rotationManager.generateAttempts()) {
        totalAttempts++;
        const attemptStartTime = Date.now();

        logger.debug('Executing attempt', {
          ...attempt,
          operation: context.operation
        });

        try {
          // 创建模型实例
          const model = await context.createModelInstance(attempt.modelName);
          
          // 计算重试延迟
          if (totalAttempts > 1) {
            const delay = rotationManager.calculateRetryDelay(attempt);
            if (delay > 0) {
              logger.debug('Applying retry delay', { delay, attempt: totalAttempts });
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }

          // 执行实际方法
          const result = await methodFn(model, attempt);

          // 验证结果（如果提供了验证函数）
          if (context.validateResult) {
            const validation = context.validateResult(result);
            if (!validation.valid) {
              throw new Error(`Result validation failed: ${validation.error}`);
            }
          }

          // 成功！
          const attemptDuration = Date.now() - attemptStartTime;
          const totalDuration = Date.now() - startTime;

          rotationManager.recordAttemptResult(attempt, true, undefined, {
            attemptDuration,
            totalDuration,
            resultType: typeof result,
            resultLength: typeof result === 'string' ? result.length : undefined
          });

          logger.info('Method execution succeeded', {
            operation: context.operation,
            successfulModel: attempt.modelName,
            totalAttempts,
            attemptDuration,
            totalDuration,
            modelIndex: attempt.modelIndex + 1,
            methodRetry: attempt.methodRetry
          });

          return {
            success: true,
            result,
            attempts: totalAttempts,
            successfulModel: attempt.modelName,
            executionTime: totalDuration,
            rotationStats: rotationManager.getRotationStats()
          };

        } catch (error) {
          const attemptError = error instanceof Error ? error : new Error('Unknown error');
          lastError = attemptError;
          const attemptDuration = Date.now() - attemptStartTime;

          rotationManager.recordAttemptResult(attempt, false, attemptError, {
            attemptDuration,
            errorType: attemptError.constructor.name,
            errorMessage: attemptError.message
          });

          logger.warn('Method attempt failed', {
            operation: context.operation,
            modelName: attempt.modelName,
            attemptNumber: totalAttempts,
            error: attemptError.message,
            attemptDuration,
            willContinue: !attempt.isLastOverallAttempt
          });

          // 如果这是最后一次尝试，就不继续了
          if (attempt.isLastOverallAttempt) {
            break;
          }
        }
      }

      // 所有尝试都失败了
      const totalDuration = Date.now() - startTime;
      
      logger.error('All method attempts failed', lastError || new Error('All attempts failed'), {
        operation: context.operation,
        totalAttempts,
        totalDuration,
        models: context.models,
        rotationStats: rotationManager.getRotationStats()
      });

      return {
        success: false,
        error: lastError || new Error('All attempts failed'),
        attempts: totalAttempts,
        executionTime: totalDuration,
        rotationStats: rotationManager.getRotationStats()
      };

    } catch (setupError) {
      // 设置错误（比如模型创建失败）
      const totalDuration = Date.now() - startTime;
      const error = setupError instanceof Error ? setupError : new Error('Setup failed');
      
      logger.error('Method execution setup failed', error, {
        operation: context.operation,
        totalDuration
      });

      return {
        success: false,
        error,
        attempts: totalAttempts,
        executionTime: totalDuration
      };
    }
  }

  /**
   * 为特定操作创建模型实例的便捷方法
   */
  static async createModelInstance(
    modelName: string,
    provider: string,
    baseConfig: any,
    additionalConfig?: any
  ): Promise<any> {
    const { createAIProvider } = await import('./provider');
    
    const config = {
      provider,
      model: modelName,
      ...additionalConfig,
      ...baseConfig,
    };

    return await createAIProvider(config);
  }
}