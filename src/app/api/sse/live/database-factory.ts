/**
 * 数据库工厂
 * PostgreSQL数据库统一管理
 */

import { NextRequest } from 'next/server';
import { logger } from '@/utils/logger';

// 导入数据库实现
import { PostgreSQLTaskDatabase, AsyncPostgreSQLTaskDatabase } from './pg-task-database';
import { validateDatabaseConfig } from '@/utils/database/db-config-checker';
import { initializeDatabaseOnStartup, getInitializationStatus } from '@/utils/database/startup-initializer';

const factoryLogger = logger.getInstance('DatabaseFactory');

export type DatabaseType = 'postgresql';

export interface DatabaseConfig {
  type: DatabaseType;
  postgresqlConfig?: any;
}

/**
 * 检测可用的数据库类型
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function detectAvailableDatabase(): DatabaseType {
  // PostgreSQL only mode
  const pgValidation = validateDatabaseConfig();
  if (pgValidation.valid) {
    factoryLogger.info('PostgreSQL configuration valid');
    return 'postgresql';
  } else {
    factoryLogger.error('PostgreSQL configuration invalid', new Error(pgValidation.issues.join(', ')));
    throw new Error(`PostgreSQL configuration invalid: ${pgValidation.issues.join(', ')}`);
  }
}

/**
 * 获取数据库配置
 */
function getDatabaseConfig(): DatabaseConfig {
  // PostgreSQL only mode
  const finalType: DatabaseType = 'postgresql';
  
  return {
    type: finalType,
    postgresqlConfig: validateDatabaseConfig().config
  };
}

/**
 * 数据库工厂类
 */
export class DatabaseFactory {
  private static config: DatabaseConfig;
  private static syncInstance: PostgreSQLTaskDatabase | any;
  private static asyncInstance: AsyncPostgreSQLTaskDatabase | any;
  private static autoInitPromise: Promise<any> | null = null;
  
  /**
   * 初始化工厂
   */
  static initialize(): void {
    this.config = getDatabaseConfig();
    
    factoryLogger.info('Database factory initialized', {
      type: this.config.type
    });
  }
  
  /**
   * 确保数据库已自动初始化（仅对PostgreSQL）
   */
  private static async ensureAutoInitialized(): Promise<void> {
    // 只有PostgreSQL需要自动初始化
    if (this.config.type !== 'postgresql') {
      return;
    }
    
    // 如果已经有初始化Promise，等待它完成
    if (this.autoInitPromise) {
      await this.autoInitPromise;
      return;
    }
    
    // 检查是否已经初始化
    const status = await getInitializationStatus();
    if (status.initialized) {
      return;
    }
    
    // 开始自动初始化
    factoryLogger.info('Auto-initializing PostgreSQL database...');
    this.autoInitPromise = initializeDatabaseOnStartup({
      maxRetries: 3,
      retryDelay: 3000
    });
    
    try {
      const result = await this.autoInitPromise;
      if (result.success) {
        factoryLogger.info('PostgreSQL auto-initialization completed successfully');
      } else {
        factoryLogger.error('PostgreSQL auto-initialization failed', result.error);
        throw new Error(`Database initialization failed: ${result.error}`);
      }
    } catch (error) {
      factoryLogger.error('PostgreSQL auto-initialization error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  /**
   * 获取同步数据库实例（兼容现有代码）
   */
  static getSyncDatabase(request?: NextRequest): any {
    if (!this.config) {
      this.initialize();
    }
    
    if (!this.syncInstance) {
      // 只支持PostgreSQL
      this.syncInstance = new PostgreSQLTaskDatabase();
      factoryLogger.info('Created PostgreSQL sync database instance');
    }
    
    // 设置请求上下文
    if (request && this.syncInstance.setRequestContext) {
      this.syncInstance.setRequestContext(request);
    }
    
    return this.syncInstance;
  }
  
  /**
   * 获取异步数据库实例（推荐）
   */
  static async getAsyncDatabase(request?: NextRequest): Promise<AsyncPostgreSQLTaskDatabase> {
    if (!this.config) {
      this.initialize();
    }
    
    // 确保PostgreSQL已自动初始化
    await this.ensureAutoInitialized();
    
    if (!this.asyncInstance) {
      // 只支持PostgreSQL
      this.asyncInstance = new AsyncPostgreSQLTaskDatabase();
      factoryLogger.info('Created PostgreSQL async database instance');
    }
    
    // 设置请求上下文
    if (request && this.asyncInstance.setRequestContext) {
      this.asyncInstance.setRequestContext(request);
    }
    
    return this.asyncInstance;
  }
  
  /**
   * 获取当前数据库类型
   */
  static getCurrentDatabaseType(): DatabaseType {
    if (!this.config) {
      this.initialize();
    }
    return this.config.type;
  }
  
  /**
   * 获取数据库健康状况
   */
  static async getHealthStatus(): Promise<{
    type: DatabaseType;
    status: 'ok' | 'error';
    message: string;
    details?: any;
  }> {
    try {
      if (!this.config) {
        this.initialize();
      }
      
      const db = await this.getAsyncDatabase();
      const health = await db.healthCheck();
      
      return {
        type: this.config.type,
        status: health.status,
        message: health.message,
        details: {
          config: this.config.type === 'postgresql' ? this.config.postgresqlConfig : undefined
        }
      };
    } catch (error) {
      return {
        type: this.config?.type || 'unknown',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * 重置工厂（测试用）
   */
  static reset(): void {
    if (this.syncInstance?.close) {
      this.syncInstance.close();
    }
    if (this.asyncInstance?.close) {
      this.asyncInstance.close();
    }
    
    this.syncInstance = null;
    this.asyncInstance = null;
    this.config = getDatabaseConfig();
    
    factoryLogger.info('Database factory reset');
  }
}


/**
 * 便捷函数：获取数据库实例
 */
export function createDatabase(request?: NextRequest) {
  return DatabaseFactory.getSyncDatabase(request);
}

/**
 * 便捷函数：获取异步数据库实例
 */
export async function createAsyncDatabase(request?: NextRequest) {
  return await DatabaseFactory.getAsyncDatabase(request);
}

/**
 * 便捷函数：获取数据库健康状况
 */
export function getDatabaseHealth() {
  return DatabaseFactory.getHealthStatus();
}

// 初始化工厂
try {
  DatabaseFactory.initialize();
} catch (error) {
  factoryLogger.error('Failed to initialize database factory', error instanceof Error ? error : new Error(String(error)));
}

export default DatabaseFactory;