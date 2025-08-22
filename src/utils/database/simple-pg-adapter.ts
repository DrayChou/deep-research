/**
 * 简化的PostgreSQL适配器
 * 统一数据库，环境信息保存在字段中
 */

import { Pool, PoolClient } from 'pg';
import { NextRequest } from 'next/server';
import { logger } from "@/utils/logger";
import { parseUserAgent } from "@/utils/user-agent-parser";
import * as crypto from 'crypto';

const dbLogger = logger.getInstance('SimplePGAdapter');

// 任务数据接口 - 添加环境和用户信息字段
export interface TaskData {
  id?: number;
  task_id: string;
  
  // 环境和客户信息 - 新增字段
  client_environment?: string; // 'local' | 'dev' | 'prod'
  client_user_id?: string;
  client_username?: string; // 从JWT中解析的用户名
  client_data_base_url?: string;
  client_jwt_hash?: string; // JWT的hash，不存储完整JWT
  client_source?: string; // 客户来源
  client_mode?: string; // API调用模式 'local' | 'proxy'
  
  // 现有字段
  current_step?: string | null;
  step_status?: string | null;
  finish_reason?: string | null;
  is_valid_complete?: boolean;
  retry_count?: number;
  processing_time?: number | null;
  created_at?: Date;
  updated_at?: Date;
  last_saved: Date;
  last_step_completed_at?: Date | null;
  progress: Record<string, any>;
  outputs: Record<string, any>;
  request_params?: Record<string, any>;
  model_config?: Record<string, any> | null;
  error_message?: string | null;
  user_agent?: string | null;
  ip_address?: string | null;
  is_deleted?: boolean;
  version?: number;
  
  // 新增用户环境信息字段
  browser_name?: string | null;        // 浏览器名称 (Chrome, Firefox, Safari等)
  browser_version?: string | null;     // 浏览器版本号
  os_name?: string | null;             // 操作系统名称 (Windows, macOS, Linux等)
  os_version?: string | null;          // 操作系统版本
  device_type?: string | null;         // 设备类型 (desktop, mobile, tablet)
  cpu_cores?: number | null;           // CPU核心数
  memory_size?: number | null;         // 内存大小 (MB)
  screen_resolution?: string | null;   // 屏幕分辨率 (1920x1080)
  timezone?: string | null;            // 时区信息
  language?: string | null;            // 浏览器语言
  platform?: string | null;           // 平台信息
  cpu_architecture?: string | null;    // CPU架构 (x64, arm64等)
}

export interface TaskStatus {
  currentStep?: string | null;
  stepStatus?: string | null;
  lastStepCompletedAt?: Date | null;
  finishReason?: string | null;
  isValidComplete?: boolean | null;
  retryCount?: number;
  processingTime?: number | null;
  modelConfig?: Record<string, any> | null;
  errorMessage?: string | null;
}

/**
 * 从请求中提取客户环境和用户信息
 */
