# ================================================================== *
# 单容器镜像（方案 E08 / §5.3「常驻服务」）
#
# 取舍：
#   · 只跑运行时（生产依赖为空 + 受管产物入库），所以镜像里不需要构建工具；
#   · 数据卷是唯一持久状态：/app/data。容器重建不该丢 DB 与归档；
#   · 非 root 用户运行；
#   · 健康检查打 /api/health 并**看 readiness**，不是只看进程活着。
# ================================================================== *
FROM node:24.21.0-alpine

WORKDIR /app

# 先装依赖（当前 dependencies 为空，这层主要是把契约固化下来：
# 以后加了运行时依赖，镜像会自动带上，不需要改 Dockerfile）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# 应用本体（public/vendor 是受管产物，已入库，不需要在这里构建）
COPY server.mjs ./
COPY src ./src
COPY public ./public
COPY tools ./tools

# 数据卷：库、归档、旧缓存都在这
RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    KANBAN_DATA_DIR=/app/data

EXPOSE 8787
VOLUME ["/app/data"]

# 用 node 直接读 JSON，不依赖 curl（alpine 里没有）
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>r.json()).then(d=>process.exit(d.readiness&&d.readiness.ready?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
