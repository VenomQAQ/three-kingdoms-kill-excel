# 三国杀 · WPS 摸鱼版

伪装成 [WPS 表格](https://www.wps.cn/) 的在线多人三国杀 Web 应用，规则目标为 **《三国杀标准版·界限突破》**（2014）。

**仓库**：<https://github.com/VenomQAQ/three-kingdoms-kill-excel>

## 功能概览

| 模块 | 状态 | 说明 |
|------|------|------|
| WPS Excel 外壳 | ✅ | 标题栏、Ribbon「开始」、公式栏、Sheet 标签、状态栏 |
| 房间列表 Sheet | ✅ | 展示等待中/游戏中房间、人数，点击房间号加入 |
| 房间 + 聊天 | ✅ | 创建/加入/准备/开局、WebSocket 实时同步 |
| 模拟测试房 | ✅ | 固定房间号 `70755712`，单连接多角色、回合模拟 |
| 对局战场表格 | ✅ | 开局后切换为 Excel 式战场（用户/武将/手牌/装备/操作区） |
| 完整卡牌引擎 | 🚧 | 见 [架构文档](./docs/architecture.md) M2 |

## 技术栈

- **前端**：React 19 + TypeScript + Vite + Zustand
- **后端**：NestJS + Socket.IO
- **共享类型**：`packages/shared`（`@tk/shared`）

## 快速开始

### 环境要求

- Node.js 18+
- npm 9+（workspace  monorepo）

### 安装与运行

```bash
git clone https://github.com/VenomQAQ/three-kingdoms-kill-excel.git
cd three-kingdoms-kill-excel
npm install

# 同时启动后端 :3000 与前端 :5173
npm run dev
```

浏览器打开 <http://localhost:5173>

### 生产构建

```bash
npm run build
# 后端 dist: server/dist
# 前端 dist: client/dist
```

## 使用说明

### 「开始」功能区

| 按钮 | 说明 |
|------|------|
| 创建房间 | 生成 8 位房间号 |
| 测试房 | 进入模拟房 `70755712` |
| 添加角色 / 模拟开局 | 仅测试房：本机添加虚拟玩家并开局 |
| 打出 / 结束回合 | 对局中出牌与回合结束 |
| 切换角色 | 测试房：同一浏览器操控不同玩家 |

### 公式栏命令

| 命令 | 说明 |
|------|------|
| `/nick 名字` | 设置昵称 |
| `/create` | 创建房间 |
| `/join 12345678` | 加入房间 |
| `/sandbox` | 进入测试房 `70755712` |
| `/ready` | 切换准备 |
| `/start` | 房主开始（测试房为模拟开局） |
| `/add 刘备` | 测试房添加虚拟角色 |
| `/as 吕布` | 测试房切换操控角色 |
| `/end` | 结束当前出牌回合 |
| 对局中直接输入牌名 | 打出该牌（需轮到自己且已切换角色） |
| 其他文字 | 房间聊天 |

### Sheet 页

| 标签 | 用途 |
|------|------|
| 房间列表 | 在线房间一览 |
| 区域销售 | 假数据（老板键伪装） |
| 2024汇总 | 进入房间后的游戏页 |

**老板键**：`Ctrl+Shift+H` 切至「区域销售」假表。

### 模拟测试房流程

1. 点击 **测试房** 或 `/sandbox`
2. 输入角色名 → **添加角色**（可添加多名虚拟玩家）
3. **模拟开局** → 界面切换为战场表格
4. 在操作条 **操控** 下拉框选择当前角色；轮到自己时点击手牌或 **结束回合**
5. A 出完牌后切换到 B 继续操作，实现单人多控测试

## 项目结构

```
├── client/          # React 前端（WPS UI、表格组件）
├── server/          # NestJS + Socket.IO
├── packages/shared/ # 前后端共享类型与常量
└── docs/            # 设计文档
```

## 文档

完整设计见 [docs/README.md](./docs/README.md)：

- [架构设计](./docs/architecture.md)
- [玩法设计](./docs/gameplay.md)
- [WPS 伪装 UI](./docs/ui-disguise.md)
- [开发说明](./docs/development.md)
- [卡牌收录](./docs/cards/)

## 免责声明

本项目仅供学习交流。三国杀为游卡桌游注册商标，请勿用于商业用途；界面风格参考 WPS 表格，不使用官方商标素材。
