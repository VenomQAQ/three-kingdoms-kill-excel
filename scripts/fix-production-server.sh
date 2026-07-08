#!/usr/bin/env bash
# 在服务器上以 root 执行一次：清理占用 3000 端口的遗留 node 进程，再交给 tkdeploy 部署。
#
# 本机执行（需 root SSH）:
#   scp scripts/fix-production-server.sh root@<host>:/tmp/
#   ssh root@<host> 'bash /tmp/fix-production-server.sh'
#
# 或已在服务器上:
#   sudo bash scripts/fix-production-server.sh

set -euo pipefail

APP_ROOT="${APP_ROOT:-/www/wwwroot/three-kingdoms-kill}"
DEPLOY_USER="${DEPLOY_USER:-tkdeploy}"
PM2_NAME="${PM2_NAME:-tk-server}"
PORT="${PORT:-3000}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: 请使用 root 执行（tkdeploy 无法结束 root 拥有的 node 进程）"
  exit 1
fi

echo ">>> [1/4] 停止 root 侧 PM2（如有）"
if command -v pm2 >/dev/null 2>&1; then
  pm2 stop "${PM2_NAME}" 2>/dev/null || true
  pm2 delete "${PM2_NAME}" 2>/dev/null || true
  pm2 save 2>/dev/null || true
fi

echo ">>> [2/4] 结束占用 ${PORT} 的遗留 node 进程（含 dist-dev）"
mapfile -t PIDS < <(ps aux | grep -E "[n]ode .*${APP_ROOT}" | awk '{print $2}')
for pid in "${PIDS[@]:-}"; do
  echo "    kill pid=${pid}"
  kill "${pid}" 2>/dev/null || true
done
sleep 1
fuser -k "${PORT}/tcp" 2>/dev/null || true
sleep 1

if ss -tln | grep -q ":${PORT} "; then
  echo "ERROR: 端口 ${PORT} 仍被占用，请手动检查: ss -tlnp | grep ${PORT}"
  exit 1
fi
echo "    端口 ${PORT} 已释放"

echo ">>> [3/4] 以 ${DEPLOY_USER} 重新构建并启动 PM2"
sudo -u "${DEPLOY_USER}" bash -lc "cd '${APP_ROOT}' && bash scripts/deploy-remote.sh"

echo ">>> [4/4] 健康检查"
sleep 2
STATUS="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/lianliankan/config" || echo 000)"
echo "    GET /api/lianliankan/config -> HTTP ${STATUS}"
if [[ "${STATUS}" != "200" ]]; then
  echo "WARN: API 未返回 200，请查看: sudo -u ${DEPLOY_USER} pm2 logs ${PM2_NAME} --lines 50"
  exit 1
fi

echo ">>> 生产环境修复完成"
