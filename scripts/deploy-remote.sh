#!/usr/bin/env bash
# 在服务器上执行：安装依赖、构建、重启 PM2
set -euo pipefail

APP_ROOT="/www/wwwroot/three-kingdoms-kill"
PM2_NAME="tk-server"

# 宝塔 Node / 全局 npm 常见路径
for node_bin in \
  "/www/server/nvm/versions/node/v20.11.1/bin" \
  "/www/server/nvm/versions/node/v20.18.0/bin" \
  "/usr/local/bin"
do
  if [[ -x "${node_bin}/node" ]]; then
    export PATH="${node_bin}:${PATH}"
    break
  fi
done

cd "${APP_ROOT}"

echo ">>> node: $(command -v node) ($(node -v))"

clean_dist_dir() {
  local dist_dir="$1"
  if [[ ! -e "${dist_dir}" ]]; then
    return 0
  fi

  # 宝塔会在网站目录自动生成 .user.ini，且可能带 immutable 属性，阻塞 Vite 清空 dist
  if [[ -f "${dist_dir}/.user.ini" ]]; then
    if ! chattr -i "${dist_dir}/.user.ini" 2>/dev/null; then
      sudo -n chattr -i "${dist_dir}/.user.ini" 2>/dev/null || true
    fi
    rm -f "${dist_dir}/.user.ini"
  fi

  rm -rf "${dist_dir}"
}

echo ">>> clean dist directories..."
clean_dist_dir "${APP_ROOT}/client/dist"
clean_dist_dir "${APP_ROOT}/server/dist"

if [[ "${SKIP_NPM_INSTALL:-0}" != "1" ]]; then
  echo ">>> npm install..."
  npm install
else
  echo ">>> skip npm install (SKIP_NPM_INSTALL=1)"
fi

echo ">>> npm run build..."
npm run build

if [[ ! -f "${APP_ROOT}/server/dist/main.js" ]]; then
  echo "ERROR: server/dist/main.js not found after build"
  exit 1
fi

echo ">>> pm2 restart ${PM2_NAME}..."
cd "${APP_ROOT}/server"
if [[ ! -f ".env" ]]; then
  echo "ERROR: server/.env not found (JWT_ACCESS_SECRET etc. required in production)"
  exit 1
fi

# 停掉旧 PM2 实例，并释放 3000 端口（避免遗留 node 进程导致 EADDRINUSE）
pm2 stop "${PM2_NAME}" 2>/dev/null || true
pm2 delete "${PM2_NAME}" 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
sleep 1

if ss -tln 2>/dev/null | grep -q ':3000 '; then
  echo "ERROR: 端口 3000 仍被占用（常见原因：root 下遗留的 dist-dev node 进程）"
  echo "       请以 root 在服务器执行: bash ${APP_ROOT}/scripts/fix-production-server.sh"
  ps aux | grep -E "[n]ode .*${APP_ROOT}" || true
  exit 1
fi

NODE_ENV=production pm2 start ecosystem.config.cjs

pm2 save
pm2 status

echo ">>> deploy done"
