#!/usr/bin/env bash
# 本机执行：用 root SSH 在服务器上初始化 tkdeploy 部署用户
#
# 用法:
#   ./scripts/bootstrap-deploy-user.sh
#   DEPLOY_SSH_KEY=~/.ssh/tkdeploy_github ROOT_SSH_KEY=~/.ssh/id_rsa ./scripts/bootstrap-deploy-user.sh
#
# 需要：本机能以 root 登录服务器（宝塔默认 root + 密码/密钥）

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-119.91.123.149}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/tkdeploy_github}"
ROOT_USER="${ROOT_USER:-root}"
ROOT_SSH_KEY="${ROOT_SSH_KEY:-}"

if [[ ! -f "${DEPLOY_SSH_KEY}.pub" ]]; then
  echo "ERROR: 找不到部署公钥 ${DEPLOY_SSH_KEY}.pub"
  echo "请先生成: ssh-keygen -t ed25519 -f ${DEPLOY_SSH_KEY} -N \"\" -C github-actions-tkdeploy"
  exit 1
fi

ROOT_SSH=(ssh -p "${DEPLOY_PORT}" -o StrictHostKeyChecking=accept-new)
SCP=(scp -P "${DEPLOY_PORT}" -o StrictHostKeyChecking=accept-new)
if [[ -n "${ROOT_SSH_KEY}" ]]; then
  ROOT_SSH+=(-i "${ROOT_SSH_KEY}")
  SCP+=(-i "${ROOT_SSH_KEY}")
fi

PUBKEY="$(cat "${DEPLOY_SSH_KEY}.pub")"
echo ">>> [1/3] 上传 setup-deploy-user.sh → ${ROOT_USER}@${DEPLOY_HOST}"
"${SCP[@]}" "${ROOT_DIR}/scripts/setup-deploy-user.sh" "${ROOT_USER}@${DEPLOY_HOST}:/tmp/setup-deploy-user.sh"

echo ">>> [2/3] 在服务器初始化 tkdeploy ..."
"${ROOT_SSH[@]}" "${ROOT_USER}@${DEPLOY_HOST}" \
  "DEPLOY_PUBKEY='${PUBKEY}' bash /tmp/setup-deploy-user.sh"

echo ">>> [3/3] 验证 tkdeploy 登录 ..."
ssh -i "${DEPLOY_SSH_KEY}" -p "${DEPLOY_PORT}" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  "tkdeploy@${DEPLOY_HOST}" "echo ssh_ok && whoami"

echo
echo ">>> 完成。请确认 GitHub Secrets："
echo "    SSH_HOST=${DEPLOY_HOST}"
echo "    SSH_USER=tkdeploy"
echo "    SSH_PRIVATE_KEY=<${DEPLOY_SSH_KEY} 私钥全文>"
echo
echo "    本地再测: ./scripts/verify-deploy-ssh.sh"
