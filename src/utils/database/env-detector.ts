/**
 * 客户环境检测工具
 * 根据请求信息动态判断客户来源，支持一个容器服务多种客户
 */

import { logger } from "@/utils/logger";
import { NextRequest } from "next/server";

const envLogger = logger.getInstance('ClientDetector');

export type ClientEnvironment = 'local' | 'dev' | 'prod';

/**
 * 客户环境信息
 */
export interface ClientEnvInfo {
  environment: ClientEnvironment;
  dataBaseUrl?: string;
  jwt?: string;
  userId?: string;
  isAuthenticated: boolean;
  source: 'url-params' | 'jwt-payload' | 'data-center-url' | 'fallback-local';
}

/**
 * 从请求中检测客户环境
 * 这是关键函数：一个容器根据每个请求判断客户来源
 */
export function detectClientEnvironment(req: NextRequest): ClientEnvInfo {
  let environment: ClientEnvironment = 'local';
  let dataBaseUrl: string | undefined;
  let jwt: string | undefined;
  let userId: string | undefined;
  let isAuthenticated = false;
  let source: ClientEnvInfo['source'] = 'fallback-local';
  
  // 1. 从URL参数中获取JWT和dataBaseUrl
  jwt = req.nextUrl.searchParams.get('jwt') || undefined;
  dataBaseUrl = req.nextUrl.searchParams.get('dataBaseUrl') || undefined;
  
  // 2. 从Authorization header获取JWT
  if (!jwt) {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      jwt = authHeader.slice(7);
    } else if (authHeader) {
      jwt = authHeader;
    }
  }
  
  // 3. 从请求路径推断dataBaseUrl
  if (!dataBaseUrl) {
    const pathname = req.nextUrl.pathname;
    if (pathname.startsWith('/dp2api/')) {
      const host = req.headers.get('host') || req.headers.get('x-forwarded-host') || 'localhost:8080';
      const protocol = req.headers.get('x-forwarded-proto') || 
                      req.headers.get('x-forwarded-protocol') || 
                      (host.includes('localhost') ? 'http' : 'https');
      dataBaseUrl = `${protocol}://${host}`;
      source = 'url-params';
    }
  }
  
  // 4. 从环境变量获取
  if (!dataBaseUrl) {
    dataBaseUrl = process.env.NEXT_PUBLIC_DATA_CENTER_URL;
    if (dataBaseUrl) {
      source = 'data-center-url';
    }
  }
  
  // 5. 判断客户环境
  if (jwt && dataBaseUrl) {
    isAuthenticated = true;
    
    // 解析JWT判断环境 (简单方法：从dataBaseUrl判断)
    if (dataBaseUrl.includes('localhost') || dataBaseUrl.includes('127.0.0.1')) {
      environment = 'dev'; // 本地数据中心 = 开发环境
    } else if (dataBaseUrl.includes('dev') || dataBaseUrl.includes('test')) {
      environment = 'dev'; // 开发/测试数据中心
    } else {
      environment = 'prod'; // 生产数据中心
    }
    
    source = 'jwt-payload';
    
    // TODO: 可以进一步解析JWT payload获取更精确的环境信息
    try {
      const payload = parseJWTPayload(jwt);
      userId = payload?.sub || payload?.id || payload?.user_id;
      
      // 如果JWT中有环境信息，优先使用
      if (payload?.environment) {
        environment = payload.environment as ClientEnvironment;
      }
      
    } catch (error) {
      envLogger.warn('Failed to parse JWT payload', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
  } else if (dataBaseUrl) {
    // 有dataBaseUrl但没有JWT，可能是公开访问
    if (dataBaseUrl.includes('localhost') || dataBaseUrl.includes('127.0.0.1')) {
      environment = 'dev';
    } else if (dataBaseUrl.includes('dev') || dataBaseUrl.includes('test')) {
      environment = 'dev';
    } else {
      environment = 'prod';
    }
    
    isAuthenticated = false;
    
  } else {
    // 没有dataBaseUrl和JWT，本地访问
    environment = 'local';
    isAuthenticated = false;
    source = 'fallback-local';
  }
  
  const clientInfo: ClientEnvInfo = {
    environment,
    dataBaseUrl,
    jwt,
    userId,
    isAuthenticated,
    source
  };
  
  envLogger.debug('Client environment detected', {
    environment,
    hasDataBaseUrl: !!dataBaseUrl,
    hasJWT: !!jwt,
    userId,
    isAuthenticated,
    source,
    userAgent: req.headers.get('user-agent')?.substring(0, 50)
  });
  
  return clientInfo;
}

/**
 * 解析JWT payload (简单版本，不验证签名)
 */
function parseJWTPayload(jwt: string): any {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }
    
    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (error) {
    throw new Error(`JWT parsing failed: ${error}`);
  }
}

