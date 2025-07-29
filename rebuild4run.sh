#!/bin/bash

echo "=== Deep Research - Rebuild & Run Script ==="

set -e

# Function to detect available Docker Compose command
detect_docker_compose() {
    if command -v docker-compose &> /dev/null; then
        echo "docker-compose"
    elif command -v docker &> /dev/null && docker compose version &> /dev/null; then
        echo "docker compose"
    else
        return 1
    fi
}

# Detect and set the Docker Compose command
DOCKER_COMPOSE_CMD=$(detect_docker_compose)

if [ -z "$DOCKER_COMPOSE_CMD" ]; then
    echo "Neither 'docker-compose' nor 'docker compose' could be found."
    echo "Please install Docker Compose first."
    exit 1
fi

echo "Using Docker Compose command: $DOCKER_COMPOSE_CMD"

# 检查是否在 WSL 环境中
if [ -f /proc/version ] && grep -q Microsoft /proc/version; then
    echo "✓ 检测到 WSL 环境"
elif [ -f /proc/version ] && grep -q WSL /proc/version; then
    echo "✓ 检测到 WSL2 环境"
else
    echo "✓ Linux 环境"
fi

# 检查 Docker 是否可用
if ! command -v docker &> /dev/null; then
    echo "✗ Docker 未安装，请先安装 Docker"
    exit 1
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "⚠️  警告: .env 文件不存在"
    echo "请在项目根目录创建 .env 文件并配置必要的环境变量"
    echo "容器将使用默认环境变量启动"
fi

echo "停止现有容器..."
$DOCKER_COMPOSE_CMD down 2>/dev/null || true

echo "构建 Docker 镜像 (无缓存)..."
# 尝试使用 cspc-network，如果不存在则使用默认网络
if docker network ls | grep -q cspc-network; then
    echo "使用 cspc-network 网络构建..."
    DOCKER_BUILDKIT=0 $DOCKER_COMPOSE_CMD build --no-cache --build-arg BUILDKIT_INLINE_CACHE=1
else
    echo "cspc-network 不存在，使用默认网络构建..."
    $DOCKER_COMPOSE_CMD build --no-cache
fi

# 检查构建是否成功
if [ $? -ne 0 ]; then
    echo "✗ Docker 构建失败，请检查错误信息"
    exit 1
fi

# 创建自定义网络配置的临时 docker-compose 文件
if docker network ls | grep -q cspc-network; then
    echo "配置 cspc-network 网络..."
    # 创建临时的 docker-compose.override.yml 文件来添加网络配置
    cat > docker-compose.override.yml << EOF
services:
  deep-research:
    networks:
      - cspc-network
      - default

networks:
  cspc-network:
    external: true
EOF
    echo "✓ 已创建网络配置文件 docker-compose.override.yml"
else
    echo "使用默认网络..."
    # 移除可能存在的 override 文件
    rm -f docker-compose.override.yml 2>/dev/null || true
fi

echo "启动容器..."
$DOCKER_COMPOSE_CMD up -d

# 检查容器是否启动成功
if [ $? -ne 0 ]; then
    echo "✗ 容器启动失败"
    # 清理临时文件
    rm -f docker-compose.override.yml 2>/dev/null || true
    exit 1
fi

echo "✓ 容器已启动成功"
echo "端口映射: 3000:3000"

# 显示容器状态
echo "容器状态:"
$DOCKER_COMPOSE_CMD ps

# 等待服务启动
echo "等待服务启动..."
sleep 10

# 检查服务是否可访问
echo "检查服务状态:"
if curl -s http://localhost:3000 >/dev/null 2>&1; then
    echo "✓ Deep Research 服务 (端口 3000) 运行正常"
else
    echo "⚠️  Deep Research 服务可能还在启动中..."
fi

# 清理临时文件
echo "清理临时配置文件..."
rm -f docker-compose.override.yml 2>/dev/null || true

# 清理未使用的资源
echo "清理未使用的镜像和容器..."
docker system prune -f --volumes

echo "=== Deep Research 构建和运行完成 ==="
echo "Web 服务: http://localhost:3000"
echo ""
echo "查看日志: $DOCKER_COMPOSE_CMD logs -f"
echo "停止服务: $DOCKER_COMPOSE_CMD down"
