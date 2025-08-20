/**
 * 数据库配置检查工具
 * 验证环境变量和数据库连接配置
 */

import { logger } from "../logger";

const configLogger = logger.getInstance('DBConfigChecker');

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  maxConnections: number;
  connectionTimeout: number;
}

export function getDatabaseConfig(): DatabaseConfig {
  // 优先使用 DATABASE_URL，如果存在则解析它
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      return {
        host: url.hostname,
        port: parseInt(url.port || '5432'),
        database: url.pathname.slice(1), // 移除开头的斜杠
        user: url.username,
        password: url.password,
        ssl: process.env.POSTGRES_SSL === 'true',
        maxConnections: parseInt(process.env.DB_POOL_SIZE || '50'),
        connectionTimeout: 10000
      };
    } catch (error) {
      configLogger.error('Failed to parse DATABASE_URL, falling back to individual env vars', new Error(String(error)));
    }
  }
  
  // 回退到单独的环境变量
  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'deep_research',
    user: process.env.POSTGRES_USER || 'pgvector',
    password: process.env.POSTGRES_PASSWORD || 'pgvector',
    ssl: process.env.POSTGRES_SSL === 'true',
    maxConnections: parseInt(process.env.DB_POOL_SIZE || '50'),
    connectionTimeout: 10000
  };
}

export function validateDatabaseConfig(): {
  valid: boolean;
  issues: string[];
  config: DatabaseConfig;
} {
  const config = getDatabaseConfig();
  const issues: string[] = [];

  // 检查必需的配置项
  if (!config.host) {
    issues.push('POSTGRES_HOST is not configured');
  }

  if (!config.database) {
    issues.push('POSTGRES_DB is not configured');
  }

  if (!config.user) {
    issues.push('POSTGRES_USER is not configured');
  }

  if (!config.password) {
    issues.push('POSTGRES_PASSWORD is not configured');
  }

  if (config.port < 1 || config.port > 65535) {
    issues.push(`Invalid POSTGRES_PORT: ${config.port}`);
  }

  if (config.maxConnections < 1 || config.maxConnections > 1000) {
    issues.push(`Invalid DB_POOL_SIZE: ${config.maxConnections}`);
  }

  // 警告关于默认配置
  const warnings: string[] = [];
  
  if (process.env.POSTGRES_HOST === undefined) {
    warnings.push('Using default POSTGRES_HOST: localhost');
  }
  
  if (process.env.POSTGRES_DB === undefined) {
    warnings.push('Using default POSTGRES_DB: deep_research');
  }
  
  if (process.env.DB_POOL_SIZE === undefined) {
    warnings.push('Using default DB_POOL_SIZE: 50');
  }

  // 输出配置信息
  configLogger.info('Database configuration loaded:', {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    ssl: config.ssl,
    maxConnections: config.maxConnections,
    // 不输出密码
    passwordSet: !!config.password
  });

  if (warnings.length > 0) {
    configLogger.warn('Configuration warnings:', warnings);
  }

  if (issues.length > 0) {
    configLogger.error('Configuration issues found:', new Error(issues.join(', ')));
  }

  return {
    valid: issues.length === 0,
    issues,
    config
  };
}

export function getConnectionString(): string {
  const config = getDatabaseConfig();
  return `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;
}

// 环境变量模板生成
export function generateEnvTemplate(): string {
  return `
# Deep Research PostgreSQL Configuration
# Copy this to your .env file and update the values

# PostgreSQL Connection
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=deep_research
POSTGRES_USER=pgvector
POSTGRES_PASSWORD=pgvector
POSTGRES_SSL=false

# Connection Pool Settings
DB_POOL_SIZE=50

# Optional: Full connection string (overrides above settings)
# DATABASE_URL=postgresql://pgvector:pgvector@localhost:5432/deep_research
`.trim();
}

// 如果直接运行此脚本
if (require.main === module) {
  console.log('🔍 Database Configuration Check\n');
  
  const validation = validateDatabaseConfig();
  
  if (validation.valid) {
    console.log('✅ Configuration is valid!');
    console.log('Connection string:', getConnectionString());
  } else {
    console.log('❌ Configuration has issues:');
    validation.issues.forEach(issue => console.log(`  - ${issue}`));
    
    console.log('\n📋 Environment template:');
    console.log(generateEnvTemplate());
  }
}