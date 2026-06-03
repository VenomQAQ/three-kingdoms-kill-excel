# 身份牌收录

> 标准身份局共 **10 张**身份牌。

## 一览

| 身份 | 数量 | 颜色 | 图案 | 公开时机 |
|------|------|------|------|----------|
| 主公 | 1 | 红 | 头盔 | 游戏开始即公开 |
| 忠臣 | 3 | 黄 | 花朵 | 死亡时或技能公开 |
| 反贼 | 4 | 绿 | 火焰 | 死亡时或技能公开 |
| 内奸 | 2 | 蓝 | 眼睛 | 死亡时或技能公开 |

---

## 详细说明

### 主公

- **胜利条件**：消灭所有反贼和内奸
- **特殊规则**：
  - 体力上限 +1
  - 拥有主公技（武将牌上标注【主公技】的技能）
- **失败条件**：体力归零死亡（且结算后反贼或内奸达成其胜利条件）

### 忠臣

- **胜利条件**：主公依然存活且所有反贼、内奸被消灭
- **定位**：保护主公、协助清场
- **注意**：主公误杀忠臣须弃置全部手牌和装备

### 反贼

- **胜利条件**：主公死亡
- **定位**：集火主公
- **奖励**：任何角色杀死反贼后摸 3 张牌

### 内奸

- **胜利条件**：成为最后的幸存者（官方规则：个人独胜；主公死后若仍有反贼存活则反贼胜）
- **定位**：平衡局势，隐藏身份，寻找时机

---

## 配置示例（YAML）

```yaml
# config/identities.yml
identities:
  - id: lord
    name: 主公
    count: 1
    color: red
    icon: helmet
    public: true
    winCondition: eliminate_all_traitors_and_spies

  - id: loyalist
    name: 忠臣
    count: 3
    color: yellow
    icon: flower
    public: false
    winCondition: lord_wins

  - id: rebel
    name: 反贼
    count: 4
    color: green
    icon: flame
    public: false
    winCondition: lord_dead

  - id: spy
    name: 内奸
    count: 2
    color: blue
    icon: eye
    public: false
    winCondition: last_standing
```

---

## 人数分配表

参见 [gameplay.md](../gameplay.md#2-身份分配)。
