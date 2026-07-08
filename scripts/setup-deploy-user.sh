#!/usr/bin/env bash
# 在服务器上以 root 执行一次，创建专用部署用户 tkdeploy
#
# 用法（本机先生成密钥，再把公钥传给服务器）:
#   ssh-keygen -t ed25519 -f ~/.ssh/tkdeploy_github -N "" -C "github-actions-tkdeploy"
#   scp scripts/setup-deploy-user.sh root@<host>:/tmp/
#   ssh root@<host> "DEPLOY_PUBKEY='$(cat ~/.ssh/tkdeploy_github.pub)' bash /tmp/setup-deploy-user.sh"
#
# 然后在 GitHub Secrets 更新:
#   SSH_USER=tkdeploy
#   SSH_PRIVATE_KEY=<~/.ssh/tkdeploy_github 私钥全文>

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-tkdeploy}"
APP_ROOT="${APP_ROOT:-/www/wwwroot/three-kingdoms-kill}"
PM2_NAME="${PM2_NAME:-tk-server}"
DEPLOY_PUBKEY="${DEPLOY_PUBKEY:-}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: 请使用 root 执行本脚本"
  exit 1
fi

if [[ -z "${DEPLOY_PUBKEY}" ]]; then
  echo "ERROR: 请设置 DEPLOY_PUBKEY 环境变量（部署专用公钥）"
  exit 1
fi

if ! id "${DEPLOY_USER}" &>/dev/null; then
  useradd -m -s /bin/bash "${DEPLOY_USER}"
  echo ">>> created user ${DEPLOY_USER}"
else
  echo ">>> user ${DEPLOY_USER} already exists"
fi

NODE_BIN=""
for candidate in \
  "/www/server/nvm/versions/node/v20.18.0/bin" \
  "/www/server/nvm/versions/node/v20.11.1/bin" \
  "/usr/local/bin"
do
  if [[ -x "${candidate}/node" ]]; then
    NODE_BIN="${candidate}"
    break
  fi
done

if [[ -z "${NODE_BIN}" ]]; then
  echo "ERROR: 未找到 node，请先在宝塔安装 Node.js"
  exit 1
fi

PROFILE="/home/${DEPLOY_USER}/.profile"
if ! grep -q "three-kingdoms-kill deploy PATH" "${PROFILE}" 2>/dev/null; then
  cat >> "${PROFILE}" <<EOF

# three-kingdoms-kill deploy PATH
export PATH="${NODE_BIN}:\$PATH"
EOF
fi

chown "${DEPLOY_USER}:${DEPLOY_USER}" "${PROFILE}"

install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
AUTH_KEYS="/home/${DEPLOY_USER}/.ssh/authorized_keys"
touch "${AUTH_KEYS}"
chmod 600 "${AUTH_KEYS}"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${AUTH_KEYS}"

if ! grep -Fq "${DEPLOY_PUBKEY}" "${AUTH_KEYS}"; then
  echo "${DEPLOY_PUBKEY}" >> "${AUTH_KEYS}"
fi

if [[ -d "${APP_ROOT}" ]]; then
  chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_ROOT}"
fi

cat > /etc/sudoers.d/tkdeploy <<EOF
${DEPLOY_USER} ALL=(root) NOPASSWD: /usr/bin/chattr -i ${APP_ROOT}/client/dist/.user.ini, /usr/bin/chattr -i ${APP_ROOT}/server/dist/.user.ini
EOF
chmod 440 /etc/sudoers.d/tkdeploy

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "${PM2_NAME}" >/dev/null 2>&1; then
    echo ">>> stopping root-owned pm2 process ${PM2_NAME}"
    pm2 stop "${PM2_NAME}" || true
    pm2 delete "${PM2_NAME}" || true
    pm2 save || true
  fi
fi

echo ">>> cleanup legacy root node processes under ${APP_ROOT}"
mapfile -t LEGACY_PIDS < <(ps aux | grep -E "[n]ode .*${APP_ROOT}" | awk '{print $2}')
for pid in "${LEGACY_PIDS[@]:-}"; do
  echo "    kill pid=${pid}"
  kill "${pid}" 2>/dev/null || true
done
fuser -k 3000/tcp 2>/dev/null || true

if ! sudo -u "${DEPLOY_USER}" bash -lc 'command -v pm2' >/dev/null 2>&1; then
  echo ">>> installing pm2 for ${DEPLOY_USER}"
  sudo -u "${DEPLOY_USER}" bash -lc "npm install -g pm2"
fi

echo
echo ">>> setup complete"
echo "    deploy user : ${DEPLOY_USER}"
echo "    app root    : ${APP_ROOT}"
echo "    node path   : ${NODE_BIN}"
echo
echo "Next steps:"
echo "  1. GitHub Secrets -> SSH_USER=tkdeploy"
echo "  2. GitHub Secrets -> SSH_PRIVATE_KEY=<对应私钥>"
echo "  3. 本地测试: DEPLOY_USER=tkdeploy DEPLOY_SSH_KEY=~/.ssh/tkdeploy_github ./scripts/deploy.sh"
echo "  4. 推送 main 触发自动部署"
