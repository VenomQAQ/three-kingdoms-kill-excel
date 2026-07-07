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
    chattr -i "${dist_dir}/.user.ini" 2>/dev/null || true
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
if pm2 describe "${PM2_NAME}" >/dev/null 2>&1; then
  pm2 restart "${PM2_NAME}"
else
  cd "${APP_ROOT}/server"
  pm2 start dist/main.js --name "${PM2_NAME}"
fi

pm2 save
pm2 status

echo ">>> deploy done"
