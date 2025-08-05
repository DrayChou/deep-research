#!/bin/bash

# Deep Research - 重构和运行脚本
# 优化版本：解决权限问题，简化网络配置，支持数据持久化

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "========================================"
echo "    Deep Research - 重构和运行脚本"
echo "========================================"

# 检测Docker Compose命令
detect_docker_compose() {
    if command -v docker-compose &> /dev/null; then
        echo "docker-compose"
    elif command -v docker &> /dev/null && docker compose version &> /dev/null; then
        echo "docker compose"
    else
        return 1
    fi
}

DOCKER_COMPOSE_CMD=$(detect_docker_compose)

if [ -z "$DOCKER_COMPOSE_CMD" ]; then
    log_error "未找到 docker-compose 或 docker compose 命令"
    log_error "请先安装 Docker Compose"
    exit 1
fi

log_success "使用 Docker Compose 命令: $DOCKER_COMPOSE_CMD"

# 检测运行环境
detect_environment() {
    if [ -f /proc/version ] && grep -q Microsoft /proc/version; then
        log_info "检测到 WSL 环境"
    elif [ -f /proc/version ] && grep -q WSL /proc/version; then
        log_info "检测到 WSL2 环境"
    else
        log_info "Linux/Unix 环境"
    fi
}

# 检查Docker服务
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker 服务未运行，请启动 Docker"
        exit 1
    fi
    
    log_success "Docker 环境检查通过"
}

# 检查必要文件
check_files() {
    if [ ! -f "docker-compose.yml" ]; then
        log_error "docker-compose.yml 文件不存在"
        exit 1
    fi
    
    if [ ! -f "Dockerfile" ]; then
        log_error "Dockerfile 文件不存在"
        exit 1
    fi
    
    if [ ! -f ".env" ]; then
        log_warning ".env 文件不存在，将使用默认环境变量"
        log_info "建议创建 .env 文件配置API密钥等环境变量"
    fi
    
    log_success "必要文件检查通过"
}

# 停止现有服务
stop_existing() {
    log_info "停止现有容器和服务..."
    $DOCKER_COMPOSE_CMD down --remove-orphans 2>/dev/null || true
    log_success "现有服务已停止"
}

# 构建镜像
build_image() {
    log_info "构建 Docker 镜像（无缓存）..."
    
    # 设置构建参数
    export DOCKER_BUILDKIT=1
    
    $DOCKER_COMPOSE_CMD build --no-cache --pull
    
    if [ $? -eq 0 ]; then
        log_success "Docker 镜像构建成功"
    else
        log_error "Docker 镜像构建失败"
        exit 1
    fi
}

# 配置网络
configure_network() {
    log_info "配置网络..."
    
    # 检查 cspc-network 是否存在
    if docker network ls | grep -q cspc-network; then
        log_info "检测到 cspc-network，配置网络连接..."
        
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
        log_success "已创建网络配置文件 docker-compose.override.yml"
    else
        log_info "未检测到 cspc-network，使用默认网络..."
        # 移除可能存在的 override 文件
        rm -f docker-compose.override.yml 2>/dev/null || true
    fi
}

# 启动服务
start_services() {
    log_info "启动服务..."
    
    $DOCKER_COMPOSE_CMD up -d
    
    if [ $? -eq 0 ]; then
        log_success "服务启动成功"
    else
        log_error "服务启动失败"
        # 清理临时文件
        rm -f docker-compose.override.yml 2>/dev/null || true
        exit 1
    fi
}

# 等待服务就绪
wait_for_service() {
    log_info "等待服务启动..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:3000 >/dev/null 2>&1; then
            log_success "Deep Research 服务已就绪"
            return 0
        fi
        
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo ""
    log_warning "服务可能还在启动中，请查看日志"
    return 1
}

# 显示服务状态
show_status() {
    echo ""
    log_info "服务状态："
    $DOCKER_COMPOSE_CMD ps
    
    echo ""
    log_info "数据卷状态："
    docker volume ls | grep deep_research || log_warning "未找到数据卷"
    
    echo ""
    log_info "最近日志（10行）："
    $DOCKER_COMPOSE_CMD logs --tail=10 deep-research
}

# 显示使用信息
show_usage_info() {
    echo ""
    echo "========================================"
    log_success "部署完成！"
    echo "========================================"
    echo ""
    log_info "🌐 Web 服务地址: http://localhost:3000"
    echo ""
    log_info "📋 常用命令："
    echo "  查看实时日志: $DOCKER_COMPOSE_CMD logs -f deep-research"
    echo "  重启服务:    $DOCKER_COMPOSE_CMD restart deep-research"
    echo "  停止服务:    $DOCKER_COMPOSE_CMD down"
    echo "  查看状态:    $DOCKER_COMPOSE_CMD ps"
    echo ""
    log_info "💾 数据持久化："
    echo "  任务数据: deep_research_tasks volume"
    echo "  日志数据: deep_research_logs volume"
    echo ""
}

# 清理函数（错误时调用）
cleanup_on_error() {
    log_error "部署过程中出现错误，正在清理..."
    $DOCKER_COMPOSE_CMD down --remove-orphans 2>/dev/null || true
    # 清理临时文件
    rm -f docker-compose.override.yml 2>/dev/null || true
}

# 清理临时文件
cleanup_temp_files() {
    log_info "清理临时配置文件..."
    rm -f docker-compose.override.yml 2>/dev/null || true
}

# 设置错误处理
trap cleanup_on_error ERR

# 主执行流程
main() {
    detect_environment
    check_docker
    check_files
    stop_existing
    build_image
    configure_network
    start_services
    
    # 显示状态（即使等待服务失败也要显示）
    show_status
    
    # 等待服务就绪（非致命错误）
    wait_for_service || true
    
    # 清理临时文件
    cleanup_temp_files
    
    show_usage_info
}

# 脚本帮助
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Deep Research 重构和运行脚本"
    echo ""
    echo "功能："
    echo "  - 停止现有服务"
    echo "  - 重新构建 Docker 镜像"
    echo "  - 启动服务并检查状态"
    echo "  - 使用 named volumes 持久化数据"
    echo ""
    echo "用法："
    echo "  ./rebuild4run.sh    # 执行完整的重构和部署"
    echo "  ./rebuild4run.sh -h # 显示此帮助"
    echo ""
    exit 0
fi

# 运行主函数
main