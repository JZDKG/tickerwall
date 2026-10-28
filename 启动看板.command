#!/bin/bash
# 双击运行：启动市场看板并在浏览器打开
# 若服务已在运行，则直接打开页面
set -u
cd "$(dirname "$0")" || exit 1

PORT="${PORT:-8787}"
URL="http://127.0.0.1:${PORT}/"

if ! command -v node >/dev/null 2>&1; then
  echo "找不到 node，请先安装 Node.js 24 或更高版本（见 .nvmrc）。"
  read -r -p "按回车键关闭…" _
  exit 1
fi

# 运行时依赖：必须先于 doctor 执行 —— doctor 会因为「声明了依赖但没装」直接判
# 环境不合格，顺序颠倒的结果是「新机器永远装不上」。
needs_runtime_deps() {
  node -e 'const p=require("./package.json");process.exit(Object.keys(p.dependencies||{}).length?0:1)' >/dev/null 2>&1
}

if [ ! -d node_modules ] && needs_runtime_deps; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "这个版本需要先安装依赖，但找不到 npm。请装 Node.js（自带 npm）后重试。"
    read -r -p "按回车键关闭…" _
    exit 1
  fi
  echo "首次运行：安装运行时依赖…"
  if ! npm ci --omit=dev >/tmp/market-kanban-install.log 2>&1; then
    echo "依赖安装失败，日志见 /tmp/market-kanban-install.log"
    tail -n 20 /tmp/market-kanban-install.log
    read -r -p "按回车键关闭…" _
    exit 1
  fi
fi

# 环境预检（方案 E01）：版本 / node:sqlite / 配置 / 数据目录 / 静态产物 / 运行时依赖
node tools/doctor.mjs >/tmp/market-kanban-doctor.log 2>&1
doctor_code=$?
# 0 = 全过，2 = 只有警告（可以继续），其余 = 有 error
if [ "${doctor_code}" -ne 0 ] && [ "${doctor_code}" -ne 2 ]; then
  echo "环境预检未通过（exit ${doctor_code}）："
  cat /tmp/market-kanban-doctor.log
  read -r -p "按回车键关闭…" _
  exit 1
fi

if curl -s -m 1 -o /dev/null "${URL}api/health"; then
  echo "看板已在运行，直接打开页面。"
else
  echo "正在启动看板…"
  nohup node server.mjs > /tmp/market-kanban.log 2>&1 &
  for _ in $(seq 1 60); do
    if curl -s -m 1 -o /dev/null "${URL}api/health"; then break; fi
    sleep 0.25
  done
  if ! curl -s -m 1 -o /dev/null "${URL}api/health"; then
    echo "启动失败，日志见 /tmp/market-kanban.log"
    tail -n 20 /tmp/market-kanban.log
    read -r -p "按回车键关闭…" _
    exit 1
  fi
fi

open "${URL}"
echo "已打开 ${URL}（关闭窗口不会停止服务，日志：/tmp/market-kanban.log）"
