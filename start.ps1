# Deep-Research 启动脚本 (PowerShell版本)
# Next.js React TypeScript 应用程序，使用 pnpm 包管理器

param(
    [Parameter(Position=0)]
    [ValidateSet("dev", "build", "build:standalone", "build:export", "start", "lint", "help")]
    [string]$Command = "dev"
)

# 设置控制台编码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "Deep-Research - $Command"

# 颜色输出函数
function Write-ColorOutput {
    param(
        [string]$Message,
        [ConsoleColor]$ForegroundColor = [ConsoleColor]::White
    )
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] " -NoNewline -ForegroundColor Gray
    Write-Host $Message -ForegroundColor $ForegroundColor
}

function Write-Success {
    param([string]$Message)
    Write-ColorOutput "✅ $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-ColorOutput "❌ $Message" -ForegroundColor Red
}

function Write-Warning {
    param([string]$Message)
    Write-ColorOutput "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$Message)
    Write-ColorOutput "🔍 $Message" -ForegroundColor Blue
}

# 显示帮助信息
function Show-Help {
    Write-Host ""
    Write-Host "Deep-Research 启动脚本" -ForegroundColor Cyan
    Write-Host "==================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "用法: start.ps1 [command]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "可用命令:" -ForegroundColor Yellow
    Write-Host "  dev               启动开发服务器 (默认)" -ForegroundColor White
    Write-Host "  build             构建生产版本" -ForegroundColor White
    Write-Host "  build:standalone  构建独立版本" -ForegroundColor White
    Write-Host "  build:export      构建静态导出" -ForegroundColor White
    Write-Host "  start             启动生产服务器" -ForegroundColor White
    Write-Host "  lint              运行代码检查" -ForegroundColor White
    Write-Host "  help              显示此帮助" -ForegroundColor White
    Write-Host ""
    Write-Host "示例:" -ForegroundColor Yellow
    Write-Host "  .\start.ps1         # 启动开发服务器" -ForegroundColor Green
    Write-Host "  .\start.ps1 dev     # 启动开发服务器" -ForegroundColor Green
    Write-Host "  .\start.ps1 build   # 构建生产版本" -ForegroundColor Green
    Write-Host ""
}

# 检查 Node.js 安装
function Test-NodeJs {
    try {
        $version = node --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Node.js 版本: $version"
            return $true
        }
    }
    catch { }
    
    Write-Error "未找到 Node.js，请先安装 Node.js"
    Write-Warning "下载地址: https://nodejs.org/"
    Write-Warning "最低版本要求: Node.js >= 18.18.0"
    return $false
}

# 检查 pnpm 安装
function Test-Pnpm {
    try {
        $version = pnpm --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "pnpm 版本: $version"
            return $true
        }
    }
    catch { }
    
    Write-Error "未找到 pnpm 包管理器"
    Write-Warning "请安装 pnpm: npm install -g pnpm"
    Write-Warning "或访问: https://pnpm.io/installation"
    return $false
}

# 安装依赖
function Install-Dependencies {
    if (-not (Test-Path "node_modules")) {
        Write-Info "正在安装项目依赖..."
        pnpm install
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "依赖安装成功"
            return $true
        } else {
            Write-Error "依赖安装失败"
            return $false
        }
    }
    return $true
}

# 执行命令
function Invoke-Command {
    param([string]$Cmd)
    
    switch ($Cmd) {
        "dev" {
            Write-Info "启动开发服务器 (使用 Turbopack)..."
            Write-Info "访问地址: http://localhost:3000"
            Write-Info "按 Ctrl+C 停止服务器"
            Write-Host ""
            pnpm run dev
        }
        "build" {
            Write-Info "构建生产版本..."
            pnpm run build
            
            if ($LASTEXITCODE -eq 0) {
                Write-Success "构建成功"
                Write-Info "启动生产服务器: .\start.ps1 start"
            } else {
                Write-Error "构建失败"
            }
        }
        "build:standalone" {
            Write-Info "构建独立版本..."
            pnpm run "build:standalone"
            
            if ($LASTEXITCODE -eq 0) {
                Write-Success "独立版本构建成功"
            } else {
                Write-Error "独立版本构建失败"
            }
        }
        "build:export" {
            Write-Info "构建静态导出版本..."
            pnpm run "build:export"
            
            if ($LASTEXITCODE -eq 0) {
                Write-Success "静态导出构建成功"
            } else {
                Write-Error "静态导出构建失败"
            }
        }
        "start" {
            Write-Info "启动生产服务器..."
            Write-Info "访问地址: http://localhost:3000"
            Write-Info "按 Ctrl+C 停止服务器"
            Write-Host ""
            pnpm run start
        }
        "lint" {
            Write-Info "运行代码检查..."
            pnpm run lint
        }
        "help" {
            Show-Help
            return
        }
        default {
            Write-Error "未知命令: $Cmd"
            Write-Host ""
            Write-Host "可用命令: dev, build, build:standalone, build:export, start, lint, help" -ForegroundColor Yellow
            Write-Host "使用 '.\start.ps1 help' 查看详细帮助" -ForegroundColor Yellow
            exit 1
        }
    }
}

# 主函数
function Main {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "     Deep-Research Frontend" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "命令: $Command" -ForegroundColor White
    Write-Host ""
    
    if ($Command -eq "help") {
        Show-Help
        return
    }
    
    # 检查环境
    if (-not (Test-NodeJs)) {
        Read-Host "按回车键退出"
        exit 1
    }
    
    if (-not (Test-Pnpm)) {
        Read-Host "按回车键退出"
        exit 1
    }
    
    Write-Host ""
    
    # 安装依赖
    if (-not (Install-Dependencies)) {
        Read-Host "按回车键退出"
        exit 1
    }
    
    Write-Host ""
    
    # 执行命令
    Invoke-Command -Cmd $Command
    
    Write-Host ""
    Write-Success "命令执行结束"
}

# 运行主函数
Main