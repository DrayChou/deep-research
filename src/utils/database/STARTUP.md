# 数据库自动启动初始化系统

这个文档说明了Deep Research项目中数据库自动启动初始化系统的使用方法。

## 🚀 自动启动流程

当应用启动时，系统会自动执行以下步骤：

1. **配置检查**: 验证PostgreSQL连接配置
2. **服务等待**: 等待PostgreSQL服务可用
3. **迁移检测**: 检查是否需要从SQLite迁移数据
4. **自动迁移**: 如果需要，自动执行数据迁移
5. **结构初始化**: 创建数据库、表结构和索引
6. **健康验证**: 验证系统健康状况
7. **开始服务**: 开始提供正常服务

## 📋 环境变量配置

### 必需配置

```bash
# PostgreSQL连接配置
POSTGRES_HOST=pgvector          # PostgreSQL主机地址
POSTGRES_PORT=5432              # PostgreSQL端口
POSTGRES_DB=cspc_dev            # 数据库名称
POSTGRES_USER=pgvector          # 用户名
POSTGRES_PASSWORD=pgvector      # 密码

# 数据库类型选择
DATABASE_TYPE=postgresql        # 强制使用PostgreSQL
```

### 可选配置

```bash
# 连接和性能配置
POSTGRES_SSL=false              # 是否启用SSL
DB_POOL_SIZE=50                 # 连接池大小

# SQLite迁移配置
SQLITE_DB_PATH=./data/tasks.db  # SQLite文件路径（如果需要迁移）

# 调试和控制
FORCE_POSTGRESQL=true           # 强制使用PostgreSQL，即使配置有问题
NODE_ENV=production             # 运行环境
```

## 🐳 Docker Compose示例

```yaml
version: '3.8'
services:
  # PostgreSQL数据库
  pgvector:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: cspc_dev
      POSTGRES_USER: pgvector
      POSTGRES_PASSWORD: pgvector
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pgvector -d cspc_dev"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Deep Research应用
  deep-research:
    image: deep-research:latest
    environment:
      # 数据库配置
      DATABASE_TYPE: postgresql
      POSTGRES_HOST: pgvector
      POSTGRES_DB: cspc_dev
      POSTGRES_USER: pgvector
      POSTGRES_PASSWORD: pgvector
      DB_POOL_SIZE: 50
      
      # 如果需要从SQLite迁移
      SQLITE_DB_PATH: /app/data/tasks.db
      
    ports:
      - "3001:3001"
    depends_on:
      pgvector:
        condition: service_healthy
    volumes:
      # 如果有SQLite文件需要迁移
      - ./data:/app/data
    restart: unless-stopped

volumes:
  postgres_data:
```

## 🔍 启动状态监控

### 1. 检查初始化状态

```bash
# 获取详细的初始化状态
curl http://localhost:3001/api/init-status

# 响应示例 - 初始化中
{
  "status": "initializing",
  "message": "Database initialization in progress",
  "initialization": {
    "completed": false,
    "inProgress": true
  },
  "configuration": {
    "valid": true,
    "config": {
      "host": "pgvector",
      "port": 5432,
      "database": "cspc_dev"
    }
  }
}

# 响应示例 - 初始化完成
{
  "status": "healthy",
  "message": "Database is initialized and healthy",
  "initialization": {
    "completed": true,
    "inProgress": false,
    "result": {
      "success": true,
      "actions": ["检查PostgreSQL配置", "等待PostgreSQL服务", "执行SQLite数据迁移", "初始化数据库结构"],
      "duration": 12350,
      "details": {
        "dataMigrated": true,
        "recordsMigrated": 156,
        "totalRecords": 156
      }
    }
  },
  "database": {
    "connected": true,
    "poolStatus": {
      "totalConnections": 3,
      "idleConnections": 3,
      "waitingClients": 0
    },
    "statistics": {
      "local": { "total": 45, "running": 2, "completed": 43 },
      "prod": { "total": 111, "running": 5, "completed": 106 }
    }
  }
}
```

### 2. 服务请求处理

在初始化完成前，所有API请求会返回503状态码：

```bash
# 初始化期间的响应
curl http://localhost:3001/api/any-endpoint

HTTP/1.1 503 Service Unavailable
Retry-After: 5

{
  "status": "initializing",
  "message": "Database initialization in progress, please wait...",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

## 🛠️ 手动操作

### 1. 强制重新初始化

```bash
# 重新执行初始化（危险操作）
curl -X POST http://localhost:3001/api/init-status \
  -H "Content-Type: application/json" \
  -d '{"action": "retry"}'
```

### 2. 手动运行初始化脚本

```bash
# 在应用目录下运行
node src/utils/database/startup-initializer.ts

# 强制重新初始化
node src/utils/database/startup-initializer.ts --force

# 跳过数据迁移
node src/utils/database/startup-initializer.ts --skip-migration
```

### 3. 独立测试数据库

```bash
# 测试数据库连接和功能
curl http://localhost:3001/api/test-db

# 检查迁移前置条件
curl -X POST http://localhost:3001/api/migrate-db \
  -d '{"action": "check"}'
