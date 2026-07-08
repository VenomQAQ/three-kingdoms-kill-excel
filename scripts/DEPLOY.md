# 部署说明

生产环境使用专用用户 **`tkdeploy`** 部署，不使用 `root`。

## 一次性初始化（服务器）

本机生成部署专用密钥：

```bash
ssh-keygen -t ed25519 -f ~/.ssh/tkdeploy_github -N "" -C "github-actions-tkdeploy"
```

上传并在服务器执行初始化：

```bash
scp scripts/setup-deploy-user.sh root@<host>:/tmp/
ssh root@<host> "DEPLOY_PUBKEY='$(cat ~/.ssh/tkdeploy_github.pub)' bash /tmp/setup-deploy-user.sh"
```

脚本会：

- 创建 `tkdeploy` 用户
- 将 `/www/wwwroot/three-kingdoms-kill` 目录所有权交给 `tkdeploy`
- 安装部署公钥
- 仅授权 `chattr` 两个 `.user.ini` 的 sudo（处理宝塔防删文件）
- 将 PM2 进程从 `root` 迁移到 `tkdeploy`

## 更新 GitHub Secrets

| Secret | 值 |
|--------|-----|
| `SSH_USER` | `tkdeploy` |
| `SSH_PRIVATE_KEY` | `~/.ssh/tkdeploy_github` 私钥全文 |
| `SSH_HOST` | 不变 |

## 本机手动部署

```bash
DEPLOY_USER=tkdeploy DEPLOY_SSH_KEY=~/.ssh/tkdeploy_github ./scripts/deploy.sh
```

## 域名与 Cloudflare

当前 `game.nomore.store` 的 DNS 若解析到源站 IP（如 `119.91.123.149`），说明是 **DNS only（灰云）**，流量不经过 Cloudflare 代理，主要在宝塔/nginx 与源站 PM2 上排查。

若改为 **Proxied（橙云）**，请在 Cloudflare 检查：

| 项 | 建议 |
|----|------|
| SSL/TLS | 国内未备案域名：**禁止用「灵活 Flexible」**（CF 走 HTTP 回源会被腾讯云拦备案页）。用 **完全 Full**；若 525 再试灰云直连 |
| Cache Rules | `/api/*` → **Bypass cache** |
| Network | WebSockets **开启**（Socket.IO 需要） |
| Security | 若 `finish` 等 POST 被拦，对 `/api/*` 降低 WAF 或加 Skip 规则 |

浏览器 DevTools 若显示 **Remote Address: 127.0.0.1:7890**，说明走了本机代理（Clash 等），请在代理里为 `game.nomore.store` 设 **DIRECT/直连**，否则易出现 `Failed to fetch`。

## 宝塔站点：关闭 HTTP/3（QUIC）— 已确认为根因

**症状：**

- 连连看挑战成功后 `POST .../finish` 失败（DevTools 显示 *Provisional headers*）
- 首次进入或频繁刷新出现 `ERR_CONNECTION_RESET`
- 其他 GET 接口有时正常、有时也失败

**根因：** 宝塔默认开启 HTTP/3/QUIC 并下发 `Alt-Svc: h3=":443"`，但腾讯云安全组通常**未放行 UDP 443**。浏览器缓存 Alt-Svc 后会改走 QUIC，连接被重置，POST 更容易失败。

**一键修复（root SSH）：**

```bash
DEPLOY_HOST=119.91.123.149 DEPLOY_SSH_KEY=~/.ssh/github_deploy_tk ./scripts/fix-nginx-production.sh
```

脚本会：关闭 QUIC/HTTP3、移除 Alt-Svc 广告、下发 `Alt-Svc: clear` 清除浏览器缓存、优化 `/api/` 反代超时，并**完整重启** Nginx（`reload` 无法释放 UDP 443）。

**手动（宝塔面板）：**

1. 网站 → `game.nomore.store` → 设置 → **关闭 HTTP/3 / QUIC**
2. 腾讯云安全组确认放行 **TCP 443**（若仍要用 HTTP/3，还需 **UDP 443**）
3. 浏览器：**清除 `game.nomore.store` 站点数据** 或硬刷新（`Cmd+Shift+R`）

**验证：** DevTools → Network → `finish` 的 Protocol 应为 `h2` 或 `http/1.1`，不是 `h3`。

## 仍不稳定时：开启 Cloudflare 橙云代理

当前 DNS 为灰云（仅 DNS），流量直连源站，易受源站网络抖动影响。

1. Cloudflare DNS → `game.nomore.store` A 记录 → 改为 **Proxied（橙云）**
2. SSL/TLS → **Full (strict)**
3. Cache Rules → `/api/*` → **Bypass cache**
4. Network → WebSockets **开启**（Socket.IO 需要）

## 权限边界

`tkdeploy` 只能：

- 读写项目目录
- 执行 `npm install` / `npm run build`
- 管理自己的 PM2 进程 `tk-server`
- sudo 解除宝塔 `.user.ini` 锁定

`tkdeploy` 不能：

- 登录系统管理
- 修改其他目录
- 执行任意 sudo 命令
