# Stage 1: Base image with Node.js 18 on Alpine
FROM node:18-alpine AS base

# ----------------------------------------------------------------
# Stage 2: Install dependencies, including compiling native addons
FROM base AS deps

# 使用国内镜像源加速
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装 better-sqlite3 编译所需的完整依赖
# build-base 包含了 make, g++, gcc 等基础编译工具
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    build-base \
    linux-headers \
    sqlite-dev

WORKDIR /app

# 复制包管理文件
COPY package.json pnpm-lock.yaml* ./

# 使用国内NPM镜像源并强制从源码编译 better-sqlite3
RUN npm config set registry https://mirrors.huaweicloud.com/repository/npm/
ENV BETTER_SQLITE3_SKIP_DOWNLOAD_BINARY=true
ENV npm_config_build_from_source=true

# 安装所有依赖
# pnpm 会在这里编译 better-sqlite3
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# ----------------------------------------------------------------
# Stage 3: Build the application source code
FROM base AS builder
WORKDIR /app

# 从 deps 阶段复制编译好的依赖
COPY --from=deps /app/node_modules ./node_modules
# 复制你项目的其他文件
COPY . .

# 构建 Next.js 应用
# Standalone 模式会把所有需要的依赖打包
ENV NEXT_PUBLIC_BUILD_MODE=standalone
RUN npm run build

# ----------------------------------------------------------------
# Stage 4: Production image - lean and secure
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# 安装生产环境的运行时依赖
# sqlite-libs: 提供 SQLite 的运行时库
# libstdc++: 提供 C++ 的运行时库
# libc6-compat: 兼容性库
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    apk add --no-cache \
    sqlite-libs \
    libstdc++ \
    libc6-compat

# 从 builder 阶段复制构建好的应用
# Next.js standalone 会生成一个独立的 server.js 和一个 node_modules 目录
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# [关键修复]
# 将 'deps' 阶段完整编译的 'better-sqlite3' 模块复制到最终的 node_modules 中。
# `COPY --from` 会自动处理 pnpm 的符号链接，复制实际的文件内容。
COPY --from=deps /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

# 创建一个非 root 用户来运行应用，增强安全性
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
