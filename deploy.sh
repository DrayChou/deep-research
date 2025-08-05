#!/bin/bash

# Deep Research Docker 部署脚本
# 简化的一键部署解决方案

set -e  # 遇到错误时退出

# 颜色输出函数
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# 检查Docker环境
check_docker() {
    log_info "检查Docker环境..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装，请先安装Docker"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "docker-compose未安装，请先安装docker-compose"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker服务未运行，请启动Docker"
        exit 1
    fi
    
    log_success "Docker环境检查通过"
}

# 检查必要文件
check_files() {
    log_info "检查必要文件..."
    
    if [ ! -f "docker-compose.yml" ]; then
        log_error "docker-compose.yml文件不存在"
        exit 1
    fi
    
    if [ ! -f "Dockerfile" ]; then
        log_error "Dockerfile文件不存在"
        exit 1
    fi
    
    if [ ! -f ".env" ]; then
        log_warning ".env文件不存在，请确保环境变量配置正确"
    fi
    
    log_success "必要文件检查通过"
}

# 清理旧容器和镜像
cleanup() {
    log_info "清理旧容器和镜像..."
    
    # 停止并删除容器
    docker-compose down --remove-orphans 2>/dev/null || true
    
    # 删除旧镜像（可选）
    if [ "$1" = "--clean" ]; then
        docker rmi deep-research 2>/dev/null || true
        log_success "旧镜像已清理"
    fi
    
    log_success "容器清理完成"
}

# 构建和启动
deploy() {
    log_info "开始构建和部署..."
    
    # 构建镜像
    log_info "构建Docker镜像..."
    docker-compose build --no-cache
    
    if [ $? -eq 0 ]; then
        log_success "镜像构建成功"
    else
        log_error "镜像构建失败"
        exit 1
    fi
    
    # 启动服务
    log_info "启动服务..."
    docker-compose up -d
    
    if [ $? -eq 0 ]; then
        log_success "服务启动成功"
    else
        log_error "服务启动失败"
        exit 1
    fi
}

# 显示状态
show_status() {
    log_info "服务状态："
    docker-compose ps
    
    echo ""
    log_info "服务日志（最近10行）："
    docker-compose logs --tail=10 deep-research
    
    echo ""
    log_success "部署完成！"
    log_info "访问地址: http://localhost:3000"
    log_info "查看实时日志: docker-compose logs -f deep-research"
    log_info "停止服务: docker-compose down"
}

# 主函数
main() {
    echo "========================================"
    echo "     Deep Research Docker 部署脚本"
    echo "========================================"
    echo ""
    
    # 解析命令行参数
    CLEAN=false
    if [ "$1" = "--clean" ]; then
        CLEAN=true
        log_info "将执行完全清理和重新构建"
    fi
    
    # 执行部署步骤
    check_docker
    check_files
    
    if [ "$CLEAN" = true ]; then
        cleanup --clean
    else
        cleanup
    fi
    
    deploy
    show_status
}

# 脚本帮助信息
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Deep Research Docker 部署脚本"
    echo ""
    echo "用法:"
    echo "  ./deploy.sh           # 常规部署"
    echo "  ./deploy.sh --clean   # 清理旧镜像并重新构建"
    echo "  ./deploy.sh --help    # 显示帮助信息"
    echo ""
    echo "部署后管理:"
    echo "  docker-compose logs -f deep-research  # 查看实时日志"
    echo "  docker-compose down                   # 停止服务"
    echo "  docker-compose restart                # 重启服务"
    exit 0
fi

# 运行主函数
main "$@"