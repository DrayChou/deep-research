# Deep Research - 简化开发说明

## 本地开发（推荐）

### 快速开始
```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm run dev

# 访问 http://localhost:3001/dp2api/
```

### 或者使用启动脚本（Windows）
```powershell
# 启动开发服务器
.\start.ps1

# 或者指定命令
.\start.ps1 dev
```

## 生产环境部署

### 本地构建
```bash
# 构建生产版本
pnpm run build

# 启动生产服务器
pnpm run start
```

### Docker 部署
```bash
# 构建并启动
docker-compose up --build

# 后台运行
docker-compose up -d --build
```

## 端口说明
- **开发环境**: `localhost:3001`
- **生产环境**: `localhost:3000` (Docker)

## 环境变量
复制 `env.tpl` 到 `.env` 并配置相应的 API 密钥。

## 构建说明
- 本地开发无需构建，直接运行 `pnpm run dev`
- 只有生产环境需要构建和打包
- Docker 自动处理构建过程，减少系统负载