/**
 * 根据客户环境动态获取数据库配置
 * 关键改变：支持一个容器连接多个数据库
 */
export function getDatabaseConfigForClient(clientEnv: ClientEnvironment, clientInfo?: ClientEnvInfo) {
  
  const config = {
    environment: clientEnv,
    host: 'localhost', // 默认容器内连接
    port: 5432,
    database: 'deep_research',
    schema: 'deep_research',
    username: 'pgvector',
    password: 'pgvector',
    ssl: false,
    maxConnections: 20,
    connectionTimeoutMs: 10000,
    clientId: clientInfo?.userId || 'anonymous'
  };
  
  switch (clientEnv) {
    case 'local':
      // 本地客户：连接到本地PostgreSQL外部端口
      config.host = process.env.POSTGRES_HOST || 'localhost';
      config.port = parseInt(process.env.POSTGRES_PORT || '45432'); // 外部端口
      config.schema = 'deep_research_local';
      config.database = process.env.POSTGRES_DB || 'deep_research';
      config.username = process.env.POSTGRES_USER || 'pgvector';
      config.password = process.env.POSTGRES_PASSWORD || 'pgvector';
      break;
      
    case 'dev':
      // 开发环境客户：使用开发schema
      config.host = process.env.POSTGRES_HOST || 'localhost';
      config.port = parseInt(process.env.POSTGRES_PORT || '5432');
      config.database = process.env.POSTGRES_DB || 'deep_research';
      config.schema = 'deep_research_dev'; // 开发环境专用schema
      config.username = process.env.POSTGRES_USER || 'pgvector';
      config.password = process.env.POSTGRES_PASSWORD || 'pgvector';
      config.maxConnections = 30;
      break;
      
    case 'prod':
      // 生产环境客户：使用生产schema
      config.host = process.env.POSTGRES_HOST || 'localhost';
      config.port = parseInt(process.env.POSTGRES_PORT || '5432');
      config.database = process.env.POSTGRES_DB || 'deep_research'; // 同一数据库
      config.schema = 'deep_research_prod'; // 生产环境专用schema
      config.username = process.env.POSTGRES_USER || 'pgvector';
      config.password = process.env.POSTGRES_PASSWORD || 'pgvector';
      config.ssl = process.env.POSTGRES_SSL === 'true';
      config.maxConnections = 50; // 生产环境更多连接
      break;
  }
  
  // 支持通过不同环境的DATABASE_URL配置
  const envSpecificDbUrl = process.env[`DATABASE_URL_${clientEnv.toUpperCase()}`];
  if (envSpecificDbUrl) {
    const dbUrl = new URL(envSpecificDbUrl);
    config.host = dbUrl.hostname;
    config.port = parseInt(dbUrl.port) || 5432;
    config.database = dbUrl.pathname.slice(1);
    config.username = dbUrl.username;
    config.password = dbUrl.password;
    config.ssl = dbUrl.searchParams.get('ssl') === 'require';
  } else if (process.env.DATABASE_URL) {
    // 回退到通用DATABASE_URL
    const dbUrl = new URL(process.env.DATABASE_URL);
    config.host = dbUrl.hostname;
    config.port = parseInt(dbUrl.port) || 5432;
    config.database = dbUrl.pathname.slice(1);
    config.username = dbUrl.username;
    config.password = dbUrl.password;
    config.ssl = dbUrl.searchParams.get('ssl') === 'require';
  }
  
  envLogger.info('Client database config generated', {
    clientEnvironment: clientEnv,
    clientId: config.clientId,
    host: config.host,
    port: config.port,
    database: config.database,
    schema: config.schema,
    ssl: config.ssl,
    maxConnections: config.maxConnections,
    isAuthenticated: clientInfo?.isAuthenticated
  });
  
  return config;
}

