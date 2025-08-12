import path from 'path';
import { existsSync, mkdirSync } from 'fs';

/**
 * TaskV2数据结构 - 优化的任务数据接口
 */
export interface TaskDataV2 {
  // 主键和标识字段
  id?: number;                          // 自增主键
  task_id: string;                      // 业务任务ID (VARCHAR(256))
  
  // 核心业务状态字段
  current_step?: string | null;         // 当前步骤: 'report-plan', 'serp-query', 'search', 'final-report'
  step_status?: string | null;          // 步骤状态: 'running', 'completed', 'failed', 'pending'
  finish_reason?: string | null;        // 完成原因: 'stop', 'length', 'tool_calls', 'content_filter', 'unknown'
  is_valid_complete?: number;           // 是否有效完成: 0=false, 1=true
  
  // 计数和性能字段
  retry_count?: number;                 // 重试次数
  processing_time?: number | null;      // 处理耗时(毫秒)
  
  // 时间戳字段
  created_at?: string;                  // 创建时间
  updated_at?: string;                  // 更新时间
  last_saved: string;                   // 最后保存时间
  last_step_completed_at?: string | null; // 最后步骤完成时间
  
  // 大内容字段
  progress: string;                     // 进度JSON数据
  outputs: string;                      // 输出内容JSON
  request_params?: string;              // 请求参数JSON
  
  // 元数据字段
  model_config?: string | null;         // 使用的模型配置JSON
  error_message?: string | null;        // 错误信息
  user_agent?: string | null;           // 用户代理
  ip_address?: string | null;           // IP地址
  
  // 软删除和版本控制
  is_deleted?: number;                  // 软删除标记: 0=false, 1=true
  version?: number;                     // 版本号
}

/**
 * 任务状态数据接口 - 兼容现有接口
 */
export interface TaskStatusDataV2 {
  currentStep?: string | null;
  stepStatus?: string | null;
  lastStepCompletedAt?: string | null;
  finishReason?: string | null;
  isValidComplete?: boolean | null;
  retryCount?: number;
  processingTime?: number | null;
  modelConfig?: string | null;
  errorMessage?: string | null;
}

/**
 * TaskDatabaseV2 - 优化的任务数据库类
 */
class TaskDatabaseV2 {
  private db: any;
  private dbPath: string;
  
  constructor(dbPath?: string) {
    // 确定数据库路径
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'tasksv2.db');
    
    // 确保目录存在
    const dbDir = path.dirname(this.dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
    
    // 初始化数据库 (使用动态require避免ESLint警告)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite');
    this.db = new DatabaseSync(this.dbPath);
    this.initializeDatabase();
    
    console.log(`✅ TaskDatabaseV2 initialized: ${this.dbPath}`);
  }
  
