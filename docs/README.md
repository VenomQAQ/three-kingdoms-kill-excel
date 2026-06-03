# 三国杀 · WPS 摸鱼版 — 项目文档

> 一款伪装成 WPS Excel 网页的在线多人三国杀游戏，规则采用 **《三国杀标准版·界限突破》**（2014 年 4 月发行）。

**代码仓库**：<https://github.com/VenomQAQ/three-kingdoms-kill-excel>

## 文档索引

| 文档 | 说明 |
|------|------|
| [architecture.md](./architecture.md) | 项目架构设计、技术选型（含 NestJS 评估）、卡牌引擎设计 |
| [gameplay.md](./gameplay.md) | 身份局玩法规则、阶段流程、胜负条件 |
| [ui-disguise.md](./ui-disguise.md) | WPS Excel 伪装 UI 设计规范 |
| [development.md](./development.md) | 本地开发、API、组件与测试房说明 |
| [cards/identity.md](./cards/identity.md) | 身份牌收录（10 张） |
| [cards/characters.md](./cards/characters.md) | 武将牌收录（界限突破 30 将） |
| [cards/basic.md](./cards/basic.md) | 基本牌收录（杀/闪/桃） |
| [cards/equipment.md](./cards/equipment.md) | 装备牌收录（含木牛流马） |
| [cards/trick.md](./cards/trick.md) | 锦囊牌收录 |

## 版本说明

本项目采用的规则版本为 **《三国杀标准版·界限突破》**（2014），在 2013 标准版基础上：

- 修改 18 张武将牌技能
- 新增 3 张武将：李典、徐庶、公孙瓒
- 新增 1 张游戏牌：木牛流马（宝物）
- 新增 1 张体力牌（2/3 体力）
- 共计 **30 名武将**、**109 张游戏牌**

> 注：孙权、甄姬、诸葛亮、孙尚香等 4 名武将沿用原标准版技能，未做界限突破修改。

## 核心特性

1. **WPS Excel 伪装界面** — 标题栏、Ribbon、公式栏、网格、Sheet 标签与 WPS 表格一致
2. **房间制在线对战** — 8 位随机房间号，最多 10 人，房间列表 Sheet 实时展示
3. **模拟测试房** — 固定房间 `70755712`，支持虚拟角色与单连接多控回合演练
4. **对局战场表格** — 开局后展示用户/武将/手牌/装备/判定/操作日志等列（见 [ui-disguise.md](./ui-disguise.md)）
5. **配置化卡牌系统（规划中）** — 武将/牌面/技能 YAML 驱动，见 [architecture.md](./architecture.md)

## 实现进度（M1）

| 能力 | 状态 |
|------|------|
| NestJS + Socket.IO 房间/聊天 | ✅ |
| WPS 外壳 + 房间列表 + 战场表格 UI | ✅ |
| 测试房回合模拟（出牌/结束回合/切换角色） | ✅ |
| 完整三国杀规则引擎 | 🚧 M2 |
