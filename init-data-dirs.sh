#!/bin/bash

# Deep Research - Docker 部署检查脚本
# 检查部署环境和数据卷状态

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

echo "======================================="
echo "  Deep Research - 部署环境检查"
echo "======================================="

# 检测运行环境
detect_environment() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        log_info "检测到 Linux 环境"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        log_info "检测到 macOS 环境"
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        log_info "检测到 Windows 环境"
    elif [ -f /proc/version ] && grep -q Microsoft /proc/version; then
        log_info "检测到 WSL 环境"
    elif [ -f /proc/version ] && grep -q WSL /proc/version; then
        log_info "检测到 WSL2 环境"
    else
        log_info "未知环境: $OSTYPE"
    fi
}

# 检查Docker环境
check_docker() {
    log_info "检查 Docker 环境..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        return 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker 服务未运行，请启动 Docker"
        return 1
    fi
    
    # 检查docker-compose
    if command -v docker-compose &> /dev/null; then
        log_success "docker-compose 可用"
    elif docker compose version &> /dev/null; then
        log_success "docker compose 可用"
    else
        log_error "docker-compose 或 docker compose 都不可用"
        return 1
    fi
    
    log_success "Docker 环境检查通过"
    return 0
}

# 检查项目文件
check_project_files() {
    log_info "检查项目文件..."
    
    local missing_files=()
    
    [ ! -f "docker-compose.yml" ] && missing_files+=("docker-compose.yml")
    [ ! -f "Dockerfile" ] && missing_files+=("Dockerfile")
    [ ! -f "package.json" ] && missing_files+=("package.json")
    
    if [ ${#missing_files[@]} -gt 0 ]; then
        log_error "缺少必要文件: ${missing_files[*]}"
        return 1
    fi
    
    if [ ! -f ".env" ]; then
        log_warning ".env 文件不存在，建议创建并配置 API 密钥"
    else
        log_success ".env 文件存在"
    fi
    
    log_success "项目文件检查通过"
    return 0
}

# 检查数据卷状态
check_volumes() {
    log_info "检查 Docker 数据卷..."
    
    local volumes=("deep_research_tasks" "deep_research_logs")
    local existing_volumes=()
    
    for volume in "${volumes[@]}"; do
        if docker volume inspect "$volume" >/dev/null 2>&1; then
            existing_volumes+=("$volume")
        fi
    done
    
    if [ ${#existing_volumes[@]} -gt 0 ]; then
        log_info "发现已存在的数据卷:"
        for volume in "${existing_volumes[@]}"; do
            echo "  - $volume"
        done
        log_warning "数据将会保留，如果需要清理请手动删除"
    else
        log_info "未发现已存在的数据卷，将创建新的数据卷"
    fi
}

# 显示部署建议
show_deployment_info() {
    echo ""
    echo "======================================="
    log_success "环境检查完成！"
    echo "======================================="
    echo ""
    log_info "🚀 现在可以运行部署命令:"
    echo "  ./rebuild4run.sh    # 重新构建并运行"
    echo "  ./deploy.sh         # 快速部署"
    echo "  docker-compose up -d # 直接启动"
    echo ""
    log_info "💾 数据持久化:"
    echo "  使用 Docker named volumes 确保数据安全"
    echo "  任务数据: deep_research_tasks"
    echo "  日志数据: deep_research_logs"
    echo ""
}

# 主执行流程
main() {
    detect_environment
    
    if ! check_docker; then
        log_error "请先解决 Docker 环境问题"
        exit 1
    fi
    
    if ! check_project_files; then
        log_error "请确保在项目根目录下运行此脚本"
        exit 1
    fi
    
    check_volumes
    show_deployment_info
}

# 运行主函数
main