  /**
   * 初始化数据库表结构和索引
   */
  private initializeDatabase(): void {
    // 启用外键约束和性能优化 (Node.js sqlite使用exec执行PRAGMA)
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=NORMAL;
      PRAGMA cache_size=1000;
      PRAGMA foreign_keys=ON;
    `);
    
    // 创建优化的tasksv2表结构
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS tasksv2 (
        -- 主键和标识字段 (最重要，放在前面)
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id VARCHAR(256) NOT NULL UNIQUE,
        
        -- 核心业务状态字段 (高频查询)
        current_step VARCHAR(50) DEFAULT NULL,
        step_status VARCHAR(20) DEFAULT NULL,
        finish_reason VARCHAR(30) DEFAULT NULL,
        is_valid_complete INTEGER DEFAULT 0,
        
        -- 计数和性能字段
        retry_count INTEGER DEFAULT 0,
        processing_time INTEGER DEFAULT NULL,
        
        -- 时间戳字段 (按时间顺序)
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_saved DATETIME NOT NULL,
        last_step_completed_at DATETIME DEFAULT NULL,
        
        -- 大内容字段 (放在后面，减少索引影响)
        progress TEXT NOT NULL DEFAULT '{}',
        outputs TEXT NOT NULL DEFAULT '{}',
        request_params TEXT DEFAULT '{}',
        
        -- 元数据字段
        model_config TEXT DEFAULT NULL,
        error_message TEXT DEFAULT NULL,
        user_agent VARCHAR(500) DEFAULT NULL,
        ip_address VARCHAR(45) DEFAULT NULL,
        
        -- 软删除和版本控制
        is_deleted INTEGER DEFAULT 0,
        version INTEGER DEFAULT 1
      );
    `;
    
    this.db.exec(createTableSQL);
    
    // 创建优化的索引
    const createIndexesSQL = `
      -- 核心查询索引
      CREATE INDEX IF NOT EXISTS idx_tasksv2_task_id ON tasksv2(task_id);
      CREATE INDEX IF NOT EXISTS idx_tasksv2_status ON tasksv2(step_status, current_step);
      CREATE INDEX IF NOT EXISTS idx_tasksv2_updated_at ON tasksv2(updated_at);
      CREATE INDEX IF NOT EXISTS idx_tasksv2_created_at ON tasksv2(created_at);
      
      -- 复合索引 (性能关键)
      CREATE INDEX IF NOT EXISTS idx_tasksv2_status_time ON tasksv2(step_status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_tasksv2_active_tasks ON tasksv2(is_deleted, step_status) 
        WHERE is_deleted = 0;
      CREATE INDEX IF NOT EXISTS idx_tasksv2_retry_count ON tasksv2(retry_count) 
        WHERE retry_count > 0;
      
      -- JSON字段索引 (如果需要按JSON内容查询)
      CREATE INDEX IF NOT EXISTS idx_tasksv2_user_id ON tasksv2(json_extract(request_params, '$.userId')) 
        WHERE json_extract(request_params, '$.userId') IS NOT NULL;
    `;
    
    this.db.exec(createIndexesSQL);
    
    // 创建触发器自动更新updated_at
    const createTriggersSQL = `
      CREATE TRIGGER IF NOT EXISTS trigger_tasksv2_updated_at
      AFTER UPDATE ON tasksv2
      FOR EACH ROW
      BEGIN
        UPDATE tasksv2 SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `;
    
    this.db.exec(createTriggersSQL);
    
    console.log('✅ TasksV2 database schema initialized successfully');
  }
  
  /**
   * 保存任务数据 - 支持INSERT和UPDATE
   */
  async saveTask(taskData: TaskDataV2): Promise<void> {
    const now = new Date().toISOString();
    
    // 准备数据，确保last_saved有值
    const data = {
      ...taskData,
      last_saved: taskData.last_saved || now,
      updated_at: now
    };
    
    try {
      // 检查记录是否已存在（基于task_id而不是id）
      const existingTask = await this.getTask(data.task_id);
      
      if (existingTask) {
        // 更新现有记录
        await this.updateTask(data);
      } else {
        // 插入新记录
        await this.insertTask(data);
      }
    } catch (error) {
      console.error('Error saving task:', error);
      throw error;
    }
  }
  
