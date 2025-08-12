/* eslint-disable @typescript-eslint/no-require-imports */
// 智能SQLite数据库选择器 - 启动时检测可用库，运行时直接使用
import * as path from 'node:path';
import * as fs from 'node:fs';

// SQLite实现类型 - 只支持Node.js内置SQLite
type SQLiteImplementation = 'node-sqlite' | 'none';

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
  // 任务状态跟踪字段
  currentStep?: string; // 当前执行到的步骤：'report-plan' | 'serp-query' | 'search' | 'final-report'
  stepStatus?: string; // 步骤状态：'running' | 'completed' | 'failed'
  finishReason?: string; // 最终报告的完成原因：'stop' | 'length' | 'unknown' | 'error' 等
  isValidComplete?: boolean; // 是否是有效的完成状态
  lastStepCompletedAt?: string; // 最后一个步骤完成时间
}

// 数据库抽象接口
interface DatabaseInterface {
  saveTask(taskId: string, progress: TaskProgress, outputs: string[], requestParams: TaskRequestParams): void;
  saveTaskWithStatus(taskId: string, progress: TaskProgress, outputs: string[], requestParams: TaskRequestParams, statusData: TaskStatusData): void;
  getTask(taskId: string): TaskData | null;
  getAllTasks(): TaskData[];
  deleteTask(taskId: string): void;
  archiveTask(taskId: string): void; // 归档任务（添加废弃时间戳重命名）
  getTaskStats(): { total: number; running: number; completed: number; failed: number };
  getTasksByStatus(status: 'running' | 'paused' | 'completed' | 'failed'): TaskData[];
  healthCheck(): { status: 'ok' | 'error'; message: string };
  cleanupOldTasks(daysToKeep: number): number;
  close(): void;
}

// 任务状态数据接口
interface TaskStatusData {
  currentStep?: string;
  stepStatus?: string;
  finishReason?: string;
  isValidComplete?: boolean;
  lastStepCompletedAt?: string;
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
      console.log(`Initializing SQLite database at: ${dbPath}`);
      
      if (this.implementation === 'node-sqlite') {
        // 检查父目录权限
        const parentDir = path.dirname(dbPath);
        if (!fs.existsSync(parentDir)) {
          throw new Error(`Database parent directory does not exist: ${parentDir}`);
        }
        
        try {
          this.db = new sqliteModule.DatabaseSync(dbPath);
          console.log('✓ Node.js built-in SQLite database initialized successfully');
        } catch (sqliteError) {
          console.error('SQLite initialization failed:', sqliteError);
          console.error('Database path:', dbPath);
          console.error('Parent directory exists:', fs.existsSync(parentDir));
          console.error('Parent directory stats:', fs.statSync(parentDir));
          throw sqliteError;
        }
      } else {
        throw new Error(`Unsupported SQLite implementation: ${this.implementation}`);
      }
      
