# Deep Research PostgreSQL数据库系统

本文档描述了Deep Research项目中PostgreSQL数据库系统的架构、配置和使用方法。该系统支持从SQLite迁移到PostgreSQL，并能够自动处理数据库创建、表结构初始化和用户环境检测。

## 📋 目录

- [系统概述](#系统概述)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [使用方法](#使用方法)
- [API接口](#api接口)
- [数据迁移](#数据迁移)
- [环境检测](#环境检测)
- [故障排除](#故障排除)

## 系统概述

### 🏗️ 架构特性

- **统一数据库设计**: 使用单一PostgreSQL数据库存储所有环境的数据
- **环境信息字段**: 通过数据库字段区分不同客户环境（local、dev、prod）
- **用户信息存储**: 从JWT中提取并存储用户ID和用户名
- **自动初始化**: 自动创建数据库、表结构和索引
- **连接池管理**: 支持50+容器并发访问
- **无缝迁移**: SQLite到PostgreSQL的平滑迁移

### 📊 数据库表结构

```sql
-- 核心任务表
CREATE TABLE deep_research.tasks (
  id SERIAL PRIMARY KEY,
  task_id VARCHAR(256) NOT NULL UNIQUE,
  
  -- 客户环境信息字段
  client_environment VARCHAR(20) DEFAULT 'local',  -- 'local'|'dev'|'prod'
  client_user_id VARCHAR(256),                    -- 用户ID
  client_username VARCHAR(256),                   -- 用户名
  client_data_base_url VARCHAR(500),              -- 数据中心URL
  client_jwt_hash VARCHAR(32),                    -- JWT哈希值
  client_source VARCHAR(50),                      -- 数据来源
  client_mode VARCHAR(20) DEFAULT 'local',        -- API调用模式
  
  -- 业务状态字段
  current_step VARCHAR(50),
  step_status VARCHAR(20),
  finish_reason VARCHAR(30),
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
  user_agent VARCHAR(500),
  ip_address INET,
  is_deleted BOOLEAN DEFAULT FALSE,
  version INTEGER DEFAULT 1
);
```

## 快速开始

### 1. 🔧 环境配置

创建 `.env` 文件或设置环境变量：

```bash
# PostgreSQL连接配置
POSTGRES_HOST=pgvector
POSTGRES_PORT=5432
POSTGRES_DB=cspc_dev
POSTGRES_USER=pgvector
POSTGRES_PASSWORD=pgvector
POSTGRES_SSL=false

# 连接池配置
DB_POOL_SIZE=50

# 数据库类型选择
DATABASE_TYPE=postgresql  # 或 'sqlite' 或 'auto'
```

### 2. 🚀 快速测试

```bash
# 测试数据库配置
curl http://localhost:3001/api/test-db

# 检查迁移前置条件
curl -X POST http://localhost:3001/api/migrate-db \
  -H "Content-Type: application/json" \
  -d '{"action": "check"}'
```

### 3. 📊 运行完整测试

```bash
# 运行Node.js测试脚本
node src/utils/database/test-pg-system.ts

# 或使用数据库初始化工具
node src/utils/database/db-init.ts
```

## 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `POSTGRES_HOST` | pgvector | PostgreSQL服务器地址 |
| `POSTGRES_PORT` | 5432 | PostgreSQL端口 |
| `POSTGRES_DB` | cspc_dev | 数据库名称 |
| `POSTGRES_USER` | pgvector | 用户名 |
| `POSTGRES_PASSWORD` | pgvector | 密码 |
| `POSTGRES_SSL` | false | 是否启用SSL |
| `DB_POOL_SIZE` | 50 | 连接池大小 |
| `DATABASE_TYPE` | auto | 数据库类型选择 |
| `FORCE_POSTGRESQL` | false | 强制使用PostgreSQL |

### 环境检测规则

系统根据 `dataBaseUrl` 参数自动检测客户环境：

- **`local`**: `localhost` 或 `127.0.0.1`
- **`dev`**: IP + 非80端口 (如 `192.168.1.100:8080`)
- **`prod`**: 域名格式 或 IP + 80端口 (如 `api.example.com` 或 `192.168.1.100:80`)

## 使用方法

### 代码集成

```typescript
import { SimplePGAdapter } from '@/utils/database/simple-pg-adapter';
import { DatabaseFactory } from '@/app/api/sse/live/database-factory';

// 方法1: 直接使用SimplePGAdapter
const adapter = SimplePGAdapter.getInstance();
await adapter.initialize();

// 方法2: 使用数据库工厂（推荐）
const db = DatabaseFactory.getAsyncDatabase(request);
await db.saveTask(taskId, progress, outputs, requestParams);

// 方法3: 带请求上下文的保存（自动提取环境信息）
await adapter.saveTaskWithRequest(request, taskData);
```

### 任务数据操作

```typescript
// 保存任务
const taskData = {
  task_id: 'unique-task-id',
  current_step: 'processing',
  step_status: 'running',
  last_saved: new Date(),
  progress: { step: 1, message: 'Starting...' },
  outputs: { result: 'Initial data' },
  request_params: { query: 'test query' }
};

await adapter.saveTask(taskData);

// 获取任务
const task = await adapter.getTask('unique-task-id');

// 更新任务状态
await adapter.updateTaskStatus('unique-task-id', {
  currentStep: 'completed',
  stepStatus: 'completed',
  finishReason: 'success',
  isValidComplete: true
});

// 获取环境统计
const stats = await adapter.getTaskStatsByEnvironment();
console.log(stats);
/*
{
  "local": { "total": 15, "running": 2, "completed": 13, "failed": 0 },
  "dev": { "total": 8, "running": 1, "completed": 6, "failed": 1 },
  "prod": { "total": 42, "running": 5, "completed": 35, "failed": 2 }
}
*/
```

## API接口

### 数据库测试API

```bash
# GET /api/test-db - 全面的数据库连接和功能测试
curl http://localhost:3001/api/test-db

# 响应示例
{
  "success": true,
  "duration": "156ms",
  "config": {
    "host": "pgvector",
    "port": 5432,
    "database": "cspc_dev",
    "maxConnections": 50
  },
  "healthCheck": { "connected": true },
  "poolStatus": {
    "totalConnections": 2,
    "idleConnections": 2,
    "waitingClients": 0
  },
  "testResults": {
    "taskCreated": true,
    "taskRetrieved": true,
    "taskUpdated": true
  }
}
```

### 数据库迁移API

```bash
# 检查迁移前置条件
curl -X POST http://localhost:3001/api/migrate-db \
  -H "Content-Type: application/json" \
  -d '{"action": "check"}'

# 执行迁移（干运行）
curl -X POST http://localhost:3001/api/migrate-db \
  -H "Content-Type: application/json" \
  -d '{
    "action": "migrate",
    "dryRun": true,
    "batchSize": 100,
    "skipExisting": true,
    "createBackup": true
  }'

# 执行实际迁移
curl -X POST http://localhost:3001/api/migrate-db \
  -H "Content-Type: application/json" \
  -d '{
    "action": "migrate",
    "dryRun": false,
    "sqliteDbPath": "./data/tasks.db"
  }'

# 查看迁移状态
curl http://localhost:3001/api/migrate-db
```

## 数据迁移

### 自动迁移流程

1. **前置检查**: 验证PostgreSQL配置和SQLite文件
2. **备份创建**: 自动备份原SQLite文件
3. **批量迁移**: 分批处理数据，避免内存溢出
4. **数据转换**: 自动转换数据格式和提取环境信息
5. **验证检查**: 验证迁移结果的完整性

### 迁移命令行工具

```bash
# 使用Node.js脚本执行迁移
node src/utils/database/sqlite-to-pg-migration.ts

# 干运行模式
node src/utils/database/sqlite-to-pg-migration.ts --dry-run
```

### 迁移配置选项

```typescript
const migrationOptions = {
  sqliteDbPath: './data/tasks.db',    // SQLite数据库路径
  batchSize: 100,                     // 批处理大小
  skipExisting: true,                 // 跳过已存在的记录
  createBackup: true,                 // 创建备份
  dryRun: false                       // 是否为干运行
};
```

## 环境检测

### 客户环境分类

系统会自动从请求中提取以下信息：

- **环境类型**: 根据dataBaseUrl判断
- **用户信息**: 从JWT中提取用户ID和用户名
- **API模式**: local或proxy调用模式
- **数据来源**: 请求来源标识

### JWT解析

```typescript
// 从JWT中提取的用户信息
const payload = parseJWT(jwt);
const userId = payload?.sub || payload?.id || payload?.user_id;
const username = payload?.username || payload?.name || payload?.user_name || payload?.sub;
```

## 故障排除

### 常见问题

#### 1. 连接失败

```bash
# 检查PostgreSQL服务状态
docker ps | grep postgres

# 检查网络连接
telnet pgvector 5432

# 查看配置
curl http://localhost:3001/api/test-db
```

#### 2. 数据库不存在

系统会自动创建数据库，如果失败请检查：

- 用户权限是否足够
- PostgreSQL服务是否正常运行
- 网络连接是否正常

#### 3. 迁移失败

```bash
# 检查SQLite文件
ls -la ./data/tasks.db

# 查看详细错误
curl -X POST http://localhost:3001/api/migrate-db \
  -d '{"action": "check"}'

# 使用干运行模式测试
curl -X POST http://localhost:3001/api/migrate-db \
  -d '{"action": "migrate", "dryRun": true}'
```

### 日志查看

```bash
# 查看应用日志
docker logs deep-research

# 查看PostgreSQL日志
docker logs pgvector
```

### 性能监控

```bash
# 获取连接池状态
curl http://localhost:3001/api/test-db | jq '.poolStatus'

# 获取任务统计
curl http://localhost:3001/api/migrate-db | jq '.database.taskStats'
```

## 📝 完整示例

### Docker Compose配置

```yaml
version: '3.8'
services:
  deep-research:
    image: deep-research:latest
    environment:
      - DATABASE_TYPE=postgresql
      - POSTGRES_HOST=pgvector
      - POSTGRES_DB=cspc_dev
      - POSTGRES_USER=pgvector
      - POSTGRES_PASSWORD=pgvector
      - DB_POOL_SIZE=50
    depends_on:
      - pgvector

  pgvector:
    image: pgvector/pgvector:pg16
    environment:
      - POSTGRES_DB=cspc_dev
      - POSTGRES_USER=pgvector
      - POSTGRES_PASSWORD=pgvector
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### 生产环境部署

```bash
# 1. 启动PostgreSQL
docker-compose up -d pgvector

# 2. 等待数据库启动
sleep 10

# 3. 测试数据库连接
curl http://localhost:3001/api/test-db

# 4. 执行数据迁移（如果需要）
curl -X POST http://localhost:3001/api/migrate-db \
  -d '{"action": "migrate"}'

# 5. 启动应用
docker-compose up -d deep-research
```

## 🔧 开发和维护

### 添加新字段

1. 修改 `SimplePGAdapter` 中的 `TaskData` 接口
2. 更新 `createTasksTable()` 中的表结构
3. 修改 `updateTableSchema()` 添加迁移逻辑
4. 更新索引和查询逻辑

### 性能优化

- 监控连接池使用情况
- 根据负载调整 `DB_POOL_SIZE`
- 定期清理过期任务
- 监控查询性能和索引使用

### 备份和恢复

```bash
# 数据库备份
pg_dump -h pgvector -U pgvector cspc_dev > backup.sql

# 数据库恢复
psql -h pgvector -U pgvector cspc_dev < backup.sql
```

---

📚 **更多信息**

- [PostgreSQL官方文档](https://www.postgresql.org/docs/)
- [pg模块文档](https://node-postgres.com/)
- [项目GitHub仓库](https://github.com/your-org/deep-research)

如有问题，请查看日志文件或联系开发团队。