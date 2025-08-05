/**
 * Error recovery utilities for SSE live API
 * Provides comprehensive error handling and recovery mechanisms
 */

import { logger } from "@/utils/logger";

export interface ErrorContext {
  operation: string;
  taskId?: string;
  clientId?: string;
  timestamp: string;
  additionalData?: Record<string, any>;
}

export interface RecoveryStrategy {
  name: string;
  canHandle: (error: Error, context: ErrorContext) => boolean;
  recover: (error: Error, context: ErrorContext) => Promise<RecoveryResult>;
}

export interface RecoveryResult {
  success: boolean;
  action: string;
  message?: string;
  retryAfter?: number;
  fallback?: any;
}

export class ErrorHandler {
  private strategies: Map<string, RecoveryStrategy[]> = new Map();
  private retryCounts: Map<string, number> = new Map();
  private maxRetries = 3;

  constructor() {
    this.initializeDefaultStrategies();
  }

  private initializeDefaultStrategies(): void {
    // Database error strategies
    this.registerStrategy('database', [
      {
        name: 'database-retry',
        canHandle: (error, context) => {
          return context.operation.includes('database') && 
                 this.isRetryableError(error);
        },
        recover: async (error, context) => {
          const retryKey = `${context.taskId || 'global'}-${context.operation}`;
          const retryCount = this.retryCounts.get(retryKey) || 0;
          
          if (retryCount >= this.maxRetries) {
            return {
              success: false,
              action: 'max-retries-exceeded',
              message: `Maximum retries (${this.maxRetries}) exceeded for ${context.operation}`
            };
          }

          this.retryCounts.set(retryKey, retryCount + 1);
          
          // Exponential backoff
          const delay = Math.pow(2, retryCount) * 1000;
          
          return {
            success: true,
            action: 'retry',
            retryAfter: delay,
            message: `Retrying ${context.operation} in ${delay}ms (attempt ${retryCount + 1})`
          };
        }
      },
      {
        name: 'database-fallback',
        canHandle: (error, context) => {
          return context.operation.includes('database') && 
                 error.message.includes('no such table');
        },
        recover: async () => {
          return {
            success: true,
            action: 'skip-database',
            message: 'Database table not found, skipping database operation'
          };
        }
      }
    ]);

    // Network error strategies
    this.registerStrategy('network', [
      {
        name: 'network-retry',
        canHandle: (error) => {
          return this.isNetworkError(error);
        },
        recover: async (error, context) => {
          const retryKey = `${context.taskId || 'global'}-${context.operation}`;
          const retryCount = this.retryCounts.get(retryKey) || 0;
          
          if (retryCount >= this.maxRetries) {
            return {
              success: false,
              action: 'max-retries-exceeded',
              message: `Maximum retries (${this.maxRetries}) exceeded for network operation`
            };
          }

          this.retryCounts.set(retryKey, retryCount + 1);
          
          return {
            success: true,
            action: 'retry',
            retryAfter: Math.pow(2, retryCount) * 1000,
            message: `Retrying network operation in ${Math.pow(2, retryCount) * 1000}ms`
          };
        }
      }
    ]);

    // Memory error strategies
    this.registerStrategy('memory', [
      {
        name: 'memory-cleanup',
        canHandle: (error) => {
          return error.message.includes('memory') || 
                 error.message.includes('heap') ||
                 error.name === 'RangeError';
        },
        recover: async () => {
          // Force garbage collection if available
          if (typeof global.gc === 'function') {
            global.gc();
          }
          
          return {
            success: true,
            action: 'memory-cleanup',
            message: 'Performed memory cleanup, continuing operation'
          };
        }
      }
    ]);

    // Task error strategies
    this.registerStrategy('task', [
      {
        name: 'task-restart',
        canHandle: (error, context) => {
          return !!(context.operation.includes('task') && 
                 context.taskId &&
                 !error.message.includes('authentication'));
        },
        recover: async (_, context) => {
          return {
            success: true,
            action: 'task-restart',
            message: `Task ${context.taskId} failed, marked for restart`,
            fallback: { restartTask: true }
          };
        }
      }
    ]);
  }

  registerStrategy(category: string, strategies: RecoveryStrategy[]): void {
    this.strategies.set(category, strategies);
  }

