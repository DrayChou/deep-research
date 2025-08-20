#!/usr/bin/env node

/**
 * 数据库初始化工具
 * 可以独立运行来测试PostgreSQL连接和初始化数据库结构
 */

import { SimplePGAdapter } from './simple-pg-adapter';
import { logger } from "../logger";

const initLogger = logger.getInstance('DBInit');

async function initializeDatabase() {
  initLogger.info('Starting database initialization...');
  
  try {
    // 获取数据库适配器实例
    const adapter = SimplePGAdapter.getInstance();
    
    // 执行初始化
    await adapter.initialize();
    
    // 测试基本功能
    const healthCheck = await adapter.healthCheck();
    if (!healthCheck.connected) {
      throw new Error(`Health check failed: ${healthCheck.error}`);
    }
    
    // 获取连接池状态
    const poolStatus = adapter.getPoolStatus();
    initLogger.info('Connection pool status:', poolStatus);
    
    // 测试统计功能
    const stats = await adapter.getTaskStatsByEnvironment();
    initLogger.info('Database statistics by environment:', stats);
    
    initLogger.info('✅ Database initialization completed successfully!');
    
    return {
      success: true,
      healthCheck,
      poolStatus,
      stats
    };
    
  } catch (error) {
    initLogger.error('❌ Database initialization failed:', error instanceof Error ? error : new Error(String(error)));
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  (async () => {
    const result = await initializeDatabase();
    
    if (result.success) {
      console.log('\n🎉 Database ready for use!');
      console.log('Health Check:', result.healthCheck);
      console.log('Pool Status:', result.poolStatus);
      console.log('Statistics:', result.stats);
    } else {
      console.error('\n💥 Initialization failed:', result.error);
      process.exit(1);
    }
    
    process.exit(0);
  })();
}

export { initializeDatabase };