      this.initializeTables();
    } catch (error) {
      console.error('Failed to initialize database:', error);
      this.db = null;
      throw error;
    }
  }

  private ensureStorageDir(): void {
    try {
      if (!fs.existsSync(this.storageDir)) {
        console.log(`Creating storage directory: ${this.storageDir}`);
        fs.mkdirSync(this.storageDir, { recursive: true, mode: 0o755 });
      }
      
      // 测试目录是否可写
      const testFile = path.join(this.storageDir, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      
      console.log(`✓ Storage directory verified: ${this.storageDir}`);
    } catch (error) {
      console.error(`Failed to ensure storage directory: ${this.storageDir}`, error);
      throw new Error(`Storage directory not accessible: ${this.storageDir}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      const jsonIndexSQL = `
        CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(json_extract(request_params, '$.userId'));
        CREATE INDEX IF NOT EXISTS idx_tasks_topic_id ON tasks(json_extract(request_params, '$.topicId'));
      `;
      this.db.exec(jsonIndexSQL);
    } catch {
      console.log('JSON indexes creation skipped (request_params column may not exist yet)');
    }
    
    // 设置SQLite优化参数
    if (this.implementation === 'node-sqlite') {
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
      const tableInfo = this.db.prepare("PRAGMA table_info(tasks)").all();
      const existingColumns = tableInfo.map((column: any) => column.name);
      
      // 定义需要的新字段及其默认值
      const requiredColumns = [
        { name: 'request_params', type: 'TEXT', default: "'{}'" },
        { name: 'current_step', type: 'TEXT', default: 'NULL' },
        { name: 'step_status', type: 'TEXT', default: 'NULL' },
        { name: 'finish_reason', type: 'TEXT', default: 'NULL' },
        { name: 'is_valid_complete', type: 'INTEGER', default: '0' }, // 0 = false, 1 = true
        { name: 'last_step_completed_at', type: 'TEXT', default: 'NULL' }
      ];
      
      let migrationsPerformed = 0;
      
      // 检查并添加缺少的字段
      for (const column of requiredColumns) {
        if (!existingColumns.includes(column.name)) {
          console.log(`Adding database column: ${column.name}`);
          
          this.db.exec(`
            ALTER TABLE tasks ADD COLUMN ${column.name} ${column.type} DEFAULT ${column.default};
          `);
          
          migrationsPerformed++;
        }
      }
      
      // 为现有记录设置默认的request_params（如果是新添加的）
      if (!existingColumns.includes('request_params')) {
        this.db.prepare(`
          UPDATE tasks 
          SET request_params = json('{"query":"","language":"zh-CN","aiProvider":"unknown","thinkingModel":"unknown","taskModel":"unknown","searchProvider":"unknown","maxResult":50,"enableCitationImage":true,"enableReferences":true}')
          WHERE request_params IS NULL OR request_params = '{}'
        `).run();
      }
      
      if (migrationsPerformed > 0) {
        console.log(`✓ Database schema migration completed: ${migrationsPerformed} columns added`);
      } else {
        console.log('✓ Database schema is up to date');
      }
    } catch (error) {
      console.error('Schema migration failed:', error);
      // 如果迁移失败，不影响应用启动
    }
  }

  saveTask(taskId: string, progress: TaskProgress, outputs: string[], requestParams: TaskRequestParams): void {
    this.saveTaskWithStatus(taskId, progress, outputs, requestParams, {});
  }

  saveTaskWithStatus(taskId: string, progress: TaskProgress, outputs: string[], requestParams: TaskRequestParams, statusData: TaskStatusData): void {
    try {
      if (!this.db) {
        throw new Error(`Database not initialized - ${this.implementation} unavailable`);
      }
      
      const sql = `INSERT OR REPLACE INTO tasks (
        task_id, progress, outputs, last_saved, request_params, 
        current_step, step_status, finish_reason, is_valid_complete, last_step_completed_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`;
      
      const stmt = this.db.prepare(sql);
      stmt.run(
        taskId,
        JSON.stringify(progress),
        JSON.stringify(outputs),
        new Date().toISOString(),
        JSON.stringify(requestParams),
        statusData.currentStep || null,
        statusData.stepStatus || null,
        statusData.finishReason || null,
        statusData.isValidComplete ? 1 : 0,
        statusData.lastStepCompletedAt || null
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
        SELECT task_id, progress, outputs, last_saved, request_params, created_at, updated_at,
               current_step, step_status, finish_reason, is_valid_complete, last_step_completed_at
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
        updatedAt: row.updated_at || new Date().toISOString(),
        currentStep: row.current_step,
        stepStatus: row.step_status,
        finishReason: row.finish_reason,
        isValidComplete: row.is_valid_complete === 1,
        lastStepCompletedAt: row.last_step_completed_at
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
        SELECT task_id, progress, outputs, last_saved, request_params, created_at, updated_at,
               current_step, step_status, finish_reason, is_valid_complete, last_step_completed_at
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
        updatedAt: row.updated_at || new Date().toISOString(),
        currentStep: row.current_step,
        stepStatus: row.step_status,
        finishReason: row.finish_reason,
        isValidComplete: row.is_valid_complete === 1,
        lastStepCompletedAt: row.last_step_completed_at
      }));
    } catch (error) {
      console.error('Failed to get all tasks:', error);
      throw error; // 重新抛出错误
    }
  }

  archiveTask(taskId: string): void {
    try {
      if (!this.db) {
        throw new Error(`Database not initialized - ${this.implementation} unavailable`);
      }
      
      // 生成带时间戳的新ID
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archivedId = `${taskId}-archived-${timestamp}`;
      
      // 更新任务ID为归档格式
      const stmt = this.db.prepare('UPDATE tasks SET task_id = ? WHERE task_id = ?');
      const result = stmt.run(archivedId, taskId);
      
      if (result.changes > 0) {
        console.log(`Task ${taskId} archived as ${archivedId}`);
      } else {
        console.warn(`Task ${taskId} not found for archiving`);
      }
    } catch (error) {
      console.error(`Failed to archive task ${taskId}:`, error);
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
      
      // 使用Node.js内置SQLite的JSON提取语法
      const jsonExtract = 'json_extract';
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
      
      const jsonExtract = 'json_extract';
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
      
      const jsonExtract = 'json_extract';
      const stmt = this.db.prepare(`
        DELETE FROM tasks 
        WHERE updated_at < ? 
        AND ${jsonExtract}(progress, '$.status') IN ('completed', 'failed')
      `);

      const result = stmt.run(cutoffDate.toISOString());
      return result.changes;
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
        throw new Error('SQLite database is required but Node.js built-in SQLite is not available.\nPlease ensure you are using Node.js version 22.5.0 or later with SQLite support.');
      }
      
      console.log(`Creating database with ${availableImplementation} implementation...`);
      return new UnifiedSQLiteDatabase(this.storageDir);
    } catch (error) {
      console.error('Failed to create database:', error);
      throw error;
    }
  }

  private detectAvailableSQLiteSync(): void {
    console.log('Detecting Node.js built-in SQLite...');
    
    // 只使用Node.js内置SQLite
    try {
      const { DatabaseSync } = require('node:sqlite');
      sqliteModule = { DatabaseSync };
      availableImplementation = 'node-sqlite';
      console.log('✓ Node.js built-in SQLite is available and ready to use');
      return;
    } catch (error) {
      console.log('✗ Node.js built-in SQLite not available:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    // 如果不可用，记录错误
    availableImplementation = 'none';
    console.error('✗ Node.js built-in SQLite not available! Database functionality cannot be enabled.');
  }

  saveTask(taskId: string, progress: TaskProgress, outputs: string[], requestParams: TaskRequestParams): void {
    if (!this.instance) {
      throw new Error('Database not initialized - cannot save task');
    }
    return this.instance.saveTask(taskId, progress, outputs, requestParams);
  }

  saveTaskWithStatus(taskId: string, progress: TaskProgress, outputs: string[], requestParams: TaskRequestParams, statusData: TaskStatusData): void {
    if (!this.instance) {
      throw new Error('Database not initialized - cannot save task with status');
    }
    return this.instance.saveTaskWithStatus(taskId, progress, outputs, requestParams, statusData);
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

  archiveTask(taskId: string): void {
    if (!this.instance) {
      throw new Error('Database not initialized - cannot archive task');
    }
    return this.instance.archiveTask(taskId);
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

// 导出接口和类型
export { TaskData, TaskStatusData };
export default TaskDatabase;