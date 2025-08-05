# Stage 1: Base image with Node.js 18 on Debian-slim
FROM docker.m.daocloud.io/library/node:18-slim AS base

# ----------------------------------------------------------------
# Stage 2: Install dependencies using pre-compiled binaries
FROM base AS deps

# HTTP→HTTPS智能源切换策略（优化构建速度和可靠性）
RUN echo "🇨🇳 第一步：配置HTTP镜像源（绕过证书验证）..." && \
    # 备份原始源
    cp /etc/apt/sources.list /etc/apt/sources.list.backup 2>/dev/null || true && \
    # 使用HTTP阿里云镜像源（避免HTTPS证书验证死循环）
    echo 'deb http://mirrors.aliyun.com/debian/ bookworm main contrib non-free non-free-firmware' > /etc/apt/sources.list && \
    echo 'deb http://mirrors.aliyun.com/debian/ bookworm-updates main contrib non-free non-free-firmware' >> /etc/apt/sources.list && \
    echo 'deb http://mirrors.aliyun.com/debian-security bookworm-security main contrib non-free non-free-firmware' >> /etc/apt/sources.list && \
    # 清理其他源配置
    rm -rf /etc/apt/sources.list.d/* 2>/dev/null || true && \
    # 第二步：使用HTTP源安装ca-certificates
    echo "🇨🇳 第二步：使用HTTP源安装ca-certificates..." && \
    apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    # 第三步：升级为HTTPS源（安全加固）
    echo "🇨🇳 第三步：升级为HTTPS源..." && \
    sed -i 's|http://|https://|g' /etc/apt/sources.list && \
    apt-get update && \
    apt-get clean && \
    echo "✅ 源配置完成（HTTP→HTTPS升级策略）"

WORKDIR /app

# 复制包管理文件
COPY package.json pnpm-lock.yaml* ./
COPY .pnpmfile.cjs ./  # <-- 确保加上了这一行！

# (可选) 使用国内NPM镜像源
RUN npm config set registry https://mirrors.huaweicloud.com/repository/npm/

# 【重要】移除强制编译的环境变量
# ENV BETTER_SQLITE3_SKIP_DOWNLOAD_BINARY=true  <-- 删除这一行
# ENV npm_config_build_from_source=true       <-- 删除这一行

# 安装所有依赖
# pnpm 会自动下载 better-sqlite3 的预编译版本
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# ----------------------------------------------------------------
# Stage 3: Build the application source code
FROM base AS builder
WORKDIR /app

# 从 deps 阶段复制已经安装好的依赖
COPY --from=deps /app/node_modules ./node_modules
# 复制你项目的其他文件
COPY . .

# 构建 Next.js 应用
ENV NEXT_PUBLIC_BUILD_MODE=standalone
RUN npm run build

# ----------------------------------------------------------------
# Stage 4: Production image - lean and secure
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# HTTP→HTTPS智能源切换策略（优化构建速度和可靠性）
RUN echo "🇨🇳 第一步：配置HTTP镜像源（绕过证书验证）..." && \
    # 备份原始源
    cp /etc/apt/sources.list /etc/apt/sources.list.backup 2>/dev/null || true && \
    # 使用HTTP阿里云镜像源（避免HTTPS证书验证死循环）
    echo 'deb http://mirrors.aliyun.com/debian/ bookworm main contrib non-free non-free-firmware' > /etc/apt/sources.list && \
    echo 'deb http://mirrors.aliyun.com/debian/ bookworm-updates main contrib non-free non-free-firmware' >> /etc/apt/sources.list && \
    echo 'deb http://mirrors.aliyun.com/debian-security bookworm-security main contrib non-free non-free-firmware' >> /etc/apt/sources.list && \
    # 清理其他源配置
    rm -rf /etc/apt/sources.list.d/* 2>/dev/null || true && \
    # 第二步：使用HTTP源安装ca-certificates
    echo "🇨🇳 第二步：使用HTTP源安装ca-certificates..." && \
    apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    # 第三步：升级为HTTPS源（安全加固）
    echo "🇨🇳 第三步：升级为HTTPS源..." && \
    sed -i 's|http://|https://|g' /etc/apt/sources.list && \
    apt-get update && \
    apt-get clean && \
    echo "✅ 源配置完成（HTTP→HTTPS升级策略）"

# Debian 环境下安装 sqlite3 的运行时库
# 使用 apt-get 代替 apk
RUN apt-get update && \
    apt-get install -y --no-install-recommends sqlite3 && \
    rm -rf /var/lib/apt/lists/*

# 从 builder 阶段复制构建好的应用
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# 【重要】不再需要手动复制 better-sqlite3
# 因为预编译版本会被 Next.js standalone 正确打包，所以下面这行可以删除了
# COPY --from=deps /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

# 创建一个非 root 用户来运行应用
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 创建数据持久化目录
RUN mkdir -p /app/data/tasks

# 将整个应用目录的所有权交给新用户
RUN chown -R nextjs:nodejs /app

# 切换到非 root 用户
USER nextjs

EXPOSE 3000

# 启动应用
CMD ["node", "server.js"]