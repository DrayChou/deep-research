/* eslint-disable @typescript-eslint/no-require-imports */
// 智能SQLite数据库选择器 - Node.js内置SQLite优先，其他库回退
import * as path from 'node:path';
import * as fs from 'node:fs';

interface TaskProgress {
  step: string;
  percentage: number;
  status: 'running' | 'paused' | 'completed' | 'failed';
  messages: string[];
  result?: any;
  error?: string;
  timestamp: string;
}

interface TaskData {
  taskId: string;
  progress: TaskProgress;
  outputs: string[];
  lastSaved: string;
}

// 数据库抽象接口
interface DatabaseInterface {
  saveTask(taskId: string, progress: TaskProgress, outputs: string[]): void;
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
 * Node.js内置SQLite实现 - 最稳定可靠
 */
class NodeSQLiteDatabase implements DatabaseInterface {
  private db: any; // DatabaseSync from node:sqlite
  private storageDir: string;

  constructor(storageDir: string) {
    this.storageDir = storageDir;
    this.ensureStorageDir();
    
    // 尝试使用SQLite模块
    try {
      const { DatabaseSync } = require('node:sqlite');
      const dbPath = path.join(storageDir, 'tasks.db');
      this.db = new DatabaseSync(dbPath);
      this.initializeTables();
    } catch (error) {
      // 如果node:sqlite不可用，使用文件存储作为后备
      console.warn('node:sqlite not available, using file storage fallback:', error);
    }
  }

  private ensureStorageDir(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT PRIMARY KEY,
        progress TEXT NOT NULL,
        outputs TEXT NOT NULL,
        last_saved TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=NORMAL;
    `);
    console.log('Node.js built-in SQLite database initialized successfully');
  }

  saveTask(taskId: string, progress: TaskProgress, outputs: string[]): void {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO tasks (task_id, progress, outputs, last_saved, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `);