  /**
   * 插入新任务
   */
  private async insertTask(data: TaskDataV2): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT INTO tasksv2 (
        task_id, current_step, step_status, finish_reason, is_valid_complete,
        retry_count, processing_time, last_saved, last_step_completed_at,
        progress, outputs, request_params, model_config, error_message,
        user_agent, ip_address, is_deleted, version
      ) VALUES (
        @task_id, @current_step, @step_status, @finish_reason, @is_valid_complete,
        @retry_count, @processing_time, @last_saved, @last_step_completed_at,
        @progress, @outputs, @request_params, @model_config, @error_message,
        @user_agent, @ip_address, @is_deleted, @version
      )
    `);
    
    const info = stmt.run({
      task_id: data.task_id,
      current_step: data.current_step || null,
      step_status: data.step_status || null,
      finish_reason: data.finish_reason || null,
      is_valid_complete: data.is_valid_complete || 0,
      retry_count: data.retry_count || 0,
      processing_time: data.processing_time || null,
      last_saved: data.last_saved,
      last_step_completed_at: data.last_step_completed_at || null,
      progress: data.progress || '{}',
      outputs: data.outputs || '{}',
      request_params: data.request_params || '{}',
      model_config: data.model_config || null,
      error_message: data.error_message || null,
      user_agent: data.user_agent || null,
      ip_address: data.ip_address || null,
      is_deleted: data.is_deleted || 0,
      version: data.version || 1
    });
    
    return info.lastInsertRowid as number;
  }
  
  /**
   * 更新现有任务
   */
  private async updateTask(data: TaskDataV2): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE tasksv2 SET 
        current_step = @current_step,
        step_status = @step_status,
        finish_reason = @finish_reason,
        is_valid_complete = @is_valid_complete,
        retry_count = @retry_count,
        processing_time = @processing_time,
        last_saved = @last_saved,
        last_step_completed_at = @last_step_completed_at,
        progress = @progress,
        outputs = @outputs,
        request_params = @request_params,
        model_config = @model_config,
        error_message = @error_message,
        user_agent = @user_agent,
        ip_address = @ip_address,
        version = version + 1
      WHERE task_id = @task_id AND is_deleted = 0
    `);
    
    stmt.run({
      task_id: data.task_id,
      current_step: data.current_step || null,
      step_status: data.step_status || null,
      finish_reason: data.finish_reason || null,
      is_valid_complete: data.is_valid_complete || 0,
      retry_count: data.retry_count || 0,
      processing_time: data.processing_time || null,
      last_saved: data.last_saved,
      last_step_completed_at: data.last_step_completed_at || null,
      progress: data.progress || '{}',
      outputs: data.outputs || '{}',
      request_params: data.request_params || '{}',
      model_config: data.model_config || null,
      error_message: data.error_message || null,
      user_agent: data.user_agent || null,
      ip_address: data.ip_address || null
    });
  }
  
  /**
   * 获取任务数据
   */
  async getTask(taskId: string): Promise<TaskDataV2 | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM tasksv2 
      WHERE task_id = ? AND is_deleted = 0
    `);
    
    const row = stmt.get(taskId) as TaskDataV2 | undefined;
    return row || null;
  }
  
  /**
   * 更新任务状态
   */
  async updateTaskStatus(taskId: string, statusData: TaskStatusDataV2): Promise<void> {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      UPDATE tasksv2 SET
        current_step = COALESCE(@current_step, current_step),
        step_status = COALESCE(@step_status, step_status),
        finish_reason = COALESCE(@finish_reason, finish_reason),
        is_valid_complete = COALESCE(@is_valid_complete, is_valid_complete),
        last_step_completed_at = COALESCE(@last_step_completed_at, last_step_completed_at),
        retry_count = COALESCE(@retry_count, retry_count),
        processing_time = COALESCE(@processing_time, processing_time),
        model_config = COALESCE(@model_config, model_config),
        error_message = COALESCE(@error_message, error_message),
        last_saved = @last_saved,
        version = version + 1
      WHERE task_id = @task_id AND is_deleted = 0
    `);
    
    stmt.run({
      task_id: taskId,
      current_step: statusData.currentStep || null,
      step_status: statusData.stepStatus || null,
      finish_reason: statusData.finishReason || null,
      is_valid_complete: statusData.isValidComplete !== null ? (statusData.isValidComplete ? 1 : 0) : null,
      last_step_completed_at: statusData.lastStepCompletedAt || null,
      retry_count: statusData.retryCount || null,
      processing_time: statusData.processingTime || null,
      model_config: statusData.modelConfig || null,
      error_message: statusData.errorMessage || null,
      last_saved: now
    });
  }
  
  /**
   * 软删除任务
   */
  async deleteTask(taskId: string): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE tasksv2 SET 
        is_deleted = 1, 
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE task_id = ? AND is_deleted = 0
    `);
    
    stmt.run(taskId);
  }
  
  /**
   * 获取活跃任务列表
   */
  async getActiveTasks(limit: number = 100): Promise<TaskDataV2[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM tasksv2 
      WHERE is_deleted = 0 
      ORDER BY updated_at DESC 
      LIMIT ?
    `);
    
    return stmt.all(limit) as TaskDataV2[];
  }
  
  /**
   * 获取任务统计信息
   */
  async getTaskStats(): Promise<{
    total: number;
    running: number;
    completed: number;
    failed: number;
    totalRetries: number;
    avgProcessingTime: number | null;
  }> {
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN step_status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN step_status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN step_status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(retry_count) as totalRetries,
        AVG(processing_time) as avgProcessingTime
      FROM tasksv2 
      WHERE is_deleted = 0
    `);
    
    return stmt.get() as any;
  }
  
  /**
   * 清理旧任务 (物理删除软删除的记录)
   */
  async cleanupOldTasks(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
    
    const stmt = this.db.prepare(`
      DELETE FROM tasksv2 
      WHERE is_deleted = 1 AND updated_at < ?
    `);
    
    const info = stmt.run(cutoffDate);
    return info.changes;
  }
  
  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      console.log('✅ TaskDatabaseV2 connection closed');
    }
  }
}

// 导出类型和类
export default TaskDatabaseV2;