#!/bin/bash

# Docker 数据目录初始化脚本
# 确保本地数据目录存在并设置正确权限

echo "正在初始化 Docker 数据目录..."

# 创建主数据目录
mkdir -p ./data

# 创建任务数据目录
mkdir -p ./data/tasks

# 设置目录权限 (对于Linux/Mac)
if [[ "$OSTYPE" == "linux-gnu"* || "$OSTYPE" == "darwin"* ]]; then
    echo "设置目录权限..."
    # 设置目录权限为755，确保Docker容器可以访问
    chmod 755 ./data
    chmod 755 ./data/tasks
    
    # 如果需要，可以设置特定用户权限 (取消注释并根据需要修改)
    # chown -R 1001:1001 ./data/tasks  # 1001:1001 是容器内nextjs用户的UID:GID
fi

# 创建 .gitkeep 文件确保空目录被git跟踪
touch ./data/.gitkeep
touch ./data/tasks/.gitkeep

echo "✓ 数据目录初始化完成"
echo "  - ./data/tasks 目录已创建"
echo "  - 目录权限已设置"
echo "  - 空目录已添加到git跟踪"

# 显示目录信息
echo ""
echo "目录信息:"
ls -la ./data/