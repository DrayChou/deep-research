@echo off
REM Deep-Research 启动器 - PowerShell 代理脚本
REM 自动转换编码并启动 PowerShell 脚本

chcp 65001 >nul 2>&1
cd /d "%~dp0"

REM 检查 PowerShell 脚本是否存在
if not exist "start.ps1" (
    echo [错误] start.ps1 脚本不存在
    pause
    exit /b 1
)

REM 将 start.ps1 转换为 UTF-8 with BOM 编码
powershell -NoProfile -ExecutionPolicy Bypass -Command "$content = Get-Content -Path 'start.ps1' -Raw -Encoding UTF8; $utf8WithBom = New-Object System.Text.UTF8Encoding($true); [System.IO.File]::WriteAllText((Resolve-Path 'start.ps1').Path, $content, $utf8WithBom)"

if errorlevel 1 (
    echo [错误] 编码转换失败
    pause
    exit /b 1
)

REM 启动 PowerShell 脚本并传递参数
powershell -NoProfile -ExecutionPolicy Bypass -File "start.ps1" %*