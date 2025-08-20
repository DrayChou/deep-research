/**
 * 数据库初始化中间件
 * 确保在处理任何请求之前完成数据库初始化
 */

import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabaseOnStartup, getInitializationStatus } from '@/utils/database/startup-initializer';
import { logger } from '@/utils/logger';

const middlewareLogger = logger.getInstance('DatabaseInitMiddleware');

// 初始化状态管理
let initializationStarted = false;
let initializationPromise: Promise<any> | null = null;

/**
 * 数据库初始化中间件
 * 在处理任何数据库相关请求前确保初始化完成
 */
export async function ensureDatabaseInitialized(request: NextRequest): Promise<NextResponse | null> {
  // 对于健康检查和初始化状态API，允许直接通过
  const pathname = request.nextUrl.pathname;
  if (pathname === '/api/health' || 
      pathname === '/api/init-status' || 
      pathname.startsWith('/api/test-db') ||
      pathname.startsWith('/_next/') ||
      pathname.startsWith('/favicon.ico')) {
    return null; // 继续处理请求
  }
  
  try {
    // 检查初始化状态
    const status = await getInitializationStatus();
    
    if (status.initialized) {
      // 已经初始化完成，允许请求继续
      return null;
    }
    
    if (status.inProgress) {
      // 初始化正在进行中，返回等待响应
      return NextResponse.json({
        status: 'initializing',
        message: 'Database initialization in progress, please wait...',
        timestamp: new Date().toISOString()
      }, { 
        status: 503,
        headers: {
          'Retry-After': '5',
          'Content-Type': 'application/json'
        }
      });
    }
    
    // 需要启动初始化
    if (!initializationStarted) {
      initializationStarted = true;
      middlewareLogger.info('Starting database initialization...');
      
      initializationPromise = initializeDatabaseOnStartup({
        maxRetries: 3,
        retryDelay: 5000
      });
      
      // 不等待初始化完成，立即返回初始化状态
      return NextResponse.json({
        status: 'initializing',
        message: 'Database initialization started, please wait...',
        timestamp: new Date().toISOString()
      }, { 
        status: 503,
        headers: {
          'Retry-After': '10',
          'Content-Type': 'application/json'
        }
      });
    }
    
    // 初始化已经开始但状态不明确，返回等待
    return NextResponse.json({
      status: 'initializing',
      message: 'Database initialization in progress, please wait...',
      timestamp: new Date().toISOString()
    }, { 
      status: 503,
      headers: {
        'Retry-After': '5',
        'Content-Type': 'application/json'
      }
    });
    
  } catch (error) {
    middlewareLogger.error('Database initialization check failed', error instanceof Error ? error : new Error(String(error)));
    
    return NextResponse.json({
      status: 'error',
      message: 'Database initialization check failed',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * 重置初始化状态（测试用）
 */
export function resetInitializationState(): void {
  initializationStarted = false;
  initializationPromise = null;
  middlewareLogger.info('Initialization state reset');
}

/**
 * 获取初始化Promise（用于等待完成）
 */
export function getInitializationPromise(): Promise<any> | null {
  return initializationPromise;
}