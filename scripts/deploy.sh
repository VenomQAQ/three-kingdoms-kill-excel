#!/usr/bin/env bash
# 本机一键部署到腾讯云（rsync + 远程 build + pm2 restart）
#
# 用法:
#   ./scripts/deploy.sh
#   ./scripts/deploy.sh --skip-install    # 依赖未变时跳过 npm install
#
# 可选环境变量:
#   DEPLOY_HOST      默认 119.91.123.149
#   DEPLOY_USER      默认 root
#   DEPLOY_PORT      默认 22
#   DEPLOY_SSH_KEY   SSH 私钥路径（不设置则用系统默认密钥）

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ===== 部署目标（可按需改）=====
DEPLOY_HOST="${DEPLOY_HOST:-119.91.123.149}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
REMOTE_DIR="/www/wwwroot/three-kingdoms-kill"
SITE_URL="${DEPLOY_SITE_URL:-https://game.nomore.store}"
# ==============================

SKIP_INSTALL=0
if [[ "${1:-}" == "--skip-install" ]]; then
  SKIP_INSTALL=1
fi

SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"
SSH_BASE=(ssh -p "${DEPLOY_PORT}" -o StrictHostKeyChecking=accept-new)
RSYNC_SSH="ssh -p ${DEPLOY_PORT} -o StrictHostKeyChecking=accept-new"

if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
  SSH_BASE+=(-i "${DEPLOY_SSH_KEY}")
  RSYNC_SSH+=" -i ${DEPLOY_SSH_KEY}"
fi

echo ">>> [1/3] 同步代码 → ${SSH_TARGET}:${REMOTE_DIR}"
rsync -avz --progress \
  -e "${RSYNC_SSH}" \
  --exclude node_modules \
  --exclude dist \
  --exclude dist-dev \
  --exclude .git \
  --exclude server/data \
  --exclude server/.env \
  "${ROOT_DIR}/" "${SSH_TARGET}:${REMOTE_DIR}/"

REMOTE_CMD="bash ${REMOTE_DIR}/scripts/deploy-remote.sh"
if [[ "${SKIP_INSTALL}" -eq 1 ]]; then
  REMOTE_CMD="SKIP_NPM_INSTALL=1 bash ${REMOTE_DIR}/scripts/deploy-remote.sh"
fi

echo ">>> [2/3] 远程构建 & 重启 PM2"
"${SSH_BASE[@]}" "${SSH_TARGET}" "${REMOTE_CMD}"

echo ">>> [3/3] 完成"
echo "    访问: ${SITE_URL}"
echo "    日志: ssh ${SSH_TARGET} 'pm2 logs tk-server --lines 30'"
