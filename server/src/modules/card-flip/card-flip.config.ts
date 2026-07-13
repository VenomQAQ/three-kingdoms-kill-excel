import type { CardFlipConfig } from '@tk/shared';

/**
 * 翻牌配对 · 主题 / 难度与经济配置（经 GET /api/card-flip/config 下发）
 *
 * 顶层字段：
 * - defaultThemeId / defaultDifficultyId：未指定时的默认主题与难度
 * - themes：可选主题池；每项含 themeId、展示名 name、物品列表 items
 *   · items[].id：物品唯一标识（写入棋盘 tile.itemId）
 *   · items[].text / emoji：文字 / 图标展示（由客户端 displayMode 切换）
 *   · 主题物品数须 ≥ 所选难度的 kindCount
 * - difficulties：难度档位
 * - _v：配置协议版本
 *
 * 难度项说明：
 * - difficultyId / name：档位 id 与展示名
 * - rows / cols：棋盘行数、列数（格子总数须为偶数，配对数 = rows * cols / 2）
 * - kindCount：本局抽取的物品种类数（每种生成若干对）
 * - timeLimitSec：本局时限（秒）
 * - entryFee：入场费（金币）
 * - rewardCoins：通关奖励金币
 */
export const CARD_FLIP_CONFIG: CardFlipConfig = {
  defaultThemeId: 'animals',
  defaultDifficultyId: 'easy',
  themes: [
    // —— 动物主题（≥ hard.kindCount=25）——
    {
      themeId: 'animals',
      name: '动物',
      items: [
        { id: 'cat', text: '猫', emoji: '🐱' },
        { id: 'dog', text: '狗', emoji: '🐶' },
        { id: 'rabbit', text: '兔', emoji: '🐰' },
        { id: 'bear', text: '熊', emoji: '🐻' },
        { id: 'tiger', text: '虎', emoji: '🐯' },
        { id: 'lion', text: '狮', emoji: '🦁' },
        { id: 'elephant', text: '象', emoji: '🐘' },
        { id: 'giraffe', text: '长颈鹿', emoji: '🦒' },
        { id: 'monkey', text: '猴', emoji: '🐵' },
        { id: 'panda', text: '熊猫', emoji: '🐼' },
        { id: 'cow', text: '牛', emoji: '🐮' },
        { id: 'pig', text: '猪', emoji: '🐷' },
        { id: 'chicken', text: '鸡', emoji: '🐔' },
        { id: 'sheep', text: '羊', emoji: '🐑' },
        { id: 'dragon', text: '龙', emoji: '🐲' },
        { id: 'fox', text: '狐', emoji: '🦊' },
        { id: 'wolf', text: '狼', emoji: '🐺' },
        { id: 'horse', text: '马', emoji: '🐴' },
        { id: 'deer', text: '鹿', emoji: '🦌' },
        { id: 'frog', text: '蛙', emoji: '🐸' },
        { id: 'fish', text: '鱼', emoji: '🐟' },
        { id: 'whale', text: '鲸', emoji: '🐋' },
        { id: 'owl', text: '猫头鹰', emoji: '🦉' },
        { id: 'duck', text: '鸭', emoji: '🦆' },
        { id: 'bee', text: '蜂', emoji: '🐝' },
        { id: 'butterfly', text: '蝴蝶', emoji: '🦋' },
        { id: 'snail', text: '蜗牛', emoji: '🐌' },
        { id: 'turtle', text: '龟', emoji: '🐢' },
        { id: 'octopus', text: '章鱼', emoji: '🐙' },
        { id: 'crab', text: '蟹', emoji: '🦀' },
        { id: 'penguin', text: '企鹅', emoji: '🐧' },
        { id: 'koala', text: '考拉', emoji: '🐨' },
      ],
    },
    // —— 食物主题 ——
    {
      themeId: 'food',
      name: '食物',
      items: [
        { id: 'rice', text: '米饭', emoji: '🍚' },
        { id: 'noodles', text: '面条', emoji: '🍜' },
        { id: 'dumpling', text: '饺子', emoji: '🥟' },
        { id: 'burger', text: '汉堡', emoji: '🍔' },
        { id: 'fries', text: '薯条', emoji: '🍟' },
        { id: 'pizza', text: '披萨', emoji: '🍕' },
        { id: 'hotdog', text: '热狗', emoji: '🌭' },
        { id: 'sushi', text: '寿司', emoji: '🍣' },
        { id: 'bento', text: '便当', emoji: '🍱' },
        { id: 'cake', text: '蛋糕', emoji: '🍰' },
        { id: 'icecream', text: '冰淇淋', emoji: '🍦' },
        { id: 'hotpot', text: '火锅', emoji: '🍲' },
        { id: 'friedchicken', text: '炸鸡', emoji: '🍗' },
        { id: 'apple', text: '苹果', emoji: '🍎' },
        { id: 'banana', text: '香蕉', emoji: '🍌' },
        { id: 'grape', text: '葡萄', emoji: '🍇' },
        { id: 'watermelon', text: '西瓜', emoji: '🍉' },
        { id: 'strawberry', text: '草莓', emoji: '🍓' },
        { id: 'peach', text: '桃子', emoji: '🍑' },
        { id: 'cherry', text: '樱桃', emoji: '🍒' },
        { id: 'coffee', text: '咖啡', emoji: '☕' },
        { id: 'tea', text: '茶', emoji: '🍵' },
        { id: 'beer', text: '啤酒', emoji: '🍺' },
        { id: 'juice', text: '果汁', emoji: '🧃' },
        { id: 'cookie', text: '饼干', emoji: '🍪' },
        { id: 'donut', text: '甜甜圈', emoji: '🍩' },
        { id: 'bread', text: '面包', emoji: '🍞' },
        { id: 'egg', text: '鸡蛋', emoji: '🥚' },
        { id: 'cheese', text: '奶酪', emoji: '🧀' },
        { id: 'corn', text: '玉米', emoji: '🌽' },
        { id: 'carrot', text: '胡萝卜', emoji: '🥕' },
        { id: 'tomato', text: '番茄', emoji: '🍅' },
      ],
    },
    // —— 办公用品主题 ——
    {
      themeId: 'office',
      name: '办公用品',
      items: [
        { id: 'laptop', text: '电脑', emoji: '💻' },
        { id: 'mouse', text: '鼠标', emoji: '🖱' },
        { id: 'keyboard', text: '键盘', emoji: '⌨️' },
        { id: 'phone', text: '手机', emoji: '📱' },
        { id: 'pen', text: '钢笔', emoji: '✒️' },
        { id: 'pencil', text: '铅笔', emoji: '✏️' },
        { id: 'ruler', text: '直尺', emoji: '📏' },
        { id: 'folder', text: '文件夹', emoji: '📂' },
        { id: 'box', text: '档案盒', emoji: '📦' },
        { id: 'clip', text: '回形针', emoji: '📎' },
        { id: 'book', text: '书本', emoji: '📚' },
        { id: 'calendar', text: '日历', emoji: '🗓' },
        { id: 'clock', text: '时钟', emoji: '⏰' },
        { id: 'lamp', text: '台灯', emoji: '💡' },
        { id: 'scissors', text: '剪刀', emoji: '✂️' },
        { id: 'stapler', text: '订书机', emoji: '📎' },
        { id: 'printer', text: '打印机', emoji: '🖨' },
        { id: 'headset', text: '耳机', emoji: '🎧' },
        { id: 'camera', text: '相机', emoji: '📷' },
        { id: 'notebook', text: '笔记本', emoji: '📓' },
        { id: 'stamp', text: '印章', emoji: '🔏' },
        { id: 'key', text: '钥匙', emoji: '🔑' },
        { id: 'bag', text: '公文包', emoji: '💼' },
        { id: 'glasses', text: '眼镜', emoji: '👓' },
        { id: 'watch', text: '手表', emoji: '⌚' },
        { id: 'umbrella', text: '雨伞', emoji: '☂️' },
        { id: 'mail', text: '邮件', emoji: '✉️' },
        { id: 'chart', text: '图表', emoji: '📊' },
        { id: 'pin', text: '图钉', emoji: '📌' },
        { id: 'tape', text: '胶带', emoji: '🩹' },
        { id: 'glue', text: '胶水', emoji: '🧴' },
        { id: 'magnet', text: '磁铁', emoji: '🧲' },
      ],
    },
    // —— 表情主题 ——
    {
      themeId: 'emoji-faces',
      name: '表情',
      items: [
        { id: 'grin', text: '咧嘴', emoji: '😀' },
        { id: 'joy', text: '笑哭', emoji: '😂' },
        { id: 'halo', text: '天使', emoji: '😇' },
        { id: 'heart', text: '喜欢', emoji: '😍' },
        { id: 'kiss', text: '飞吻', emoji: '😘' },
        { id: 'think', text: '思考', emoji: '🤔' },
        { id: 'nerd', text: '学霸', emoji: '🤓' },
        { id: 'party', text: '庆祝', emoji: '🥳' },
        { id: 'cool', text: '墨镜', emoji: '😎' },
        { id: 'cold', text: '冷', emoji: '🥶' },
        { id: 'hot', text: '热', emoji: '🥵' },
        { id: 'robot', text: '机器人', emoji: '🤖' },
        { id: 'ghost', text: '幽灵', emoji: '👻' },
        { id: 'alien', text: '外星', emoji: '👽' },
        { id: 'sleepy', text: '困', emoji: '😴' },
        { id: 'angry', text: '怒', emoji: '😠' },
        { id: 'cry', text: '哭', emoji: '😢' },
        { id: 'shock', text: '惊', emoji: '😱' },
        { id: 'wink', text: '眨眼', emoji: '😉' },
        { id: 'tongue', text: '调皮', emoji: '😜' },
        { id: 'dizzy', text: '晕', emoji: '😵' },
        { id: 'sick', text: '病', emoji: '🤒' },
        { id: 'mask', text: '口罩', emoji: '😷' },
        { id: 'star', text: '星星眼', emoji: '🤩' },
        { id: 'money', text: '发财', emoji: '🤑' },
        { id: 'shush', text: '嘘', emoji: '🤫' },
        { id: 'yawn', text: '哈欠', emoji: '🥱' },
        { id: 'hug', text: '拥抱', emoji: '🤗' },
        { id: 'pray', text: '祈祷', emoji: '🙏' },
        { id: 'clap', text: '鼓掌', emoji: '👏' },
        { id: 'ok', text: 'OK', emoji: '👌' },
        { id: 'peace', text: '耶', emoji: '✌️' },
      ],
    },
  ],
  difficulties: [
    // 简单：6×6 / 8 种 / 90s / 入场 5 · 奖励 10
    {
      difficultyId: 'easy',
      name: '简单',
      rows: 6,
      cols: 6,
      kindCount: 8,
      timeLimitSec: 90,
      entryFee: 5,
      rewardCoins: 10,
    },
    // 普通：8×8 / 16 种 / 150s / 入场 5 · 奖励 20
    {
      difficultyId: 'normal',
      name: '普通',
      rows: 8,
      cols: 8,
      kindCount: 12,
      timeLimitSec: 150,
      entryFee: 5,
      rewardCoins: 20,
    },
    // 困难：10×10 / 25 种 / 210s / 入场 5 · 奖励 35
    {
      difficultyId: 'hard',
      name: '困难',
      rows: 10,
      cols: 10,
      kindCount: 16,
      timeLimitSec: 210,
      entryFee: 5,
      rewardCoins: 35,
    },
  ],
  _v: 1,
};
