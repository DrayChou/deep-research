/* eslint-disable @typescript-eslint/no-require-imports */
// 智能SQLite数据库选择器 - 启动时检测可用库，运行时直接使用
import * as path from 'node:path';
import * as fs from 'node:fs';

// SQLite实现类型
type SQLiteImplementation = 'better-sqlite3' | 'node-sqlite' | 'none';

// 全局可用的SQLite实现
let availableImplementation: SQLiteImplementation = 'none';
let sqliteModule: any = null;

// 在Next.js环境下直接使用require，不需要特殊处理

// 已移除异步检测函数，现在使用同步版本避免在请求处理时进行检测

interface TaskProgress {
  step: string;
  percentage: number;
  status: 'running' | 'paused' | 'completed' | 'failed';
  messages: string[];
  result?: any;
  error?: string;
  timestamp: string;
}

// 请求参数接口
interface TaskRequestParams {
  userId?: string;
  userMessageId?: string;
  topicId?: string;
  query: string;
  language: string;
  aiProvider: string;
  thinkingModel: string;
  taskModel: string;
  searchProvider: string;
  maxResult: number;
  enableCitationImage: boolean;
  enableReferences: boolean;
  mode?: string;
  dataBaseUrl?: string;
}

interface TaskData {
  taskId: string;
  progress: TaskProgress;
  outputs: string[];
  lastSaved: string;
  // 新增字段
  requestParams: TaskRequestParams;
  createdAt: string;
  updatedAt: string;
}

// 数据库抽象接口
interface DatabaseInterface {
  saveTask(taskId: string, progress: TaskProgress, outputs: string[], requestParams: TaskRequestParams): void;
  getTask(taskId: string): TaskData | null;
  getAllTasks(): TaskData[];
  deleteTask(taskId: string): void;
  getTaskStats(): { total: number; running: number; completed: number; failed: number };
  getTasksByStatus(status: 'running' | 'paused' | 'completed' | 'failed'): TaskData[];
  healthCheck(): { status: 'ok' | 'error'; message: string };
  cleanupOldTasks(daysToKeep: number): number;
  close(): void;
}

/**
 * 统一的SQLite数据库实现 - 根据检测结果使用相应的库
 */
class UnifiedSQLiteDatabase implements DatabaseInterface {
  private db: any;
  private storageDir: string;
  private implementation: SQLiteImplementation;

  constructor(storageDir: string) {
    this.storageDir = storageDir;
    this.implementation = availableImplementation;
    this.ensureStorageDir();
    
    if (this.implementation === 'none') {
      throw new Error('No SQLite implementation available - database functionality disabled');
    }
    
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    try {
      const dbPath = path.join(this.storageDir, 'tasks.db');
      
      if (this.implementation === 'better-sqlite3') {
        this.db = new sqliteModule(dbPath);
        console.log('Using Better-SQLite3 database');
      } else if (this.implementation === 'node-sqlite') {
        this.db = new sqliteModule.DatabaseSync(dbPath);
        console.log('Using Node.js built-in SQLite database');
      }
      
      this.initializeTables();
    } catch (error) {
      console.error('Failed to initialize database:', error);
      this.db = null;
      throw error;
    }
  }

