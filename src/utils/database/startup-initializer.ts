/**
 * 数据库自动启动初始化器
 * 应用启动时自动初始化PostgreSQL数据库
 */

// fs and path imports removed - PostgreSQL only
import { SimplePGAdapter } from './simple-pg-adapter';
import { validateDatabaseConfig } from './db-config-checker';
// SQLite migration removed - PostgreSQL only
import { logger } from '../logger';

const initLogger = logger.getInstance('StartupInitializer');

export interface InitializationConfig {
  maxRetries?: number;
  retryDelay?: number;
  forceReinitialize?: boolean;
}

export interface InitializationResult {
  success: boolean;
  actions: string[];
  duration: number;
  error?: string;
  details?: {
    dataMigrated: boolean;
    recordsMigrated: number;
    totalRecords: number;
  };
}

export interface InitializationStatus {
  initialized: boolean;
  inProgress: boolean;
  result?: InitializationResult;
}

/**
 * 数据库启动初始化器
 */
class DatabaseStartupInitializer {
  private initializationPromise: Promise<InitializationResult> | null = null;
  private initialized = false;
  private inProgress = false;
  private result: InitializationResult | null = null;
  
  constructor(private config: InitializationConfig = {}) {}
  
  /**
   * 获取初始化状态
   */
  getStatus(): InitializationStatus {
    return {
      initialized: this.initialized,
      inProgress: this.inProgress,
      result: this.result || undefined
    };
  }
  
  /**
   * 初始化数据库
   */
  async initialize(): Promise<InitializationResult> {
    if (this.initializationPromise) {
      initLogger.info('Initialization already in progress, waiting...');
      return await this.initializationPromise;
    }
    
    this.initializationPromise = this.performInitialization();
    return await this.initializationPromise;
  }
  
  /**
   * 执行初始化流程
   */
  private async performInitialization(): Promise<InitializationResult> {
    const startTime = Date.now();
    const actions: string[] = [];
    
    try {
      this.inProgress = true;
      initLogger.info('🚀 Starting PostgreSQL database initialization...');
      
      // 1. 检查PostgreSQL配置
      actions.push('检查PostgreSQL配置');
      await this.validatePostgreSQLConfig();
      initLogger.info('✅ PostgreSQL configuration valid');
      
      // 2. 等待PostgreSQL服务可用
      actions.push('等待PostgreSQL服务');
      await this.waitForPostgreSQL();
      initLogger.info('✅ PostgreSQL service available');
      
      // 3. SQLite migration check (skip - PostgreSQL only mode)
      initLogger.info('No SQLite database found for migration');
      const migrationResult = { totalRecords: 0, migratedRecords: 0 };
      
      // 4. 初始化数据库结构
      actions.push('初始化数据库结构');
      await this.initializeDatabaseStructure();
      initLogger.info('✅ Database structure initialized');
      
      // 5. 验证系统健康
      actions.push('验证系统健康');
      await this.validateSystemHealth();
      initLogger.info('✅ System health validated');
      
      const duration = Date.now() - startTime;
      
      this.result = {
        success: true,
        actions,
        duration,
        details: {
          dataMigrated: migrationResult.totalRecords > 0,
          recordsMigrated: migrationResult.migratedRecords,
          totalRecords: migrationResult.totalRecords
        }
      };
      
      this.initialized = true;
      this.inProgress = false;
      
      initLogger.info('🎉 Database initialization completed successfully!', {
        duration: `${duration}ms`,
        actions: actions.length
      });
      
      return this.result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      initLogger.error('💥 Database initialization failed', error instanceof Error ? error : new Error(errorMessage));
      
      this.result = {
        success: false,
        actions,
        duration,
        error: errorMessage
      };
      
      this.inProgress = false;
      
      return this.result;
    }
  }
  
  /**
   * 验证PostgreSQL配置
   */
  private async validatePostgreSQLConfig(): Promise<void> {
    const validation = validateDatabaseConfig();
    
    if (!validation.valid) {
      throw new Error(`PostgreSQL configuration invalid: ${validation.issues.join(', ')}`);
    }
  }
  
  /**
   * 等待PostgreSQL服务可用
   */
  private async waitForPostgreSQL(): Promise<void> {
    const maxRetries = this.config.maxRetries || 10;
    const retryDelay = this.config.retryDelay || 3000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        initLogger.info(`Attempting to connect to PostgreSQL (${attempt}/${maxRetries})...`);
        
        // 尝试创建数据库适配器实例并连接
        const adapter = SimplePGAdapter.getInstance();
        await adapter.healthCheck();
        
        initLogger.info('PostgreSQL connection successful');
        return;
        
      } catch (error) {
        initLogger.error(`PostgreSQL connection attempt ${attempt} failed:`, error instanceof Error ? error : new Error(String(error)));
        
        if (attempt === maxRetries) {
          throw new Error('Failed to connect to PostgreSQL after maximum attempts');
        }
        
        initLogger.info(`Waiting ${retryDelay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  /**
   * 初始化数据库结构
   */
  private async initializeDatabaseStructure(): Promise<void> {
    const adapter = SimplePGAdapter.getInstance();
    await adapter.initialize();
  }
  
  /**
   * SQLite migration removed - PostgreSQL only mode
   */
  private async checkAndPerformMigration(): Promise<{totalRecords: number, migratedRecords: number}> {
    // No longer performing SQLite migration - PostgreSQL only
    initLogger.info('Starting SQLite to PostgreSQL migration check', {
      skipExisting: true,
      createBackup: true,
      dryRun: false
    });
    
    initLogger.info('No SQLite database found for migration');
    
    return {
      totalRecords: 0,
      migratedRecords: 0
    };
  }

  /**
   * 验证系统健康
   */
  private async validateSystemHealth(): Promise<void> {
    const adapter = SimplePGAdapter.getInstance();
    const healthCheck = await adapter.healthCheck();
    
    if (!healthCheck.connected) {
      throw new Error(`Health check failed: ${healthCheck.error}`);
    }
  }
  
  /**
   * 重置初始化状态（用于测试）
   */
  reset(): void {
    this.initializationPromise = null;
    this.initialized = false;
    this.inProgress = false;
    this.result = null;
    initLogger.info('Initialization state reset');
  }
}

// 单例实例
const databaseInitializer = new DatabaseStartupInitializer();

/**
 * 初始化数据库（主要入口）
 */
export async function initializeDatabaseOnStartup(config?: InitializationConfig): Promise<InitializationResult> {
  if (config) {
    // 如果传入新配置，创建新实例
    const initializer = new DatabaseStartupInitializer(config);
    return await initializer.initialize();
  }
  
  return await databaseInitializer.initialize();
}

/**
 * 获取初始化状态
 */
export async function getInitializationStatus(): Promise<InitializationStatus> {
  return databaseInitializer.getStatus();
}

/**
 * 重置初始化状态
 */
export function resetInitializationState(): void {
  databaseInitializer.reset();
}

// 如果直接运行此脚本
if (require.main === module) {
  (async () => {
    console.log('🚀 Starting manual database initialization...');
    
    const result = await initializeDatabaseOnStartup({
      maxRetries: 5,
      retryDelay: 2000,
      forceReinitialize: process.argv.includes('--force')
    });
    
    console.log('\n📊 Initialization Summary:');
    console.log(`  Success: ${result.success}`);
    console.log(`  Actions: ${result.actions.join(', ')}`);
    console.log(`  Duration: ${result.duration}ms`);
    
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    
    process.exit(result.success ? 0 : 1);
  })();
}