#!/usr/bin/env bash
# 修复生产环境 Nginx：关闭 HTTP/3/QUIC，清除浏览器 Alt-Svc 缓存，优化 API 反代。
#
# 根因：宝塔默认开启 HTTP/3，但腾讯云安全组通常未放行 UDP 443。
# 浏览器收到 Alt-Svc 后会尝试 QUIC，导致 POST /api/.../finish 等请求
# 出现 net::ERR_CONNECTION_RESET / Failed to fetch（Provisional headers）。
#
# 用法（需 root SSH）:
#   scp scripts/fix-nginx-production.sh root@<host>:/tmp/
#   ssh root@<host> 'bash /tmp/fix-nginx-production.sh'
#
# 或本机一键:
#   DEPLOY_HOST=119.91.123.149 DEPLOY_SSH_KEY=~/.ssh/github_deploy_tk ./scripts/fix-nginx-production.sh

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-119.91.123.149}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/github_deploy_tk}"
CONF="/www/server/panel/vhost/nginx/119.91.123.149.conf"

if [[ "${1:-}" == "--local" ]]; then
  # 在服务器上以 root 直接执行
  :
else
  exec ssh -i "${DEPLOY_SSH_KEY}" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
    "root@${DEPLOY_HOST}" "bash -s -- --local" < "$0"
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: 需要 root 权限"
  exit 1
fi

if [[ ! -f "${CONF}" ]]; then
  echo "ERROR: 未找到站点配置 ${CONF}"
  exit 1
fi

cp "${CONF}" "${CONF}.bak.$(date +%Y%m%d%H%M%S)"

cat > "${CONF}" <<'NGINXEOF'
server
{
    listen 80;
    listen [::]:80;
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name 119.91.123.149 game.nomore.store;
    index index.html;
    root /www/wwwroot/three-kingdoms-kill/client/dist;

    #SSL-START SSL相关配置，请勿删除或修改下一行带注释的404规则
    #error_page 404/404.html;
    #HTTP_TO_HTTPS_START
    set $isRedcert 1;
    if ($server_port != 443) {
        set $isRedcert 2;
    }
    if ( $uri ~ /\.well-known/ ) {
        set $isRedcert 1;
    }
    if ($http_cf_ray != "") {
        set $isRedcert 1;
    }
    if ($isRedcert != 1) {
        rewrite ^(/.*)$ https://$host$1 permanent;
    }
    #HTTP_TO_HTTPS_END
    ssl_certificate    /www/server/panel/vhost/cert/119.91.123.149/fullchain.pem;
    ssl_certificate_key    /www/server/panel/vhost/cert/119.91.123.149/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers EECDH+CHACHA20:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_tickets off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    keepalive_timeout 30;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header Alt-Svc "clear" always;
    error_page 497  https://$host$request_uri;
    #SSL-END

    #CERT-APPLY-CHECK--START
    include /www/server/panel/vhost/nginx/well-known/119.91.123.149.conf;
    #CERT-APPLY-CHECK--END
    include /www/server/panel/vhost/nginx/extension/119.91.123.149/*.conf;

    #REWRITE-START
    include /www/server/panel/vhost/rewrite/119.91.123.149.conf;
    #REWRITE-END

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        proxy_buffering off;
    }

    location /rooms {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~ .*\.(gif|jpg|jpeg|png|bmp|swf)$ {
        expires 30d;
        access_log off;
    }

    location ~ .*\.(js|css)$ {
        expires 12h;
        access_log off;
    }

    location ~* (\.user.ini|\.htaccess|\.htpasswd|\.env.*|\.git|node_modules) {
        return 404;
    }

    location ~ \.well-known {
        allow all;
    }

    access_log /www/wwwlogs/119.91.123.149.log;
    error_log  /www/wwwlogs/119.91.123.149.error.log;
}
NGINXEOF

nginx -t
/www/server/nginx/sbin/nginx -s stop 2>/dev/null || true
sleep 1
/www/server/nginx/sbin/nginx
sleep 1

if ss -ulnp | grep -q ':443'; then
  echo "WARN: UDP 443 仍在监听，请手动检查 nginx 配置是否仍含 quic/http3"
else
  echo ">>> UDP 443 已关闭"
fi

echo ">>> Nginx 已修复：HTTP/3/QUIC 已关闭，Alt-Svc 已清除"
echo ">>> 验证：curl -sk https://game.nomore.store/api/lianliankan/config -o /dev/null -w '%{http_code}\n'"
