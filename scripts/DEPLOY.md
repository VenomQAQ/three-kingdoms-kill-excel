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