```

## 📝 启动日志解读

### 正常启动日志

```
[INFO] DatabaseFactory: Database factory initialized {"type":"postgresql","sqliteStorageDir":"./data"}
[INFO] StartupInitializer: 🚀 Starting database initialization...
[INFO] StartupInitializer: ✅ PostgreSQL configuration valid
[INFO] StartupInitializer: Attempting to connect to PostgreSQL (1/3)...
[INFO] StartupInitializer: PostgreSQL connection successful
[INFO] StartupInitializer: ✅ PostgreSQL service available
[INFO] StartupInitializer: Found SQLite database {"path":"./data/tasks.db","size":81920}
[INFO] StartupInitializer: Migration needed {"sqlitePath":"./data/tasks.db"}
[INFO] StartupInitializer: Starting data migration...
[INFO] SQLiteToPGMigration: Found records in SQLite {"totalRecords":156}
[INFO] SQLiteToPGMigration: Processing batch {"offset":0,"batchSize":100,"progress":"100/156"}
[INFO] SQLiteToPGMigration: Migration completed {"success":true,"totalRecords":156,"migratedRecords":156}
[INFO] StartupInitializer: ✅ Data migration completed {"totalRecords":156,"migratedRecords":156}
[INFO] SimplePGAdapter: Schema "deep_research" created or exists
[INFO] SimplePGAdapter: Database indexes created
[INFO] SimplePGAdapter: Database triggers created
[INFO] StartupInitializer: ✅ Database structure initialized
[INFO] StartupInitializer: ✅ System health validated
[INFO] StartupInitializer: 🎉 Database initialization completed successfully! {"duration":"12350ms","actions":5}
```

### 错误日志示例

```
[ERROR] StartupInitializer: PostgreSQL connection attempt 1 failed: Connection refused
[INFO] StartupInitializer: Waiting 5000ms before retry...
[ERROR] StartupInitializer: Failed to connect to PostgreSQL after 3 attempts
[ERROR] StartupInitializer: 💥 Database initialization failed {"error":"Connection failed","duration":"15250ms"}
```

## 🚨 故障排除

### 1. PostgreSQL连接失败

**问题**: 无法连接到PostgreSQL服务

**解决方案**:
```bash
# 检查PostgreSQL容器状态
docker ps | grep postgres

# 检查PostgreSQL日志
docker logs pgvector

# 测试网络连接
telnet pgvector 5432

# 验证配置
curl http://localhost:3001/api/init-status
```

### 2. 数据迁移失败

**问题**: SQLite到PostgreSQL迁移出错

**解决方案**:
```bash
# 检查SQLite文件
ls -la ./data/tasks.db

# 手动执行迁移测试
curl -X POST http://localhost:3001/api/migrate-db \
  -d '{"action": "migrate", "dryRun": true}'

# 查看详细错误
docker logs deep-research | grep Migration
```

### 3. 服务一直返回503

**问题**: 初始化似乎卡住了

**解决方案**:
```bash
# 检查初始化状态
curl http://localhost:3001/api/init-status

# 查看应用日志
docker logs deep-research -f

# 如果需要，强制重启初始化
curl -X POST http://localhost:3001/api/init-status \
  -d '{"action": "retry"}'
```

### 4. 内存或性能问题

**问题**: 初始化期间内存占用过高

**解决方案**:
```bash
# 减少连接池大小
export DB_POOL_SIZE=10

# 增加迁移批次大小
# 在代码中修改 batchSize 参数

# 监控资源使用
docker stats deep-research
```

## 🔧 高级配置

### 1. 自定义初始化选项

```javascript
// 在代码中自定义初始化配置
import { initializeDatabaseOnStartup } from '@/utils/database/startup-initializer';

const result = await initializeDatabaseOnStartup({
  forceReinitialize: false,    // 是否强制重新初始化
  skipMigration: false,        // 是否跳过数据迁移
  maxRetries: 5,               // 最大重试次数
  retryDelay: 10000,           // 重试延迟（毫秒）
  sqliteSearchPaths: [         // SQLite文件搜索路径
    './custom/path/to/tasks.db',
    './data/tasks.db'
  ]
});
```

### 2. 生产环境建议

```bash
# 生产环境配置
DATABASE_TYPE=postgresql
POSTGRES_SSL=true
DB_POOL_SIZE=100             # 根据负载调整
NODE_ENV=production

# 监控和日志
LOG_LEVEL=info               # 减少调试日志
HEALTH_CHECK_INTERVAL=30000  # 健康检查间隔

# 安全配置
POSTGRES_PASSWORD=secure_password_here
ACCESS_PASSWORD=your_access_password
```

### 3. 开发环境快速设置

```bash
# 开发环境一键启动
docker-compose up -d pgvector  # 先启动数据库
sleep 10                       # 等待数据库启动
npm run dev                    # 启动应用（会自动初始化）
```

---

## 📞 支持

如果遇到问题：

1. 查看启动日志获取详细错误信息
2. 使用 `/api/init-status` 检查当前状态
3. 参考故障排除部分的解决方案
4. 检查环境变量配置是否正确

系统设计为完全自动化，正常情况下不需要手动干预。如果出现问题，通常是配置或网络连接相关的问题。