  private ensureStorageDir(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  private initializeTables(): void {
    // 首先创建基础表结构
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT PRIMARY KEY,
        progress TEXT NOT NULL,
        outputs TEXT NOT NULL,
        last_saved TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    // 执行基础创建
    this.db.exec(createTableSQL);
    
    // 检查并添加新字段（数据库迁移）
    this.migrateSchema();
    
    // 创建索引
    const indexSQL = `
      CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
    `;
    
    this.db.exec(indexSQL);
    
    // 为新字段创建JSON索引（如果字段存在）
    try {
      const jsonIndexSQL = this.implementation === 'better-sqlite3' 
        ? `
          CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(JSON_EXTRACT(request_params, '$.userId'));
          CREATE INDEX IF NOT EXISTS idx_tasks_topic_id ON tasks(JSON_EXTRACT(request_params, '$.topicId'));
        `
        : `
          CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(json_extract(request_params, '$.userId'));
          CREATE INDEX IF NOT EXISTS idx_tasks_topic_id ON tasks(json_extract(request_params, '$.topicId'));
        `;
      this.db.exec(jsonIndexSQL);
    } catch {
      console.log('JSON indexes creation skipped (request_params column may not exist yet)');
    }
    
    // 设置SQLite优化参数
    if (this.implementation === 'better-sqlite3') {
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
    } else if (this.implementation === 'node-sqlite') {
      this.db.exec(`
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
      `);
    }
    
    console.log(`${this.implementation} database tables initialized successfully`);
  }

  private getDefaultRequestParams(): TaskRequestParams {
    return {
      query: '',
      language: 'zh-CN',
      aiProvider: 'unknown',
      thinkingModel: 'unknown',
      taskModel: 'unknown',
      searchProvider: 'unknown',
      maxResult: 50,
      enableCitationImage: true,
      enableReferences: true
    };
  }

  private migrateSchema(): void {
    try {
      // 检查是否存在request_params字段
      const tableInfo = this.db.prepare("PRAGMA table_info(tasks)").all();
      const hasRequestParams = tableInfo.some((column: any) => column.name === 'request_params');
      
      if (!hasRequestParams) {
        console.log('Migrating database schema: adding request_params column...');
        
        // 添加新字段，使用默认的空JSON对象
        this.db.exec(`
          ALTER TABLE tasks ADD COLUMN request_params TEXT DEFAULT '{}';
        `);
        
        // 为现有记录设置默认的请求参数
        this.db.prepare(`
          UPDATE tasks 
          SET request_params = json('{"query":"","language":"zh-CN","aiProvider":"unknown","thinkingModel":"unknown","taskModel":"unknown","searchProvider":"unknown","maxResult":50,"enableCitationImage":true,"enableReferences":true}')
          WHERE request_params = '{}' OR request_params IS NULL
        `).run();
        
        console.log('✓ Database schema migration completed');
      }
    } catch (error) {
      console.error('Schema migration failed:', error);
      // 如果迁移失败，不影响应用启动
    }
  }

  saveTask(taskId: string, progress: TaskProgress, outputs: string[], requestParams: TaskRequestParams): void {
    try {
      if (!this.db) {
        throw new Error(`Database not initialized - ${this.implementation} unavailable`);
      }
      
      const sql = this.implementation === 'better-sqlite3' 
        ? `INSERT OR REPLACE INTO tasks (task_id, progress, outputs, last_saved, request_params, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
        : `INSERT OR REPLACE INTO tasks (task_id, progress, outputs, last_saved, request_params, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`;
      
      const stmt = this.db.prepare(sql);
      stmt.run(
        taskId,
        JSON.stringify(progress),
        JSON.stringify(outputs),
        new Date().toISOString(),
        JSON.stringify(requestParams)
      );
    } catch (error) {
      console.error(`Failed to save task ${taskId}:`, error);
      throw error; // 重新抛出错误，不要静默失败
    }
  }

  getTask(taskId: string): TaskData | null {
    try {
      if (!this.db) {
        throw new Error(`Database not initialized - ${this.implementation} unavailable`);
      }
      const stmt = this.db.prepare(`
        SELECT task_id, progress, outputs, last_saved, request_params, created_at, updated_at
        FROM tasks WHERE task_id = ?
      `);

      const row = stmt.get(taskId);
      if (!row) return null;

      return {
        taskId: row.task_id,
        progress: JSON.parse(row.progress),
        outputs: JSON.parse(row.outputs),
        lastSaved: row.last_saved,
        requestParams: row.request_params ? JSON.parse(row.request_params) : this.getDefaultRequestParams(),
        createdAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || new Date().toISOString()
      };
    } catch (error) {
      console.error(`Failed to get task ${taskId}:`, error);
      throw error; // 重新抛出错误
    }
  }

  getAllTasks(): TaskData[] {
    try {
      if (!this.db) {
        throw new Error(`Database not initialized - ${this.implementation} unavailable`);
      }
      const stmt = this.db.prepare(`
        SELECT task_id, progress, outputs, last_saved, request_params, created_at, updated_at
        FROM tasks ORDER BY updated_at DESC
      `);

      const rows = stmt.all();
      return rows.map((row: any) => ({
        taskId: row.task_id,
        progress: JSON.parse(row.progress),
        outputs: JSON.parse(row.outputs),
        lastSaved: row.last_saved,
        requestParams: row.request_params ? JSON.parse(row.request_params) : this.getDefaultRequestParams(),
        createdAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || new Date().toISOString()
      }));
    } catch (error) {
      console.error('Failed to get all tasks:', error);
      throw error; // 重新抛出错误
    }
  }

  deleteTask(taskId: string): void {
    try {
      if (!this.db) {
        throw new Error(`Database not initialized - ${this.implementation} unavailable`);
      }
      const stmt = this.db.prepare('DELETE FROM tasks WHERE task_id = ?');
      stmt.run(taskId);
    } catch (error) {
      console.error(`Failed to delete task ${taskId}:`, error);
    }
  }

  getTaskStats(): { total: number; running: number; completed: number; failed: number } {
    try {
      if (!this.db) {
        throw new Error(`Database not initialized - ${this.implementation} unavailable`);
      }
      
      // JSON提取语法在不同实现中相同
      const jsonExtract = this.implementation === 'better-sqlite3' ? 'JSON_EXTRACT' : 'json_extract';
      const stmt = this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN ${jsonExtract}(progress, '$.status') = 'running' THEN 1 ELSE 0 END) as running,
          SUM(CASE WHEN ${jsonExtract}(progress, '$.status') = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN ${jsonExtract}(progress, '$.status') = 'failed' THEN 1 ELSE 0 END) as failed
        FROM tasks
      `);

      const row = stmt.get();
      return {
        total: row.total || 0,
        running: row.running || 0,
        completed: row.completed || 0,
        failed: row.failed || 0
      };
    } catch (error) {
      console.error('Failed to get task stats:', error);
      return { total: 0, running: 0, completed: 0, failed: 0 };
    }
  }

  getTasksByStatus(status: 'running' | 'paused' | 'completed' | 'failed'): TaskData[] {
    try {
      if (!this.db) {
        throw new Error(`Database not initialized - ${this.implementation} unavailable`);
      }
      
      const jsonExtract = this.implementation === 'better-sqlite3' ? 'JSON_EXTRACT' : 'json_extract';
      const stmt = this.db.prepare(`
        SELECT task_id, progress, outputs, last_saved, request_params, created_at, updated_at
        FROM tasks 
        WHERE ${jsonExtract}(progress, '$.status') = ?
        ORDER BY updated_at DESC
      `);

      const rows = stmt.all(status);
      return rows.map((row: any) => ({
        taskId: row.task_id,
        progress: JSON.parse(row.progress),
        outputs: JSON.parse(row.outputs),
        lastSaved: row.last_saved,
        requestParams: row.request_params ? JSON.parse(row.request_params) : this.getDefaultRequestParams(),
        createdAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || new Date().toISOString()
      }));
    } catch (error) {
      console.error(`Failed to get tasks by status ${status}:`, error);
      throw error; // 重新抛出错误
    }
  }

  healthCheck(): { status: 'ok' | 'error'; message: string } {
    try {
      if (!this.db) {
        throw new Error(`Database not initialized - ${this.implementation} unavailable`);
      }
      
      const stmt = this.db.prepare('SELECT COUNT(*) as count FROM tasks');
      const result = stmt.get();
      return {
        status: 'ok',
        message: `${this.implementation} database healthy with ${result.count} tasks`
      };
    } catch (error) {
      return {
        status: 'error',
        message: `${this.implementation} database error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  cleanupOldTasks(daysToKeep: number = 7): number {
    try {
      if (!this.db) {
        throw new Error(`Database not initialized - ${this.implementation} unavailable`);
      }
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const jsonExtract = this.implementation === 'better-sqlite3' ? 'JSON_EXTRACT' : 'json_extract';
      const stmt = this.db.prepare(`
        DELETE FROM tasks 
        WHERE updated_at < ? 
        AND ${jsonExtract}(progress, '$.status') IN ('completed', 'failed')
      `);

      const result = stmt.run(cutoffDate.toISOString());
      return this.implementation === 'better-sqlite3' ? result.changes : result.changes;
    } catch (error) {
      console.error('Failed to cleanup old tasks:', error);
      return 0;
    }
  }

  close(): void {
    try {
      if (this.db) {
        this.db.close();
      }
    } catch (error) {
      console.error(`Failed to close ${this.implementation} database:`, error);
    }
  }
}

// 已弃用的异步数据库工厂函数 - 保留以防兼容性问题，但不再使用
// 现在使用 TaskDatabase 类的同步初始化方式

/**
 * 主要导出的数据库类 - 智能代理（同步初始化版本）
 */
class TaskDatabase implements DatabaseInterface {
  private instance: DatabaseInterface;

  constructor(private storageDir: string) {
    // 同步初始化 - 如果失败则构造函数抛出异常
    this.instance = this.createDatabaseSync();
  }

  private createDatabaseSync(): DatabaseInterface {
    try {
      // 在构造时就检测并创建数据库实例
      if (availableImplementation === 'none') {
        // 同步检测可用的SQLite实现
        this.detectAvailableSQLiteSync();
      }
      
      if (availableImplementation === 'none') {
        throw new Error('SQLite database is required but no implementation is available.\nPlease install better-sqlite3 or ensure Node.js built-in SQLite is available.');
      }
      
      console.log(`Creating database with ${availableImplementation} implementation...`);
      return new UnifiedSQLiteDatabase(this.storageDir);
    } catch (error) {
      console.error('Failed to create database:', error);
      throw error;
    }
  }

  private detectAvailableSQLiteSync(): void {
    console.log('Detecting available SQLite implementations...');
    
    // 策略1：优先检测Better-SQLite3
    try {
      sqliteModule = require('better-sqlite3');
      availableImplementation = 'better-sqlite3';
      console.log('✓ Better-SQLite3 is available and ready to use');
      return;
    } catch (error) {
      console.log('✗ Better-SQLite3 not available:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    // 策略2：回退到Node.js内置SQLite
    try {
      const { DatabaseSync } = require('node:sqlite');
      sqliteModule = { DatabaseSync };
      availableImplementation = 'node-sqlite';
      console.log('✓ Node.js built-in SQLite is available and ready to use');
      return;
    } catch (error) {
      console.log('✗ Node.js built-in SQLite not available:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    // 如果都不可用，记录错误
    availableImplementation = 'none';
    console.error('✗ No SQLite implementation available! Database functionality cannot be enabled.');
  }

  saveTask(taskId: string, progress: TaskProgress, outputs: string[], requestParams: TaskRequestParams): void {
    if (!this.instance) {
      throw new Error('Database not initialized - cannot save task');
    }
    return this.instance.saveTask(taskId, progress, outputs, requestParams);
  }

  getTask(taskId: string): TaskData | null {
    if (!this.instance) {
      throw new Error('Database not initialized - cannot get task');
    }
    return this.instance.getTask(taskId);
  }

  getAllTasks(): TaskData[] {
    if (!this.instance) {
      throw new Error('Database not initialized - cannot get tasks');
    }
    return this.instance.getAllTasks();
  }

  deleteTask(taskId: string): void {
    if (!this.instance) {
      throw new Error('Database not initialized - cannot delete task');
    }
    return this.instance.deleteTask(taskId);
  }

  getTaskStats(): { total: number; running: number; completed: number; failed: number } {
    if (!this.instance) {
      throw new Error('Database not initialized - cannot get task stats');
    }
    return this.instance.getTaskStats();
  }

  getTasksByStatus(status: 'running' | 'paused' | 'completed' | 'failed'): TaskData[] {
    if (!this.instance) {
      throw new Error('Database not initialized - cannot get tasks by status');
    }
    return this.instance.getTasksByStatus(status);
  }

  healthCheck(): { status: 'ok' | 'error'; message: string } {
    if (!this.instance) {
      throw new Error('Database not initialized - cannot perform health check');
    }
    return this.instance.healthCheck();
  }

  cleanupOldTasks(daysToKeep: number = 7): number {
    if (!this.instance) {
      throw new Error('Database not initialized - cannot cleanup tasks');
    }
    return this.instance.cleanupOldTasks(daysToKeep);
  }

  close(): void {
    if (this.instance) {
      this.instance.close();
    }
  }
}

// 不再导出异步检测函数，避免在请求处理时被误用
export default TaskDatabase;