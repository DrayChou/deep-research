#!/bin/bash

# Docker 数据目录初始化脚本
# 确保本地数据目录存在并设置正确权限

echo "正在初始化 Docker 数据目录..."

# 创建主数据目录
mkdir -p ./data

# 创建任务数据目录和日志目录
mkdir -p ./data/tasks
mkdir -p ./data/logs

# 设置目录权限 (对于Linux/Mac)
if [[ "$OSTYPE" == "linux-gnu"* || "$OSTYPE" == "darwin"* ]]; then
    echo "设置目录权限..."
    # 设置目录权限为755，确保Docker容器可以访问
    chmod -R 755 ./data
    
    # 设置特定用户权限以匹配容器内的nextjs用户 (UID:1001, GID:1001)
    if command -v chown &> /dev/null; then
        echo "设置用户权限..."
        chown -R 1001:1001 ./data 2>/dev/null || {
            echo "⚠️  无法设置用户权限，请确保以正确权限运行或在部署时处理"
        }
    fi
fi

# Windows环境下的权限设置提示
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    echo "ℹ️  Windows环境检测到，请确保Docker Desktop有权限访问此目录"
fi

# 创建 .gitkeep 文件确保空目录被git跟踪
touch ./data/.gitkeep
touch ./data/tasks/.gitkeep
touch ./data/logs/.gitkeep

echo "✓ 数据目录初始化完成"
echo "  - ./data/tasks 目录已创建"
echo "  - ./data/logs 目录已创建"
echo "  - 目录权限已设置"
echo "  - 空目录已添加到git跟踪"

# 显示目录信息
echo ""
echo "目录信息:"
ls -la ./data/

echo ""
echo "🚀 现在可以运行 'docker-compose up -d' 启动服务"