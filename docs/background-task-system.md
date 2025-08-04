# 后台任务系统实现文档

## 概述

我们已经成功实现了一个后台任务系统，解决了Deep Research应用中的核心问题：**相同请求应该复用同一任务，任务应该在后台持续运行，即使用户断开连接也不会中断**。

## 核心功能

### 1. 任务复用机制
- **请求指纹生成**: 基于查询参数、AI配置、搜索配置等生成唯一的任务ID
- **相同请求识别**: 相同参数的请求会得到相同的任务ID
- **任务去重**: 避免为相同请求创建多个任务

### 2. 后台任务执行
- **独立运行**: 任务在后台独立运行，不依赖用户连接状态
- **断连保护**: 用户断开连接不会中断正在执行的研究任务
- **状态管理**: 支持 running, paused, completed, failed 状态

### 3. 持久化存储
- **文件系统存储**: 使用JSON文件持久化任务状态和输出
- **多容器支持**: 支持Docker多容器部署场景
- **崩溃恢复**: 服务器重启后自动加载已有任务

### 4. 实时输出流
- **SSE支持**: 通过Server-Sent Events实现实时输出
- **增量传输**: 只传输新产生的内容
- **连接恢复**: 重新连接时从上次断开处继续

## 技术实现

### 核心类: BackgroundTaskManager

```typescript
class BackgroundTaskManager {
  // 任务状态管理
  private tasks: Map<string, TaskProgress> = new Map();
  
  // 运行中的任务Promise
  private runningTasks: Map<string, Promise<any>> = new Map();
  
  // 任务输出缓存
  private taskOutputs: Map<string, string[]> = new Map();
  
  // 持久化存储目录
  private storageDir: string = path.join(process.cwd(), 'data', 'tasks');
}
```

### 任务状态接口

```typescript
interface TaskProgress {
  step: string;
  percentage: number;
  status: 'running' | 'paused' | 'completed' | 'failed';
  messages: string[];
  result?: any;
  error?: string;
  timestamp: string;
}
```

### 文件存储格式

每个任务对应一个JSON文件：`data/tasks/{taskId}.json`

```json
{
  "taskId": "abc123def456",
  "progress": {
    "step": "search",
    "percentage": 60,
    "status": "running",
    "messages": ["正在搜索相关资料..."],
    "timestamp": "2025-01-08T10:30:00.000Z"
  },
  "outputs": [
    "# 研究报告开始",
    "## 搜索阶段",
    "正在搜索相关资料..."
  ],
  "lastSaved": "2025-01-08T10:30:00.000Z"
}
```

## 工作流程

### 新任务流程
1. 用户发起SSE请求
2. 生成请求指纹作为任务ID
3. 检查是否已有相同任务
4. 创建新的后台任务
5. 启动DeepResearch实例
6. 实时输出到用户，同时保存到磁盘

### 任务恢复流程
1. 用户重新连接
2. 根据请求参数计算任务ID
3. 从磁盘加载任务状态
4. 根据任务状态决定处理方式：
   - **completed**: 直接返回完整结果
   - **running**: 连接到正在运行的任务
   - **paused**: 重新启动任务继续执行

### 断线重连流程
1. 用户断开连接，任务继续在后台运行
2. 用户重新连接相同请求
3. 系统识别为相同任务ID
4. 返回已缓存的输出 + 实时新输出
5. 无缝恢复用户体验

## 关键特性

### 1. 原子性操作
- 使用临时文件 + rename确保写入原子性
- 避免并发写入导致的数据损坏

### 2. 内存与磁盘同步
- 内存中维护活跃任务状态
- 定期同步到磁盘确保持久化
- 启动时从磁盘恢复状态

### 3. 错误处理
- 任务执行失败时保存错误信息
- 文件损坏时自动修复或重建
- 优雅降级处理异常情况

### 4. 性能优化
- 懒加载存储初始化
- 异步磁盘操作不阻塞主流程
- 增量输出减少网络传输

## 部署考虑

### 多容器环境
- 共享存储卷: 多个容器共享 `data/tasks` 目录
- 任务调度: 任何容器都可以处理相同任务ID的请求
- 状态同步: 通过文件系统实现容器间状态同步

### 存储要求
- 磁盘空间: 根据任务数量和输出长度预估
- 权限设置: 确保容器有读写 `data/tasks` 目录的权限
- 备份策略: 可选择性备份重要任务结果

## 配置选项

### 环境变量
```bash
# 存储目录（可选，默认为 data/tasks）
TASK_STORAGE_DIR=/app/data/tasks

# 最大任务保存时间（可选）
MAX_TASK_AGE_HOURS=168  # 7天
```

### 运行时配置
- 禁用Edge Runtime以支持文件系统操作
- 响应头包含任务ID便于调试
- 支持CORS跨域访问

## 监控和调试

### 日志输出
- 任务创建和完成日志
- 连接状态变化日志
- 错误和异常日志

### 响应头信息
```
X-Task-ID: abc123def456
X-Request-ID: req-1704700800-abc123
X-Model-Name: gpt-4 (gpt-4, gpt-4)
```

### 文件系统检查
```bash
# 查看所有任务
ls data/tasks/

# 查看特定任务状态
cat data/tasks/abc123def456.json
```

## 测试验证

创建了测试脚本 `test-background-tasks.js` 验证：
- 任务ID一致性
- 断线重连功能
- 后台持续运行
- 状态持久化

## 未来扩展

### 可能的增强功能
1. **SQLite数据库**: 替代JSON文件提供更好的并发性能
2. **Redis缓存**: 用于分布式部署的状态共享
3. **任务队列**: 支持任务优先级和并发控制
4. **WebSocket**: 支持双向通信和任务控制
5. **监控面板**: 可视化任务状态和系统健康度

### 优化方向
1. **内存管理**: 限制内存中保存的任务数量
2. **存储压缩**: 压缩长时间运行任务的输出
3. **清理策略**: 自动清理过期任务文件
4. **负载均衡**: 多容器环境下的任务分配策略