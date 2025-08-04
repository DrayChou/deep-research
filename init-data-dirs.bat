@echo off
REM Docker 数据目录初始化脚本 (Windows版本)
REM 确保本地数据目录存在并设置正确权限

echo 正在初始化 Docker 数据目录...

REM 创建主数据目录
if not exist "data" mkdir data

REM 创建任务数据目录
if not exist "data\tasks" mkdir data\tasks

REM 创建 .gitkeep 文件确保空目录被git跟踪
echo. > data\.gitkeep
echo. > data\tasks\.gitkeep

echo ✓ 数据目录初始化完成
echo   - ./data/tasks 目录已创建
echo   - 空目录已添加到git跟踪

echo.
echo 目录信息:
dir /a data\

echo.
echo 提示: 在Windows上，Docker会自动处理目录权限
echo 如果遇到权限问题，请确保Docker Desktop有权限访问这些目录