function extractClientInfoFromRequest(req: NextRequest): {
  environment: string;
  userId?: string;
  username?: string;
  dataBaseUrl?: string;
  jwtHash?: string;
  source: string;
  mode?: string;
  userAgent?: string;
  ipAddress?: string;
  // 用户环境信息
  browserName?: string;
  browserVersion?: string;
  osName?: string;
  osVersion?: string;
  deviceType?: string;
  platform?: string;
  cpuArchitecture?: string;
} {
  // 1. 从URL参数获取
  const jwt = req.nextUrl.searchParams.get('jwt');
  const dataBaseUrl = req.nextUrl.searchParams.get('dataBaseUrl');
  const mode = req.nextUrl.searchParams.get('mode'); // API调用模式
  
  // 2. 从请求头获取
  const authHeader = req.headers.get('authorization');
  const finalJwt = jwt || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader);
  
  // 3. 提取User-Agent和IP信息
  const userAgent = req.headers.get('user-agent');
  const ipAddress = req.headers.get('x-forwarded-for') || 
                   req.headers.get('x-real-ip') || 
                   req.headers.get('cf-connecting-ip') || // Cloudflare
                   '127.0.0.1'; // fallback IP
  
  // 4. 解析User-Agent获取环境信息
  const parsedUA = userAgent ? parseUserAgent(userAgent) : {
    browser_name: null,
    browser_version: null,
    os_name: null,
    os_version: null,
    device_type: null,
    platform: null,
    cpu_architecture: null
  };
  
  // 3. 从路径推断dataBaseUrl
  let finalDataBaseUrl = dataBaseUrl;
  if (!finalDataBaseUrl) {
    const pathname = req.nextUrl.pathname;
    if (pathname.startsWith('/dp2api/')) {
      const host = req.headers.get('host') || 'localhost:8080';
      const protocol = req.headers.get('x-forwarded-proto') || 'http';
      finalDataBaseUrl = `${protocol}://${host}`;
    }
  }
  
  // 4. 判断环境
  let environment = 'local'; // 默认本地
  let source = 'fallback-local';
  
  // 根据 dataBaseUrl 判断环境
  if (finalDataBaseUrl) {
    if (finalDataBaseUrl.includes('localhost') || finalDataBaseUrl.includes('127.0.0.1')) {
      environment = 'local';
    } else if (/^\w+:\/\/\d+\.\d+\.\d+\.\d+(:80)?($|\/)/i.test(finalDataBaseUrl)) {
      // IP + 80端口格式 (如 http://192.168.1.100:80 或 http://192.168.1.100，80端口可以隐藏)
      environment = 'prod';
    } else if (/^\w+:\/\/\d+\.\d+\.\d+\.\d+:\d+/.test(finalDataBaseUrl)) {
      // IP + 其他端口号格式 (如 http://192.168.1.100:8080)
      environment = 'dev';
    } else if (/^\w+:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(finalDataBaseUrl)) {
      // 域名格式 (如 https://api.example.com)
      environment = 'prod';
    }
    source = finalJwt ? 'jwt-payload' : 'url-inference';
  }
  
  // 尝试解析JWT获取用户信息
  if (finalJwt) {
    try {
      const payload = parseJWTPayload(finalJwt);
      const userId = payload?.sub || payload?.id || payload?.user_id;
      const username = payload?.username || payload?.name || payload?.user_name || payload?.sub;
      
      return {
        environment,
        userId,
        username,
        dataBaseUrl: finalDataBaseUrl || undefined,
        jwtHash: hashString(finalJwt), // 存储JWT的hash而不是完整JWT
        source,
        mode: mode || 'local', // 默认为local模式
        userAgent: userAgent || undefined,
        ipAddress: ipAddress || undefined,
        // 用户环境信息
        browserName: parsedUA.browser_name || undefined,
        browserVersion: parsedUA.browser_version || undefined,
        osName: parsedUA.os_name || undefined,
        osVersion: parsedUA.os_version || undefined,
        deviceType: parsedUA.device_type || undefined,
        platform: parsedUA.platform || undefined,
        cpuArchitecture: parsedUA.cpu_architecture || undefined
      };
    } catch (error) {
      dbLogger.warn('JWT parsing failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }
  
  return {
    environment,
    dataBaseUrl: finalDataBaseUrl || undefined,
    source,
    mode: mode || 'local', // 默认为local模式
    userAgent: userAgent || undefined,
    ipAddress: ipAddress || undefined,
    // 用户环境信息
    browserName: parsedUA.browser_name || undefined,
    browserVersion: parsedUA.browser_version || undefined,
    osName: parsedUA.os_name || undefined,
    osVersion: parsedUA.os_version || undefined,
    deviceType: parsedUA.device_type || undefined,
    platform: parsedUA.platform || undefined,
    cpuArchitecture: parsedUA.cpu_architecture || undefined
  };
}

/**
 * 解析JWT payload
 */
function parseJWTPayload(jwt: string): any {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  
  const payload = parts[1];
  const decoded = Buffer.from(payload, 'base64').toString('utf8');
  return JSON.parse(decoded);
}

/**
 * 生成字符串hash
 */
function hashString(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
}

/**
 * 简化的PostgreSQL适配器
 */
export class SimplePGAdapter {
  private pool: Pool | null = null;
  private static instance: SimplePGAdapter;
  private config: any;
  private isConnected: boolean = false;
  
  constructor() {
    // 优先使用DATABASE_URL，如果不存在则使用单独的POSTGRES_*变量
    if (process.env.DATABASE_URL) {
      this.config = {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
        max: parseInt(process.env.DB_POOL_SIZE || '50'), // 支持50容器并发
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        application_name: 'deep_research_unified',
      };
      
      // 解析DATABASE_URL用于日志显示
      const url = new URL(process.env.DATABASE_URL);
      dbLogger.info('SimplePGAdapter configured from DATABASE_URL', {
        host: url.hostname,
        port: url.port || '5432',
        database: url.pathname.slice(1),
        maxConnections: this.config.max
      });
    } else {
      this.config = {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'deep_research',
        user: process.env.POSTGRES_USER || 'pgvector',
        password: process.env.POSTGRES_PASSWORD || 'pgvector',
        ssl: process.env.POSTGRES_SSL === 'true',
        max: parseInt(process.env.DB_POOL_SIZE || '50'), // 支持50容器并发
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        application_name: 'deep_research_unified',
      };
      
      dbLogger.info('SimplePGAdapter configured', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        maxConnections: this.config.max
      });
    }
  }
  
  /**
   * 确保数据库连接可用
   */
  private async ensureConnection(): Promise<void> {
    if (this.isConnected && this.pool) {
      return;
    }
    
    try {
      // 首先尝试连接目标数据库
      await this.connectToTargetDatabase();
    } catch (error) {
      dbLogger.warn('Cannot connect to target database, attempting to create it', {
        database: this.config.database,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // 如果连接失败，尝试创建数据库
      await this.createDatabaseIfNotExists();
      
      // 再次尝试连接目标数据库
      await this.connectToTargetDatabase();
    }
  }
  
  /**
   * 连接到目标数据库
   */
  private async connectToTargetDatabase(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
    
    this.pool = new Pool(this.config);
    
    this.pool.on('error', (err) => {
      dbLogger.error('PostgreSQL pool error', err);
      this.isConnected = false;
    });
    
    // 测试连接
    const client = await this.pool.connect();
    try {
      await client.query('SELECT NOW()');
      this.isConnected = true;
      dbLogger.info('Successfully connected to PostgreSQL database', {
        database: this.config.database
      });
    } finally {
      client.release();
    }
  }
  
  /**
   * 创建数据库（如果不存在）
   */
  private async createDatabaseIfNotExists(): Promise<void> {
    // 连接到默认的 postgres 数据库来创建目标数据库
    let adminConfig: any;
    
    if (this.config.connectionString) {
      // 如果使用connectionString，需要修改URL中的数据库名为postgres
      const url = new URL(this.config.connectionString);
      url.pathname = '/postgres'; // 修改数据库名为postgres
      adminConfig = {
        ...this.config,
        connectionString: url.toString()
      };
    } else {
      // 使用单独配置
      adminConfig = {
        ...this.config,
        database: 'postgres' // 连接到默认数据库
      };
    }
    
    const adminPool = new Pool(adminConfig);
    
    try {
      const client = await adminPool.connect();
      try {
        // 获取目标数据库名
        const targetDatabase = this.config.connectionString ? 
          new URL(this.config.connectionString).pathname.slice(1) : 
          this.config.database;
        
        // 检查数据库是否存在
        const result = await client.query(
          'SELECT 1 FROM pg_database WHERE datname = $1',
          [targetDatabase]
        );
        
        if (result.rows.length === 0) {
          // 数据库不存在，创建它
          dbLogger.info('Creating database', { database: targetDatabase });
          await client.query(`CREATE DATABASE "${targetDatabase}"`);
          dbLogger.info('Database created successfully', { database: targetDatabase });
        } else {
          dbLogger.info('Database already exists', { database: targetDatabase });
        }
      } finally {
        client.release();
      }
    } finally {
      await adminPool.end();
    }
  }
  
  static getInstance(): SimplePGAdapter {
    if (!SimplePGAdapter.instance) {
      SimplePGAdapter.instance = new SimplePGAdapter();
    }
    return SimplePGAdapter.instance;
  }
  
  /**
   * 初始化数据库表结构
   */
  async initialize(): Promise<void> {
    // 确保数据库连接可用
    await this.ensureConnection();
    
    if (!this.pool) {
      throw new Error('Database connection not available');
    }
    
    const client = await this.pool.connect();
    
    try {
      // 1. 创建schema
      await client.query(`CREATE SCHEMA IF NOT EXISTS deep_research`);
      
      // 2. 设置搜索路径
      await client.query(`SET search_path TO deep_research, public`);
      
      // 3. 检查表是否存在
      const tableExists = await this.checkTableExists(client, 'tasks');
      
      if (!tableExists) {
        await this.createTasksTable(client);
        await this.createIndexes(client);
        await this.createTriggers(client);
        dbLogger.info('Database initialized successfully');
      } else {
        // 检查是否需要添加新的环境信息字段
        await this.updateTableSchema(client);
        dbLogger.info('Database schema updated');
      }
      
    } finally {
      client.release();
    }
  }
  
  private async checkTableExists(client: PoolClient, tableName: string): Promise<boolean> {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'deep_research' 
        AND table_name = $1
      );
    `, [tableName]);
    return result.rows[0].exists;
  }
  
  private async createTasksTable(client: PoolClient): Promise<void> {
    const createSQL = `
      CREATE TABLE deep_research.tasks (
        id SERIAL PRIMARY KEY,
        task_id VARCHAR(500) NOT NULL UNIQUE,
        
        -- 客户环境信息字段 (新增)
        client_environment VARCHAR(20) DEFAULT 'local',
        client_user_id VARCHAR(1000),
        client_username VARCHAR(500),
        client_data_base_url VARCHAR(2000),
        client_jwt_hash VARCHAR(64),
        client_source VARCHAR(1000),
        client_mode VARCHAR(20) DEFAULT 'local',
        
        -- 业务状态字段
        current_step VARCHAR(100),
        step_status VARCHAR(50),
        finish_reason VARCHAR(200),
        is_valid_complete BOOLEAN DEFAULT FALSE,
        retry_count INTEGER DEFAULT 0,
        processing_time INTEGER,
        
        -- 时间字段
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_saved TIMESTAMP WITH TIME ZONE NOT NULL,
        last_step_completed_at TIMESTAMP WITH TIME ZONE,
        
        -- JSON数据字段
        progress JSONB NOT NULL DEFAULT '{}',
        outputs JSONB NOT NULL DEFAULT '{}',
        request_params JSONB DEFAULT '{}',
        model_config JSONB,
        
        -- 元数据字段
        error_message TEXT,
        user_agent VARCHAR(2000),
        ip_address INET,
        is_deleted BOOLEAN DEFAULT FALSE,
        version INTEGER DEFAULT 1,
        
        -- 用户环境信息字段 (新增)
        browser_name VARCHAR(100),
        browser_version VARCHAR(100),
        os_name VARCHAR(100),
        os_version VARCHAR(200),
        device_type VARCHAR(50),
        cpu_cores INTEGER,
        memory_size BIGINT,
        screen_resolution VARCHAR(50),
        timezone VARCHAR(100),
        language VARCHAR(50),
        platform VARCHAR(100),
        cpu_architecture VARCHAR(50)
      );
    `;
    
    await client.query(createSQL);
    dbLogger.info('Tasks table created');
  }
  
  private async updateTableSchema(client: PoolClient): Promise<void> {
    // 检查是否存在环境字段
    const envColumnsResult = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'deep_research' 
      AND table_name = 'tasks'
      AND column_name = 'client_environment';
    `);
    
    if (envColumnsResult.rows.length === 0) {
      // 添加环境信息字段
      await client.query(`
        ALTER TABLE deep_research.tasks 
        ADD COLUMN client_environment VARCHAR(20) DEFAULT 'local',
        ADD COLUMN client_user_id VARCHAR(1000),
        ADD COLUMN client_username VARCHAR(500),
        ADD COLUMN client_data_base_url VARCHAR(2000),
        ADD COLUMN client_jwt_hash VARCHAR(64),
        ADD COLUMN client_source VARCHAR(1000),
        ADD COLUMN client_mode VARCHAR(20) DEFAULT 'local';
      `);
      dbLogger.info('Environment fields added to existing table');
    }
    
    // 检查是否存在用户环境信息字段
    const userEnvColumnsResult = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'deep_research' 
      AND table_name = 'tasks'
      AND column_name = 'browser_name';
    `);
    
    if (userEnvColumnsResult.rows.length === 0) {
      // 添加用户环境信息字段
      await client.query(`
        ALTER TABLE deep_research.tasks 
        ADD COLUMN browser_name VARCHAR(100),
        ADD COLUMN browser_version VARCHAR(100),
        ADD COLUMN os_name VARCHAR(100),
        ADD COLUMN os_version VARCHAR(200),
        ADD COLUMN device_type VARCHAR(50),
        ADD COLUMN cpu_cores INTEGER,
        ADD COLUMN memory_size BIGINT,
        ADD COLUMN screen_resolution VARCHAR(50),
        ADD COLUMN timezone VARCHAR(100),
        ADD COLUMN language VARCHAR(50),
        ADD COLUMN platform VARCHAR(100),
        ADD COLUMN cpu_architecture VARCHAR(50);
      `);
      dbLogger.info('User environment fields added to existing table');
    }

    // Check and update field sizes for existing tables
    await this.updateFieldSizes(client);
  }

  /**
   * Update field sizes to handle longer data
   */
  private async updateFieldSizes(client: PoolClient): Promise<void> {
    try {
      // Check current field sizes
      const checkSQL = `
        SELECT column_name, character_maximum_length, data_type
        FROM information_schema.columns 
        WHERE table_schema = 'deep_research' 
        AND table_name = 'tasks' 
        ORDER BY column_name;
      `;
      
      const result = await client.query(checkSQL);
      dbLogger.info('Current field sizes before update:', { fields: result.rows });
      
      // Individual field updates with error recovery
      const fieldUpdates = [
        { field: 'task_id', type: 'VARCHAR(500)' },
        { field: 'client_user_id', type: 'VARCHAR(1000)' },
        { field: 'client_username', type: 'VARCHAR(500)' },
        { field: 'client_data_base_url', type: 'VARCHAR(2000)' },
        { field: 'client_source', type: 'VARCHAR(1000)' },
        { field: 'client_jwt_hash', type: 'VARCHAR(64)' },
        { field: 'current_step', type: 'VARCHAR(100)' },
        { field: 'step_status', type: 'VARCHAR(50)' },
        { field: 'finish_reason', type: 'VARCHAR(200)' },
        { field: 'user_agent', type: 'VARCHAR(2000)' },
        { field: 'browser_name', type: 'VARCHAR(100)' },
        { field: 'browser_version', type: 'VARCHAR(100)' },
        { field: 'os_name', type: 'VARCHAR(100)' },
        { field: 'os_version', type: 'VARCHAR(200)' },
        { field: 'device_type', type: 'VARCHAR(50)' },
        { field: 'screen_resolution', type: 'VARCHAR(50)' },
        { field: 'timezone', type: 'VARCHAR(100)' },
        { field: 'language', type: 'VARCHAR(50)' },
        { field: 'platform', type: 'VARCHAR(100)' },
        { field: 'cpu_architecture', type: 'VARCHAR(50)' }
      ];
      
      // Update each field individually to handle missing fields gracefully
      for (const update of fieldUpdates) {
        try {
          const updateSQL = `ALTER TABLE deep_research.tasks ALTER COLUMN ${update.field} TYPE ${update.type};`;
          await client.query(updateSQL);
          dbLogger.debug(`Updated field ${update.field} to ${update.type}`);
        } catch (fieldError) {
          dbLogger.warn(`Failed to update field ${update.field}:`, fieldError instanceof Error ? fieldError.message : String(fieldError));
          // Continue with other fields
        }
      }
      
      dbLogger.info('Field sizes updated to handle longer data');
      
      // Verify the update
      const verifyResult = await client.query(checkSQL);
      dbLogger.info('Field sizes after update:', { fields: verifyResult.rows });
      
    } catch (error) {
      dbLogger.error('Failed to update field sizes', error instanceof Error ? error : new Error(String(error)));
      // Don't throw - let the app continue, the schema creation might still work
    }
  }
  
  private async createIndexes(client: PoolClient): Promise<void> {
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_tasks_task_id ON deep_research.tasks(task_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_client_env ON deep_research.tasks(client_environment)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_client_user ON deep_research.tasks(client_user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_client_username ON deep_research.tasks(client_username)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_status ON deep_research.tasks(step_status, current_step)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON deep_research.tasks(updated_at)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_active ON deep_research.tasks(is_deleted, step_status) WHERE is_deleted = FALSE`,
    ];
    
    for (const indexSQL of indexes) {
      try {
        await client.query(indexSQL);
      } catch (error) {
        dbLogger.warn('Index creation warning', error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
  
  private async createTriggers(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE OR REPLACE FUNCTION deep_research.update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);
    
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_update_tasks_updated_at ON deep_research.tasks;
      CREATE TRIGGER trigger_update_tasks_updated_at
        BEFORE UPDATE ON deep_research.tasks
        FOR EACH ROW
        EXECUTE FUNCTION deep_research.update_updated_at_column();
    `);
  }
  
  /**
   * 保存任务数据 (根据请求自动添加环境信息)
   */
  async saveTaskWithRequest(req: NextRequest, taskData: TaskData): Promise<void> {
    await this.initialize();
    
    // 从请求中提取客户环境信息
    const clientInfo = extractClientInfoFromRequest(req);
    
    // 合并环境信息到任务数据
    const enrichedTaskData = {
      ...taskData,
      client_environment: clientInfo.environment,
      client_user_id: clientInfo.userId,
      client_username: clientInfo.username,
      client_data_base_url: clientInfo.dataBaseUrl,
      client_jwt_hash: clientInfo.jwtHash,
      client_source: clientInfo.source,
      client_mode: clientInfo.mode,
      // 用户环境信息 (新增)
      browser_name: clientInfo.browserName,
      browser_version: clientInfo.browserVersion,
      os_name: clientInfo.osName,
      os_version: clientInfo.osVersion,
      device_type: clientInfo.deviceType,
      platform: clientInfo.platform,
      cpu_architecture: clientInfo.cpuArchitecture,
      user_agent: clientInfo.userAgent,
      ip_address: clientInfo.ipAddress,
      last_saved: taskData.last_saved || new Date()
    };
    
    await this.saveTask(enrichedTaskData);
    
    dbLogger.debug('Task saved with client info', {
      taskId: taskData.task_id,
      clientEnvironment: clientInfo.environment,
      clientUserId: clientInfo.userId,
      clientUsername: clientInfo.username,
      clientSource: clientInfo.source,
      clientMode: clientInfo.mode
    });
  }
  
  /**
   * 基础保存任务方法
   */
  async saveTask(taskData: TaskData): Promise<void> {
    await this.ensureConnection();
    
    if (!this.pool) {
      throw new Error('Database connection not available');
    }
    
    const client = await this.pool.connect();
    
    try {
      // 检查是否已存在
      const existing = await this.getTask(taskData.task_id);
      
      if (existing) {
        await this.updateTask(client, taskData);
      } else {
        await this.insertTask(client, taskData);
      }
      
    } finally {
      client.release();
    }
  }
  
  private async insertTask(client: PoolClient, data: TaskData): Promise<void> {
    // 严格的数据类型检查和修复
    if (typeof data.task_id === 'object') {
      dbLogger.error('CRITICAL: task_id is an object, fixing...', new Error(`Task ID type error: ${JSON.stringify({
        originalTaskId: data.task_id,
        taskIdType: typeof data.task_id,
        taskIdKeys: Object.keys(data.task_id || {})
      })}`));
      // 如果task_id是对象，尝试提取真正的task_id
      if (data.task_id && typeof data.task_id === 'object' && 'task_id' in data.task_id) {
        data.task_id = (data.task_id as any).task_id;
        dbLogger.warn('Extracted task_id from nested object:', { extractedTaskId: data.task_id });
      } else {
        throw new Error(`Invalid task_id structure: ${JSON.stringify(data.task_id)}`);
      }
    }
    
    const insertSQL = `
      INSERT INTO deep_research.tasks (
        task_id, client_environment, client_user_id, client_username, 
        client_data_base_url, client_jwt_hash, client_source, client_mode,
        current_step, step_status, finish_reason, is_valid_complete, 
        retry_count, processing_time, created_at, updated_at, last_saved, 
        last_step_completed_at, progress, outputs, request_params, 
        model_config, error_message, user_agent, ip_address, is_deleted, version,
        browser_name, browser_version, os_name, os_version, device_type, 
        platform, cpu_architecture, cpu_cores, memory_size, screen_resolution, 
        timezone, language
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, 
        $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39
      )
    `;
    
    // 数据长度检查和截断，并且确保task_id是字符串
    const safeTaskId = String(data.task_id || '').substring(0, 500);
    if (safeTaskId === '[object Object]') {
      throw new Error('task_id converted to "[object Object]" - data structure corruption detected');
    }
    const safeClientUserId = (data.client_user_id || '').toString().substring(0, 1000);
    const safeClientUsername = (data.client_username || '').toString().substring(0, 500);
    const safeClientDataBaseUrl = (data.client_data_base_url || '').toString().substring(0, 2000);
    const safeClientSource = (data.client_source || 'unknown').toString().substring(0, 1000);
    const safeClientJwtHash = (data.client_jwt_hash || '').toString().substring(0, 64);
    const safeCurrentStep = (data.current_step || '').toString().substring(0, 100);
    const safeStepStatus = (data.step_status || '').toString().substring(0, 50);
    const safeFinishReason = (data.finish_reason || '').toString().substring(0, 200);
    const safeUserAgent = (data.user_agent || '').toString().substring(0, 2000);
    const safeErrorMessage = (data.error_message || '').toString().substring(0, 5000); // TEXT类型，给更大空间
    
    // JSON字段长度检查
    const progressJson = JSON.stringify(data.progress || {});
    const outputsJson = JSON.stringify(data.outputs || {});
    const requestParamsJson = JSON.stringify(data.request_params || {});
    const modelConfigJson = data.model_config ? JSON.stringify(data.model_config) : null;
    
    // 记录原始数据内容和长度供调试
    dbLogger.debug('Original data before processing:', {
      taskId: { value: data.task_id, length: (data.task_id || '').toString().length },
      clientUserId: { value: data.client_user_id, length: (data.client_user_id || '').toString().length },
      clientUsername: { value: data.client_username, length: (data.client_username || '').toString().length },
      clientSource: { value: data.client_source, length: (data.client_source || '').toString().length },
      currentStep: { value: data.current_step, length: (data.current_step || '').toString().length },
      finishReason: { value: data.finish_reason, length: (data.finish_reason || '').toString().length },
      userAgent: { value: data.user_agent, length: (data.user_agent || '').toString().length },
      errorMessage: { value: data.error_message, length: (data.error_message || '').toString().length },
      progressJson: { length: progressJson.length, preview: progressJson.substring(0, 100) },
      outputsJson: { length: outputsJson.length, preview: outputsJson.substring(0, 100) },
      requestParamsJson: { length: requestParamsJson.length, preview: requestParamsJson.substring(0, 100) }
    });
    
    dbLogger.debug('Safe data after truncation:', {
      taskId: safeTaskId.length,
      clientUserId: safeClientUserId.length,
      clientUsername: safeClientUsername.length,
      clientDataBaseUrl: safeClientDataBaseUrl.length,
      clientSource: safeClientSource.length,
      clientJwtHash: safeClientJwtHash.length,
      currentStep: safeCurrentStep.length,
      stepStatus: safeStepStatus.length,
      finishReason: safeFinishReason.length,
      userAgent: safeUserAgent.length,
      errorMessage: safeErrorMessage.length
    });

    const values = [
      safeTaskId,
      data.client_environment || 'local',
      safeClientUserId || null,
      safeClientUsername || null,
      safeClientDataBaseUrl || null,
      safeClientJwtHash || null,
      safeClientSource,
      data.client_mode || 'local',
      safeCurrentStep || null,
      safeStepStatus || null,
      safeFinishReason || null,
      data.is_valid_complete || false,
      data.retry_count || 0,
      data.processing_time || null,
      data.created_at || new Date(),
      data.updated_at || new Date(),
      data.last_saved,
      data.last_step_completed_at || null,
      progressJson,
      outputsJson,
      requestParamsJson,
      modelConfigJson,
      safeErrorMessage || null,
      safeUserAgent || null,
      data.ip_address || null,
      data.is_deleted || false,
      data.version || 1,
      // 用户环境信息字段
      data.browser_name || null,
      data.browser_version || null,
      data.os_name || null,
      data.os_version || null,
      data.device_type || null,
      data.platform || null,
      data.cpu_architecture || null,
      data.cpu_cores || null,
      data.memory_size || null,
      data.screen_resolution || null,
      data.timezone || null,
      data.language || null
    ];
    
    await client.query(insertSQL, values);
  }
  
  private async updateTask(client: PoolClient, data: TaskData): Promise<void> {
    const updateSQL = `
      UPDATE deep_research.tasks SET 
        client_environment = COALESCE($2, client_environment),
        client_user_id = COALESCE($3, client_user_id),
        client_username = COALESCE($4, client_username),
        client_data_base_url = COALESCE($5, client_data_base_url),
        client_jwt_hash = COALESCE($6, client_jwt_hash),
        client_source = COALESCE($7, client_source),
        client_mode = COALESCE($8, client_mode),
        current_step = COALESCE($9, current_step),
        step_status = COALESCE($10, step_status),
        finish_reason = COALESCE($11, finish_reason),
        is_valid_complete = COALESCE($12, is_valid_complete),
        retry_count = COALESCE($13, retry_count),
        processing_time = COALESCE($14, processing_time),
        last_saved = $15,
        last_step_completed_at = COALESCE($16, last_step_completed_at),
        progress = COALESCE($17, progress),
        outputs = COALESCE($18, outputs),
        request_params = COALESCE($19, request_params),
        model_config = COALESCE($20, model_config),
        error_message = COALESCE($21, error_message),
        user_agent = COALESCE($22, user_agent),
        ip_address = COALESCE($23, ip_address),
        browser_name = COALESCE($24, browser_name),
        browser_version = COALESCE($25, browser_version),
        os_name = COALESCE($26, os_name),
        os_version = COALESCE($27, os_version),
        device_type = COALESCE($28, device_type),
        platform = COALESCE($29, platform),
        cpu_architecture = COALESCE($30, cpu_architecture),
        cpu_cores = COALESCE($31, cpu_cores),
        memory_size = COALESCE($32, memory_size),
        screen_resolution = COALESCE($33, screen_resolution),
        timezone = COALESCE($34, timezone),
        language = COALESCE($35, language),
        version = version + 1
      WHERE task_id = $1 AND is_deleted = FALSE
    `;
    
    const values = [
      data.task_id,
      data.client_environment,
      data.client_user_id,
      data.client_username,
      data.client_data_base_url,
      data.client_jwt_hash,
      data.client_source,
      data.client_mode,
      data.current_step,
      data.step_status,
      data.finish_reason,
      data.is_valid_complete,
      data.retry_count,
      data.processing_time,
      data.last_saved,
      data.last_step_completed_at,
      data.progress ? JSON.stringify(data.progress) : null,
      data.outputs ? JSON.stringify(data.outputs) : null,
      data.request_params ? JSON.stringify(data.request_params) : null,
      data.model_config ? JSON.stringify(data.model_config) : null,
      data.error_message,
      data.user_agent,
      data.ip_address,
      // 用户环境信息字段
      data.browser_name,
      data.browser_version,
      data.os_name,
      data.os_version,
      data.device_type,
      data.platform,
      data.cpu_architecture,
      data.cpu_cores,
      data.memory_size,
      data.screen_resolution,
      data.timezone,
      data.language
    ];
    
    await client.query(updateSQL, values);
  }
  
  /**
   * 获取任务
   */
  async getTask(taskId: string): Promise<TaskData | null> {
    await this.ensureConnection();
    
    if (!this.pool) {
      throw new Error('Database connection not available');
    }
    
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT * FROM deep_research.tasks 
        WHERE task_id = $1 AND is_deleted = FALSE
      `, [taskId]);
      
      if (result.rows.length === 0) return null;
      
      const row = result.rows[0];
      return {
        id: row.id,
        task_id: row.task_id,
        client_environment: row.client_environment,
        client_user_id: row.client_user_id,
        client_username: row.client_username,
        client_data_base_url: row.client_data_base_url,
        client_jwt_hash: row.client_jwt_hash,
        client_source: row.client_source,
        client_mode: row.client_mode,
        current_step: row.current_step,
        step_status: row.step_status,
        finish_reason: row.finish_reason,
        is_valid_complete: row.is_valid_complete,
        retry_count: row.retry_count,
        processing_time: row.processing_time,
        created_at: row.created_at,
        updated_at: row.updated_at,
        last_saved: row.last_saved,
        last_step_completed_at: row.last_step_completed_at,
        progress: row.progress || {},
        outputs: row.outputs || {},
        request_params: row.request_params || {},
        model_config: row.model_config,
        error_message: row.error_message,
        user_agent: row.user_agent,
        ip_address: row.ip_address,
        is_deleted: row.is_deleted,
        version: row.version,
        // 用户环境信息字段
        browser_name: row.browser_name,
        browser_version: row.browser_version,
        os_name: row.os_name,
        os_version: row.os_version,
        device_type: row.device_type,
        cpu_cores: row.cpu_cores,
        memory_size: row.memory_size,
        screen_resolution: row.screen_resolution,
        timezone: row.timezone,
        language: row.language,
        platform: row.platform,
        cpu_architecture: row.cpu_architecture
      };
      
    } finally {
      client.release();
    }
  }
  
  /**
   * 获取所有任务
   */
  async getAllTasks(): Promise<TaskData[]> {
    await this.ensureConnection();
    
    if (!this.pool) {
      throw new Error('Database connection not available');
    }
    
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT * FROM deep_research.tasks 
        WHERE is_deleted = FALSE
        ORDER BY created_at DESC
        LIMIT 1000
      `);
      
      const tasks: TaskData[] = [];
      
      for (const row of result.rows) {
        tasks.push({
          id: row.id,
          task_id: row.task_id,
          client_environment: row.client_environment,
          client_user_id: row.client_user_id,
          client_username: row.client_username,
          client_data_base_url: row.client_data_base_url,
          client_jwt_hash: row.client_jwt_hash,
          client_source: row.client_source,
          client_mode: row.client_mode,
          current_step: row.current_step,
          step_status: row.step_status,
          finish_reason: row.finish_reason,
          is_valid_complete: row.is_valid_complete,
          retry_count: row.retry_count,
          processing_time: row.processing_time,
          created_at: row.created_at,
          updated_at: row.updated_at,
          last_saved: row.last_saved,
          last_step_completed_at: row.last_step_completed_at,
          progress: row.progress,
          outputs: row.outputs,
          request_params: row.request_params,
          model_config: row.model_config,
          error_message: row.error_message,
          user_agent: row.user_agent,
          ip_address: row.ip_address,
          is_deleted: row.is_deleted,
          version: row.version,
          browser_name: row.browser_name,
          browser_version: row.browser_version,
          os_name: row.os_name,
          os_version: row.os_version,
          device_type: row.device_type,
          cpu_cores: row.cpu_cores,
          memory_size: row.memory_size,
          screen_resolution: row.screen_resolution,
          timezone: row.timezone,
          language: row.language,
          platform: row.platform,
          cpu_architecture: row.cpu_architecture
        });
      }
      
      return tasks;
      
    } finally {
      client.release();
    }
  }
  
  /**
   * 更新任务状态
   */
  async updateTaskStatus(taskId: string, statusData: TaskStatus): Promise<void> {
    await this.ensureConnection();
    
    if (!this.pool) {
      throw new Error('Database connection not available');
    }
    
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        UPDATE deep_research.tasks SET
          current_step = COALESCE($2, current_step),
          step_status = COALESCE($3, step_status),
          finish_reason = COALESCE($4, finish_reason),
          is_valid_complete = COALESCE($5, is_valid_complete),
          last_step_completed_at = COALESCE($6, last_step_completed_at),
          retry_count = COALESCE($7, retry_count),
          processing_time = COALESCE($8, processing_time),
          model_config = COALESCE($9, model_config),
          error_message = COALESCE($10, error_message),
          last_saved = $11,
          version = version + 1
        WHERE task_id = $1 AND is_deleted = FALSE
      `, [
        taskId,
        statusData.currentStep,
        statusData.stepStatus,
        statusData.finishReason,
        statusData.isValidComplete,
        statusData.lastStepCompletedAt,
        statusData.retryCount,
        statusData.processingTime,
        statusData.modelConfig ? JSON.stringify(statusData.modelConfig) : null,
        statusData.errorMessage,
        new Date()
      ]);
      
    } finally {
      client.release();
    }
  }
  
  /**
   * 获取任务统计 (按环境分组)
   */
  async getTaskStatsByEnvironment(): Promise<Record<string, any>> {
    await this.ensureConnection();
    
    if (!this.pool) {
      throw new Error('Database connection not available');
    }
    
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          client_environment,
          COUNT(*) as total,
          SUM(CASE WHEN step_status = 'running' THEN 1 ELSE 0 END) as running,
          SUM(CASE WHEN step_status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN step_status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(retry_count) as total_retries,
          AVG(processing_time) as avg_processing_time
        FROM deep_research.tasks 
        WHERE is_deleted = FALSE
        GROUP BY client_environment
        ORDER BY client_environment
      `);
      
      const stats: Record<string, any> = {};
      for (const row of result.rows) {
        stats[row.client_environment] = {
          total: parseInt(row.total),
          running: parseInt(row.running),
          completed: parseInt(row.completed),
          failed: parseInt(row.failed),
          totalRetries: parseInt(row.total_retries),
          avgProcessingTime: row.avg_processing_time ? parseFloat(row.avg_processing_time) : null
        };
      }
      
      return stats;
      
    } finally {
      client.release();
    }
  }
  
  /**
   * 健康检查
   */
  async healthCheck(): Promise<{ connected: boolean; error?: string }> {
    try {
      await this.ensureConnection();
      
      if (!this.pool) {
        return { connected: false, error: 'Database pool not available' };
      }
      
      const client = await this.pool.connect();
      try {
        await client.query('SELECT NOW()');
        return { connected: true };
      } finally {
        client.release();
      }
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * 获取连接池状态
   */
  getPoolStatus() {
    if (!this.pool) {
      return {
        totalConnections: 0,
        idleConnections: 0,
        waitingClients: 0,
        connected: false
      };
    }
    
    return {
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      waitingClients: this.pool.waitingCount,
      connected: this.isConnected
    };
  }
  
  /**
   * 关闭连接池
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
      dbLogger.info('SimplePGAdapter closed');
    }
  }
}

// 导出便捷函数
export async function saveTaskWithRequest(req: NextRequest, taskData: TaskData): Promise<void> {
  const adapter = SimplePGAdapter.getInstance();
  await adapter.saveTaskWithRequest(req, taskData);
}

export async function getTask(taskId: string): Promise<TaskData | null> {
  const adapter = SimplePGAdapter.getInstance();
  return await adapter.getTask(taskId);
}

export async function updateTaskStatus(taskId: string, statusData: TaskStatus): Promise<void> {
  const adapter = SimplePGAdapter.getInstance();
  await adapter.updateTaskStatus(taskId, statusData);
}

// SimplePGAdapter is already exported above as class declaration