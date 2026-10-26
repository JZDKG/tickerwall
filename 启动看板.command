#!/bin/bash
# 双击运行：启动市场看板并在浏览器打开
# 若服务已在运行，则直接打开页面
set -u
cd "$(dirname "$0")" || exit 1

PORT="${PORT:-8787}"
URL="http://127.0.0.1:${PORT}/"

if ! command -v node >/dev/null 2>&1; then
  echo "找不到 node，请先安装 Node.js 20 或更高版本。"
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