  async handleError(error: Error, context: ErrorContext): Promise<RecoveryResult> {
    const errorLogger = logger.getInstance('ErrorHandler');
    
    errorLogger.error('Error occurred', error, {
      operation: context.operation,
      taskId: context.taskId,
      clientId: context.clientId,
      timestamp: context.timestamp
    });

    // Determine error category
    const category = this.categorizeError(error, context);
    const strategies = this.strategies.get(category) || [];

    // Try each strategy in order
    for (const strategy of strategies) {
      try {
        if (strategy.canHandle(error, context)) {
          errorLogger.info(`Attempting recovery strategy: ${strategy.name}`, {
            category,
            operation: context.operation,
            taskId: context.taskId
          });

          const result = await strategy.recover(error, context);
          
          if (result.success) {
            errorLogger.info(`Recovery successful: ${strategy.name}`, {
              category,
              operation: context.operation,
              action: result.action
            });
            return result;
          } else {
            errorLogger.warn(`Recovery failed: ${strategy.name}`, {
              category,
              operation: context.operation,
              reason: result.message
            });
          }
        }
      } catch (recoveryError) {
        errorLogger.error(`Recovery strategy failed: ${strategy.name}`, recoveryError instanceof Error ? recoveryError : new Error(String(recoveryError)), {
          category,
          operation: context.operation
        });
      }
    }

    // No recovery strategy worked
    const errorCategory = this.categorizeError(error, context);
    errorLogger.error('No recovery strategy succeeded', error, {
      operation: context.operation,
      taskId: context.taskId,
      errorCategory
    });

    return {
      success: false,
      action: 'no-recovery',
      message: `No recovery strategy available for ${error.name}: ${error.message}`
    };
  }

  private categorizeError(error: Error, context: ErrorContext): string {
    const message = error.message.toLowerCase();
    const operation = context.operation.toLowerCase();

    if (message.includes('database') || message.includes('sqlite') || operation.includes('database')) {
      return 'database';
    }

    if (message.includes('network') || message.includes('connection') || message.includes('timeout') || message.includes('econnrefused')) {
      return 'network';
    }

    if (message.includes('memory') || message.includes('heap') || message.includes('allocation') || error.name === 'RangeError') {
      return 'memory';
    }

    if (operation.includes('task') || context.taskId) {
      return 'task';
    }

    return 'general';
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    const retryableMessages = [
      'connection',
      'timeout',
      'network',
      'temporary',
      'retry',
      'busy',
      'locked'
    ];

    return retryableMessages.some(msg => message.includes(msg));
  }

  private isNetworkError(error: Error): boolean {
    const message = error.message.toLowerCase();
    const networkMessages = [
      'network',
      'connection',
      'timeout',
      'econnrefused',
      'enotfound',
      'econnreset'
    ];

    return networkMessages.some(msg => message.includes(msg));
  }

  clearRetryCount(key: string): void {
    this.retryCounts.delete(key);
  }

  getRetryStats(): { totalRetries: number; errorCounts: Record<string, number> } {
    const totalRetries = Array.from(this.retryCounts.values())
      .reduce((sum, count) => sum + count, 0);

    const errorCounts: Record<string, number> = {};
    for (const [key, count] of this.retryCounts.entries()) {
      const operation = key.split('-')[1] || 'unknown';
      errorCounts[operation] = (errorCounts[operation] || 0) + count;
    }

    return { totalRetries, errorCounts };
  }
}

// Global error handler instance
export const errorHandler = new ErrorHandler();

/**
 * Wrapper function for automatic error recovery
 */
export async function withErrorRecovery<T>(
  operation: () => Promise<T>,
  context: ErrorContext,
  fallback?: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const errorLogger = logger.getInstance('ErrorHandler');
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    const result = await errorHandler.handleError(errorObj, context);
    
    if (result.success) {
      if (result.retryAfter) {
        await new Promise(resolve => setTimeout(resolve, result.retryAfter));
      }
      
      if (result.fallback?.restartTask) {
        // Handle task restart
        throw new Error(`Task restart requested: ${result.message}`);
      }
      
      // Retry the operation
      return await operation();
    } else if (fallback) {
      errorLogger.info('Using fallback operation', {
        operation: context.operation,
        reason: result.message
      });
      return await fallback();
    } else {
      // No recovery possible
      throw new Error(`Operation failed after recovery attempts: ${result.message}`);
    }
  }
}

/**
 * Create error context with defaults
 */
export function createErrorContext(
  operation: string,
  taskId?: string,
  clientId?: string,
  additionalData?: Record<string, any>
): ErrorContext {
  return {
    operation,
    taskId,
    clientId,
    timestamp: new Date().toISOString(),
    additionalData
  };
}