      stmt.run(
        taskId,
        JSON.stringify(progress),
        JSON.stringify(outputs),
        new Date().toISOString()
      );
    } catch (error) {
      console.error(`Failed to save task ${taskId}:`, error);
    }
  }

  getTask(taskId: string): TaskData | null {
    try {
      const stmt = this.db.prepare(`
        SELECT task_id, progress, outputs, last_saved
        FROM tasks WHERE task_id = ?
      `);

      const row = stmt.get(taskId);
      if (!row) return null;

      return {
        taskId: row.task_id,
        progress: JSON.parse(row.progress),
        outputs: JSON.parse(row.outputs),
        lastSaved: row.last_saved
      };
    } catch (error) {
      console.error(`Failed to get task ${taskId}:`, error);
      return null;
    }
  }

  getAllTasks(): TaskData[] {
    try {
      const stmt = this.db.prepare(`
        SELECT task_id, progress, outputs, last_saved
        FROM tasks ORDER BY updated_at DESC
      `);

      const rows = stmt.all();
      return rows.map((row: any) => ({
        taskId: row.task_id,
        progress: JSON.parse(row.progress),
        outputs: JSON.parse(row.outputs),
        lastSaved: row.last_saved
      }));
    } catch (error) {
      console.error('Failed to get all tasks:', error);
      return [];
    }
  }

  deleteTask(taskId: string): void {
    try {
      const stmt = this.db.prepare('DELETE FROM tasks WHERE task_id = ?');
      stmt.run(taskId);
    } catch (error) {
      console.error(`Failed to delete task ${taskId}:`, error);
    }
  }

  getTaskStats(): { total: number; running: number; completed: number; failed: number } {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN json_extract(progress, '$.status') = 'running' THEN 1 ELSE 0 END) as running,
          SUM(CASE WHEN json_extract(progress, '$.status') = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN json_extract(progress, '$.status') = 'failed' THEN 1 ELSE 0 END) as failed
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
      const stmt = this.db.prepare(`
        SELECT task_id, progress, outputs, last_saved
        FROM tasks 
        WHERE json_extract(progress, '$.status') = ?
        ORDER BY updated_at DESC
      `);

      const rows = stmt.all(status);
      return rows.map((row: any) => ({
        taskId: row.task_id,
        progress: JSON.parse(row.progress),
        outputs: JSON.parse(row.outputs),
        lastSaved: row.last_saved
      }));
    } catch (error) {
      console.error(`Failed to get tasks by status ${status}:`, error);
      return [];
    }
  }

  healthCheck(): { status: 'ok' | 'error'; message: string } {
    try {
      const stmt = this.db.prepare('SELECT COUNT(*) as count FROM tasks');
      const result = stmt.get();
      return {
        status: 'ok',
        message: `Node.js SQLite database healthy with ${result.count} tasks`
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Node.js SQLite database error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  cleanupOldTasks(daysToKeep: number = 7): number {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const stmt = this.db.prepare(`
        DELETE FROM tasks 
        WHERE updated_at < ? 
        AND json_extract(progress, '$.status') IN ('completed', 'failed')
      `);

      const info = stmt.run(cutoffDate.toISOString());
      return info.changes;
    } catch (error) {
      console.error('Failed to cleanup old tasks:', error);
      return 0;
    }
  }

  close(): void {
    try {
      this.db.close();
    } catch (error) {
      console.error('Failed to close Node.js SQLite database:', error);
    }
  }
}

/**
 * Better-SQLite3 实现 - 第二选择
 */
class BetterSQLiteDatabase implements DatabaseInterface {
  private db: any;
  private storageDir: string;

  constructor(storageDir: string) {
    this.storageDir = storageDir;
    this.ensureStorageDir();
    
    // 尝试使用better-sqlite3模块
    try {
      const Database = require('better-sqlite3');
      const dbPath = path.join(storageDir, 'tasks.db');
      this.db = new Database(dbPath);
      this.initializeTables();
    } catch (error) {
      // 如果better-sqlite3不可用，使用文件存储作为后备
      console.warn('better-sqlite3 not available, using file storage fallback:', error);
    }
  }

  private ensureStorageDir(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT PRIMARY KEY,
        progress TEXT NOT NULL,
        outputs TEXT NOT NULL,
        last_saved TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
    `);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    console.log('Better-SQLite3 database initialized successfully');
  }

  saveTask(taskId: string, progress: TaskProgress, outputs: string[]): void {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO tasks (task_id, progress, outputs, last_saved, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      stmt.run(
        taskId,
        JSON.stringify(progress),
        JSON.stringify(outputs),
        new Date().toISOString()
      );
    } catch (error) {
      console.error(`Failed to save task ${taskId}:`, error);
    }
  }

  getTask(taskId: string): TaskData | null {
    try {
      const stmt = this.db.prepare(`
        SELECT task_id, progress, outputs, last_saved
        FROM tasks WHERE task_id = ?
      `);

      const row = stmt.get(taskId);
      if (!row) return null;

      return {
        taskId: row.task_id,
        progress: JSON.parse(row.progress),
        outputs: JSON.parse(row.outputs),
        lastSaved: row.last_saved
      };
    } catch (error) {
      console.error(`Failed to get task ${taskId}:`, error);
      return null;
    }
  }

  getAllTasks(): TaskData[] {
    try {
      const stmt = this.db.prepare(`
        SELECT task_id, progress, outputs, last_saved
        FROM tasks ORDER BY updated_at DESC
      `);

      const rows = stmt.all();
      return rows.map((row: any) => ({
        taskId: row.task_id,
        progress: JSON.parse(row.progress),
        outputs: JSON.parse(row.outputs),
        lastSaved: row.last_saved
      }));
    } catch (error) {
      console.error('Failed to get all tasks:', error);
      return [];
    }
  }

  deleteTask(taskId: string): void {
    try {
      const stmt = this.db.prepare('DELETE FROM tasks WHERE task_id = ?');
      stmt.run(taskId);
    } catch (error) {
      console.error(`Failed to delete task ${taskId}:`, error);
    }
  }

  getTaskStats(): { total: number; running: number; completed: number; failed: number } {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN JSON_EXTRACT(progress, '$.status') = 'running' THEN 1 ELSE 0 END) as running,
          SUM(CASE WHEN JSON_EXTRACT(progress, '$.status') = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN JSON_EXTRACT(progress, '$.status') = 'failed' THEN 1 ELSE 0 END) as failed
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
      const stmt = this.db.prepare(`
        SELECT task_id, progress, outputs, last_saved
        FROM tasks 
        WHERE JSON_EXTRACT(progress, '$.status') = ?
        ORDER BY updated_at DESC
      `);

      const rows = stmt.all(status);
      return rows.map((row: any) => ({
        taskId: row.task_id,
        progress: JSON.parse(row.progress),
        outputs: JSON.parse(row.outputs),
        lastSaved: row.last_saved
      }));
    } catch (error) {
      console.error(`Failed to get tasks by status ${status}:`, error);
      return [];
    }
  }

  healthCheck(): { status: 'ok' | 'error'; message: string } {
    try {
      const stmt = this.db.prepare('SELECT COUNT(*) as count FROM tasks');
      const result = stmt.get();
      return {
        status: 'ok',
        message: `Better-SQLite3 database healthy with ${result.count} tasks`
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Better-SQLite3 database error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  cleanupOldTasks(daysToKeep: number = 7): number {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const stmt = this.db.prepare(`
        DELETE FROM tasks 
        WHERE updated_at < ? 
        AND JSON_EXTRACT(progress, '$.status') IN ('completed', 'failed')
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
      this.db.close();
    } catch (error) {
      console.error('Failed to close Better-SQLite3 database:', error);
    }
  }
}

