/**
 * 健康检查API端点
 * 用于测试数据库初始化
 */

import { NextResponse } from 'next/server';
import { initializeDatabaseOnStartup, getInitializationStatus } from '@/utils/database/startup-initializer';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 检查数据库初始化状态
    const initStatus = await getInitializationStatus();
    
    if (!initStatus.initialized && !initStatus.inProgress) {
      // 启动数据库初始化，使用单例实例
      initializeDatabaseOnStartup().catch(error => {
        console.error('Database initialization failed:', error);
      });
      
      return NextResponse.json({
        status: 'initializing',
        message: 'Database initialization started',
        timestamp: new Date().toISOString()
      }, { status: 503 });
    }
    
    if (initStatus.inProgress) {
      return NextResponse.json({
        status: 'initializing',
        message: 'Database initialization in progress',
        timestamp: new Date().toISOString()
      }, { status: 503 });
    }
    
    return NextResponse.json({
      status: 'ok',
      message: 'Service is healthy, database initialized',
      database: initStatus.result ? {
        success: initStatus.result.success,
        actions: initStatus.result.actions,
        duration: initStatus.result.duration
      } : undefined,
      timestamp: new Date().toISOString()
    }, { status: 200 });
    
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}