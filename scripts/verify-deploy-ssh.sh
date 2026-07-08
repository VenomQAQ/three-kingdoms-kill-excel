#!/usr/bin/env bash
# 部署前验证 SSH：本机私钥能否以指定用户登录服务器
#
# 用法:
#   ./scripts/verify-deploy-ssh.sh
#   DEPLOY_SSH_KEY=~/.ssh/tkdeploy_github DEPLOY_USER=tkdeploy ./scripts/verify-deploy-ssh.sh

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-119.91.123.149}"
DEPLOY_USER="${DEPLOY_USER:-tkdeploy}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/tkdeploy_github}"

if [[ ! -f "${DEPLOY_SSH_KEY}" ]]; then
  echo "ERROR: 私钥不存在: ${DEPLOY_SSH_KEY}"
  exit 1
fi

PUB_KEY="${DEPLOY_SSH_KEY}.pub"
if [[ -f "${PUB_KEY}" ]]; then
  echo ">>> 私钥指纹: $(ssh-keygen -lf "${DEPLOY_SSH_KEY}" | awk '{print $2}')"
  echo ">>> 公钥指纹: $(ssh-keygen -lf "${PUB_KEY}" | awk '{print $2}')"
fi

echo ">>> 测试 ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PORT} ..."
if ssh -i "${DEPLOY_SSH_KEY}" \
  -p "${DEPLOY_PORT}" \
  -o BatchMode=yes \
  -o ConnectTimeout=15 \
  -o StrictHostKeyChecking=accept-new \
  "${DEPLOY_USER}@${DEPLOY_HOST}" "echo ssh_ok && whoami && pwd"; then
  echo ">>> OK：可以部署"
else
  echo
  echo ">>> FAIL：SSH 认证失败"
  echo "    常见原因："
  echo "    1. 服务器未执行 setup-deploy-user.sh（tkdeploy 未创建或公钥未写入）"
  echo "    2. GitHub Secrets 里的 SSH_PRIVATE_KEY 与服务器 authorized_keys 不是同一对密钥"
  echo "    3. SSH_USER 与服务器实际用户不一致"
  echo
  echo "    修复：用 root 登录服务器后执行一次："
  echo "      ./scripts/bootstrap-deploy-user.sh"
  exit 1
fi
