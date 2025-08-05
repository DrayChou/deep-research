# Docker 数据目录配置

本项目已配置Docker数据持久化，确保任务数据在容器重启后不会丢失。

## 配置内容

### 1. Dockerfile 更新
- 在容器内创建 `/app/data/tasks` 目录
- 设置正确的目录权限 (nextjs:nodejs)

### 2. docker-compose.yml 更新
- 添加了数据卷映射：`./data/tasks:/app/data/tasks`
- 添加了自动重启策略：`restart: unless-stopped`

### 3. 初始化脚本
- `init-data-dirs.sh` - Linux/Mac 版本
- `init-data-dirs.bat` - Windows 版本

## 使用方法

### 首次设置
1. 运行初始化脚本创建本地数据目录：
   
   **Linux/Mac:**
   ```bash
   chmod +x init-data-dirs.sh
   ./init-data-dirs.sh
   ```
   
   **Windows:**
   ```cmd
   init-data-dirs.bat
   ```

2. 启动Docker容器：
   ```bash
   docker-compose up -d
   ```

### 验证配置
```bash
# 检查容器状态
docker-compose ps

# 查看数据目录映射
docker-compose exec deep-research ls -la /app/data/

# 检查本地数据目录
ls -la ./data/tasks/
```

### 数据备份
任务数据存储在 `./data/tasks/` 目录中，可以定期备份：
```bash
# 备份任务数据
tar -czf tasks-backup-$(date +%Y%m%d).tar.gz data/tasks/

# 恢复数据
tar -xzf tasks-backup-YYYYMMDD.tar.gz
```

## 目录结构
```
deep-research/
├── data/
│   ├── tasks/          # 任务数据目录 (映射到容器)
│   │   ├── *.db       # SQLite数据库文件
│   │   └── *.journal  # 数据库日志文件
│   └── .gitkeep       # 确保空目录被git跟踪
├── init-data-dirs.sh  # Linux/Mac初始化脚本
├── init-data-dirs.bat # Windows初始化脚本
└── docker-compose.yml # Docker配置文件
```

## 故障排除

### 权限问题
如果遇到权限错误：
1. **Linux/Mac**: 确保目录权限为755
2. **Windows**: 确保Docker Desktop有权限访问目录
3. 重新运行初始化脚本

### 数据丢失
如果数据丢失：
1. 检查容器是否正常启动
2. 验证数据卷映射是否正确
3. 查看Docker日志：`docker-compose logs`

### 清理数据
如需清理所有任务数据：
```bash
# 停止容器
docker-compose down

# 删除数据目录 (谨慎操作)
rm -rf ./data/tasks/*

# 重新初始化
./init-data-dirs.sh

# 重启容器
docker-compose up -d
```