/**
 * 根据环境获取Redis配置
 */
export function getRedisConfig(env?: ClientEnvironment) {
  const detectedEnv = env || 'local';
  
  const config = {
    environment: detectedEnv,
    host: 'localhost',
    port: 6379,
    db: 1,
    maxConnections: 10,
    retryDelayOnFailover: 100,
    connectTimeout: 10000,
  };
  
  switch (detectedEnv) {
    case 'local':
      // 本地开发环境
      config.host = process.env.REDIS_HOST || 'localhost';
      config.port = parseInt(process.env.REDIS_PORT || '46379'); // 外部端口
      config.db = parseInt(process.env.REDIS_DB || '1');
      break;
      
    case 'dev':
      // 开发环境
      config.host = process.env.REDIS_HOST || 'redis'; // 容器服务名
      config.port = parseInt(process.env.REDIS_PORT || '6379'); // 内部端口
      config.db = parseInt(process.env.REDIS_DB || '1');
      break;
      
    case 'prod':
      // 生产环境
      config.host = process.env.REDIS_HOST || 'redis';
      config.port = parseInt(process.env.REDIS_PORT || '6379');
      config.db = parseInt(process.env.REDIS_DB || '11'); // 生产数据库
      config.maxConnections = 50; // 生产环境更多连接
      break;
  }
  
  // 支持通过REDIS_URL直接配置
  if (process.env.REDIS_URL) {
    const redisUrl = new URL(process.env.REDIS_URL);
    config.host = redisUrl.hostname;
    config.port = parseInt(redisUrl.port) || 6379;
    config.db = parseInt(redisUrl.pathname.slice(1)) || config.db;
  }
  
  envLogger.info('Redis config generated', {
    environment: detectedEnv,
    host: config.host,
    port: config.port,
    db: config.db,
    maxConnections: config.maxConnections
  });
  
  return config;
}

/**
 * 检查当前环境是否支持Docker部署
 */
export function isDockerEnvironment(): boolean {
  return process.env.RUNNING_IN_DOCKER === 'true' || 
         process.env.DOCKER_CONTAINER === 'true' ||
         process.env.IS_DOCKER === 'true';
}

/**
 * 获取环境描述信息
 */
export function getEnvironmentInfo(): {
  environment: ClientEnvironment;
  description: string;
  databaseHost: string;
  redisHost: string;
  isDocker: boolean;
  basePath: string;
} {
  const env = 'local' as ClientEnvironment;
  const dbConfig = getDatabaseConfigForClient(env);
  const redisConfig = getRedisConfig(env);
  
  const descriptions = {
    local: '本地开发环境 (localhost)',
    dev: '开发环境 (Docker/开发服务器)',
    prod: '生产环境 (客户部署)'
  };
  
  return {
    environment: env,
    description: descriptions[env],
    databaseHost: `${dbConfig.host}:${dbConfig.port}`,
    redisHost: `${redisConfig.host}:${redisConfig.port}`,
    isDocker: isDockerEnvironment(),
    basePath: process.env.NEXT_PUBLIC_BASE_PATH || ''
  };
}