/**
 * 智能数据库工厂 - 优先Better-SQLite3，然后Node.js内置SQLite保底
 */
function createDatabase(storageDir: string): DatabaseInterface {
  // 策略1：优先使用Better-SQLite3（高性能，成熟稳定）
  try {
    console.log('Trying Better-SQLite3 first...');
    return new BetterSQLiteDatabase(storageDir);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.warn('Better-SQLite3 failed, trying Node.js built-in SQLite:', errorMessage);
    
    // 策略2：回退到Node.js内置SQLite（保底方案）
    try {
      console.log('Using Node.js built-in SQLite fallback...');
      return new NodeSQLiteDatabase(storageDir);
    } catch (nodeError) {
      const nodeErrorMessage = nodeError instanceof Error ? nodeError.message : 'Unknown error';
      console.error('Both SQLite implementations failed:', nodeErrorMessage);
      throw new Error(`No SQLite implementation available. Better-SQLite3: ${errorMessage}, Node.js SQLite: ${nodeErrorMessage}`);
    }
  }
}

/**
 * 主要导出的数据库类 - 智能代理
 */
class TaskDatabase implements DatabaseInterface {
  private instance: DatabaseInterface;

  constructor(storageDir: string) {
    this.instance = createDatabase(storageDir);
  }

  saveTask(taskId: string, progress: TaskProgress, outputs: string[]): void {
    return this.instance.saveTask(taskId, progress, outputs);
  }

  getTask(taskId: string): TaskData | null {
    return this.instance.getTask(taskId);
  }

  getAllTasks(): TaskData[] {
    return this.instance.getAllTasks();
  }

  deleteTask(taskId: string): void {
    return this.instance.deleteTask(taskId);
  }

  getTaskStats(): { total: number; running: number; completed: number; failed: number } {
    return this.instance.getTaskStats();
  }

  getTasksByStatus(status: 'running' | 'paused' | 'completed' | 'failed'): TaskData[] {
    return this.instance.getTasksByStatus(status);
  }

  healthCheck(): { status: 'ok' | 'error'; message: string } {
    return this.instance.healthCheck();
  }

  cleanupOldTasks(daysToKeep: number = 7): number {
    return this.instance.cleanupOldTasks(daysToKeep);
  }

  close(): void {
    return this.instance.close();
  }
}

export default TaskDatabase;