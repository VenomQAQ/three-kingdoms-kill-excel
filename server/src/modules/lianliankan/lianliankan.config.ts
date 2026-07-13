import type { LianliankanConfig } from '@tk/shared';

/**
 * 连连看 · 主题 / 难度与经济配置（经 GET /api/lianliankan/config 下发）
 *
 * 顶层字段：
 * - defaultThemeId / defaultDifficultyId：未指定时的默认主题与难度
 * - themes：可选主题池；每项含 themeId、展示名 name、物品列表 items、相似组 similarGroups
 *   · items[].id：物品唯一标识（写入棋盘 tile.itemId）
 *   · items[].text / emoji：文字 / 图标展示（由客户端 displayMode 切换）
 *   · items[].emojiWin：可选；Windows 上与 Mac 字形差异过大时的替代图标
 *   · items[].similarGroup：可选；归属的相似组 id，用于局内「相似干扰」抽样
 *   · similarGroups：相似组定义（groupId + itemIds）；与 items[].similarGroup 对应
 *   · 主题物品数须 ≥ 所选难度的 kindCount（extreme 除外，改用 similarPools）
 * - similarPools：极难跨主题相似池；开局随机选一池，只抽池内物品
 * - extraItems：仅挂在相似池的补充物品；emoji 须互不相同，图标模式要能分辨
 * - difficulties：难度档位
 * - refreshFee：局内刷新棋盘费用（金币）；一局仅一次
 * - _v：配置协议版本
 *
 * 难度项说明：
 * - difficultyId / name：档位 id 与展示名
 * - rows / cols：棋盘行数、列数（格子总数须为偶数，配对数 = rows * cols / 2）
 * - kindCount：本局抽取的物品种类数（每种生成若干对）
 * - timeLimitSec：本局时限（秒）
 * - entryFee：入场费（金币）
 * - rewardCoins：通关奖励金币
 * - similarGroupWeight：0~1；从相似组抽样的权重（越高同组易混物品越多）
 *   · extreme 固定为 1，且忽略主题，改用 similarPools
 *
 * Win / Mac 图标：
 * - 相似池只收录两平台字形仍「同色系/同外形」且彼此可区分的码点；禁止多个物品共用同一 emoji
 * - 人脸类等平台差异大的不进极难池；若某物品在 Win 上破坏组内相似性，配置 emojiWin
 */
export const LIANLIANKAN_CONFIG: LianliankanConfig = {
  defaultThemeId: 'fruits',
  defaultDifficultyId: 'easy',
  themes: [
    // —— 果蔬 ——
    {
      themeId: 'fruits',
      name: '果蔬',
      items: [
        { id: 'apple', text: '苹果', emoji: '🍎', similarGroup: 'red' },
        { id: 'cherry', text: '樱桃', emoji: '🍒', similarGroup: 'red' },
        { id: 'strawberry', text: '草莓', emoji: '🍓', similarGroup: 'red' },
        { id: 'banana', text: '香蕉', emoji: '🍌', similarGroup: 'yellow' },
        { id: 'lemon', text: '柠檬', emoji: '🍋', similarGroup: 'yellow' },
        { id: 'corn', text: '玉米', emoji: '🌽', similarGroup: 'yellow' },
        { id: 'pear', text: '梨子', emoji: '🍐', similarGroup: 'green' },
        { id: 'kiwi', text: '猕猴桃', emoji: '🥝', similarGroup: 'green' },
        { id: 'grape', text: '葡萄', emoji: '🍇', similarGroup: 'purple' },
        { id: 'eggplant', text: '茄子', emoji: '🍆', similarGroup: 'purple' },
        { id: 'peach', text: '桃子', emoji: '🍑' },
        { id: 'watermelon', text: '西瓜', emoji: '🍉' },
      ],
      // 相似组：同色系果蔬，用于干扰抽样
      similarGroups: [
        { groupId: 'red', itemIds: ['apple', 'cherry', 'strawberry'] },
        { groupId: 'yellow', itemIds: ['banana', 'lemon', 'corn'] },
        { groupId: 'green', itemIds: ['pear', 'kiwi'] },
        { groupId: 'purple', itemIds: ['grape', 'eggplant'] },
      ],
    },
    // —— 三国武将（按势力分组）——
    {
      themeId: 'generals',
      name: '三国武将',
      items: [
        { id: 'liubei', text: '刘备', emoji: '仁', similarGroup: 'shu' },
        { id: 'guanyu', text: '关羽', emoji: '义', similarGroup: 'shu' },
        { id: 'zhangfei', text: '张飞', emoji: '勇', similarGroup: 'shu' },
        { id: 'caocao', text: '曹操', emoji: '魏', similarGroup: 'wei' },
        { id: 'xiahoudun', text: '夏侯惇', emoji: '刚', similarGroup: 'wei' },
        { id: 'zhangliao', text: '张辽', emoji: '突', similarGroup: 'wei' },
        { id: 'sunquan', text: '孙权', emoji: '吴', similarGroup: 'wu' },
        { id: 'zhouyu', text: '周瑜', emoji: '火', similarGroup: 'wu' },
        { id: 'luxun', text: '陆逊', emoji: '连', similarGroup: 'wu' },
        { id: 'lvbu', text: '吕布', emoji: '猛', similarGroup: 'qun' },
        { id: 'diaochan', text: '貂蝉', emoji: '离', similarGroup: 'qun' },
        { id: 'huatuo', text: '华佗', emoji: '医', similarGroup: 'qun' },
      ],
      similarGroups: [
        { groupId: 'shu', itemIds: ['liubei', 'guanyu', 'zhangfei'] },
        { groupId: 'wei', itemIds: ['caocao', 'xiahoudun', 'zhangliao'] },
        { groupId: 'wu', itemIds: ['sunquan', 'zhouyu', 'luxun'] },
        { groupId: 'qun', itemIds: ['lvbu', 'diaochan', 'huatuo'] },
      ],
    },
    // —— 办公用品 ——
    {
      themeId: 'office',
      name: '办公用品',
      items: [
        { id: 'sheet', text: '电脑', emoji: '💻', similarGroup: 'file' },
        { id: 'doc', text: '鼠标', emoji: '🖱', similarGroup: 'file' },
        { id: 'slide', text: '键盘', emoji: '⌨️', similarGroup: 'file' },
        { id: 'pen', text: '钢笔', emoji: '✒️', similarGroup: 'tool' },
        { id: 'pencil', text: '铅笔', emoji: '✏️', similarGroup: 'tool' },
        { id: 'ruler', text: '直尺', emoji: '📏', similarGroup: 'tool' },
        { id: 'folder', text: '文件夹', emoji: '📂', similarGroup: 'storage' },
        { id: 'box', text: '档案盒', emoji: '📦', similarGroup: 'storage' },
        { id: 'clip', text: '回形针', emoji: '📎', similarGroup: 'small' },
        { id: 'staple', text: '书本', emoji: '📚', similarGroup: 'small' },
        { id: 'calendar', text: '日历', emoji: '🗓' },
        { id: 'phone', text: '手机', emoji: '📱' },
      ],
      similarGroups: [
        { groupId: 'file', itemIds: ['sheet', 'doc', 'slide'] },
        { groupId: 'tool', itemIds: ['pen', 'pencil', 'ruler'] },
        { groupId: 'storage', itemIds: ['folder', 'box'] },
        { groupId: 'small', itemIds: ['clip', 'staple'] },
      ],
    },
    // —— 颜文字（纯文本，Win/Mac 无字形差）——
    {
      themeId: 'kaomoji',
      name: '颜文字',
      items: [
        { id: 'smile', text: '开心', emoji: '(^_^)', similarGroup: 'happy' },
        { id: 'laugh', text: '大笑', emoji: '(≧▽≦)', similarGroup: 'happy' },
        { id: 'wink', text: '眨眼', emoji: '(^_~)', similarGroup: 'happy' },
        { id: 'sad', text: '难过', emoji: '(T_T)', similarGroup: 'sad' },
        { id: 'cry', text: '哭泣', emoji: '(；д；)', similarGroup: 'sad' },
        { id: 'shock', text: '震惊', emoji: '(⊙_⊙)', similarGroup: 'wow' },
        { id: 'blank', text: '呆住', emoji: '(・_・)', similarGroup: 'wow' },
        { id: 'table', text: '掀桌', emoji: '(╯°□°）╯', similarGroup: 'action' },
        { id: 'shrug', text: '摊手', emoji: '¯\\_(ツ)_/¯', similarGroup: 'action' },
        { id: 'spark', text: '闪亮', emoji: '✧٩(ˊωˋ*)و✧' },
        { id: 'sleep', text: '睡觉', emoji: '(-_-)zzz' },
        { id: 'run', text: '冲刺', emoji: 'ε=ε=┌(;￣◇￣)┘' },
        { id: 'hide', text: '躲藏', emoji: '|ω・）' },
        { id: 'angry', text: '生气', emoji: '(｀へ´)' },
      ],
      similarGroups: [
        { groupId: 'happy', itemIds: ['smile', 'laugh', 'wink'] },
        { groupId: 'sad', itemIds: ['sad', 'cry'] },
        { groupId: 'wow', itemIds: ['shock', 'blank'] },
        { groupId: 'action', itemIds: ['table', 'shrug'] },
      ],
    },
    // —— Emoji 表情（人脸类 Win/Mac 差异大，不进极难池）——
    {
      themeId: 'emoji-faces',
      name: 'Emoji表情',
      items: [
        { id: 'grin', text: '咧嘴', emoji: '😀', similarGroup: 'smile' },
        { id: 'joy', text: '笑哭', emoji: '😂', similarGroup: 'smile' },
        { id: 'halo', text: '天使', emoji: '😇', similarGroup: 'smile' },
        { id: 'heart', text: '喜欢', emoji: '😍', similarGroup: 'love' },
        { id: 'kiss', text: '飞吻', emoji: '😘', similarGroup: 'love' },
        { id: 'think', text: '思考', emoji: '🤔', similarGroup: 'mind' },
        { id: 'nerd', text: '学霸', emoji: '🤓', similarGroup: 'mind' },
        { id: 'party', text: '庆祝', emoji: '🥳', similarGroup: 'event' },
        { id: 'cool', text: '墨镜', emoji: '😎', similarGroup: 'style' },
        { id: 'cold', text: '冷', emoji: '🥶', similarGroup: 'weather' },
        { id: 'hot', text: '热', emoji: '🥵', similarGroup: 'weather' },
        { id: 'robot', text: '机器人', emoji: '🤖' },
        { id: 'ghost', text: '幽灵', emoji: '👻' },
        { id: 'alien', text: '外星', emoji: '👽' },
      ],
      similarGroups: [
        { groupId: 'smile', itemIds: ['grin', 'joy', 'halo'] },
        { groupId: 'love', itemIds: ['heart', 'kiss'] },
        { groupId: 'mind', itemIds: ['think', 'nerd'] },
        { groupId: 'weather', itemIds: ['cold', 'hot'] },
      ],
    },
    // —— 动物 ——
    {
      themeId: 'animals',
      name: '动物',
      items: [
        { id: 'cat', text: '猫', emoji: '🐱', similarGroup: 'pet' },
        { id: 'dog', text: '狗', emoji: '🐶', similarGroup: 'pet' },
        { id: 'rabbit', text: '兔', emoji: '🐰', similarGroup: 'pet' },
        { id: 'bear', text: '熊', emoji: '🐻', similarGroup: 'wild' },
        { id: 'tiger', text: '虎', emoji: '🐯', similarGroup: 'wild' },
        { id: 'lion', text: '狮', emoji: '🦁', similarGroup: 'wild' },
        { id: 'elephant', text: '象', emoji: '🐘', similarGroup: 'large' },
        { id: 'giraffe', text: '长颈鹿', emoji: '🦒', similarGroup: 'large' },
        { id: 'monkey', text: '猴', emoji: '🐵', similarGroup: 'playful' },
        { id: 'panda', text: '熊猫', emoji: '🐼', similarGroup: 'playful' },
        { id: 'cow', text: '牛', emoji: '🐮', similarGroup: 'farm' },
        { id: 'pig', text: '猪', emoji: '🐷', similarGroup: 'farm' },
        { id: 'chicken', text: '鸡', emoji: '🐔', similarGroup: 'farm' },
        { id: 'sheep', text: '羊', emoji: '🐑', similarGroup: 'farm' },
        { id: 'dragon', text: '龙', emoji: '🐲', similarGroup: 'mythical' },
        { id: 'phoenix', text: '凤凰', emoji: '🦅', similarGroup: 'mythical' },
        { id: 'unicorn', text: '独角兽', emoji: '🦄', similarGroup: 'mythical' },
        { id: 'mermaid', text: '美人鱼', emoji: '🧜‍♀️', similarGroup: 'mythical' },
      ],
      similarGroups: [
        { groupId: 'pet', itemIds: ['cat', 'dog', 'rabbit'] },
        { groupId: 'wild', itemIds: ['bear', 'tiger', 'lion'] },
        { groupId: 'large', itemIds: ['elephant', 'giraffe'] },
        { groupId: 'farm', itemIds: ['cow', 'pig', 'chicken'] },
        { groupId: 'mythical', itemIds: ['dragon'] },
      ],
    },
    // —— 职业 ——
    {
      themeId: 'characters',
      name: '职业',
      items: [
        { id: 'student', text: '学生', emoji: '🧑‍🎓', similarGroup: 'school' },
        { id: 'teacher', text: '老师', emoji: '🧑‍🏫', similarGroup: 'school' },
        { id: 'doctor', text: '医生', emoji: '🧑‍⚕️', similarGroup: 'service' },
        { id: 'nurse', text: '护士', emoji: '👩‍⚕️', similarGroup: 'service' },
        { id: 'police', text: '警察', emoji: '👮', similarGroup: 'guard' },
        { id: 'firefighter', text: '消防员', emoji: '👨‍🚒', similarGroup: 'guard' },
        { id: 'chef', text: '厨师', emoji: '👨‍🍳', similarGroup: 'work' },
        { id: 'farmer', text: '农民', emoji: '👨‍🌾', similarGroup: 'work' },
        { id: 'artist', text: '画家', emoji: '👨‍🎨', similarGroup: 'creative' },
        { id: 'singer', text: '歌手', emoji: '🧑‍🎤', similarGroup: 'creative' },
        { id: 'astronaut', text: '宇航员', emoji: '🧑‍🚀', similarGroup: 'hero' },
        { id: 'athlete', text: '球员', emoji: '🏃', similarGroup: 'hero' },
        { id: 'wizard', text: '法师', emoji: '🧙' },
        { id: 'fairy', text: '仙女', emoji: '🧚' },
      ],
      similarGroups: [
        { groupId: 'school', itemIds: ['student', 'teacher'] },
        { groupId: 'service', itemIds: ['doctor', 'nurse'] },
        { groupId: 'guard', itemIds: ['police', 'firefighter'] },
        { groupId: 'work', itemIds: ['chef', 'farmer'] },
      ],
    },
    // —— 物品 ——
    {
      themeId: 'objects',
      name: '物品',
      items: [
        { id: 'phone', text: '手机', emoji: '📱', similarGroup: 'digital' },
        { id: 'laptop', text: '电脑', emoji: '💻', similarGroup: 'digital' },
        { id: 'camera', text: '相机', emoji: '📷', similarGroup: 'digital' },
        { id: 'key', text: '钥匙', emoji: '🔑', similarGroup: 'daily' },
        { id: 'umbrella', text: '雨伞', emoji: '☂️', similarGroup: 'daily' },
        { id: 'glasses', text: '眼镜', emoji: '👓', similarGroup: 'daily' },
        { id: 'watch', text: '手表', emoji: '⌚', similarGroup: 'wear' },
        { id: 'bag', text: '背包', emoji: '🎒', similarGroup: 'wear' },
        { id: 'book', text: '书本', emoji: '📚', similarGroup: 'study' },
        { id: 'bulb', text: '灯泡', emoji: '💡', similarGroup: 'study' },
        { id: 'scissors', text: '剪刀', emoji: '✂️', similarGroup: 'tool' },
        { id: 'hammer', text: '锤子', emoji: '🔨', similarGroup: 'tool' },
        { id: 'gift', text: '礼物', emoji: '🎁' },
        { id: 'balloon', text: '气球', emoji: '🎈' },
      ],
      similarGroups: [
        { groupId: 'digital', itemIds: ['phone', 'laptop', 'camera'] },
        { groupId: 'daily', itemIds: ['key', 'umbrella', 'glasses'] },
        { groupId: 'wear', itemIds: ['watch', 'bag'] },
        { groupId: 'tool', itemIds: ['scissors', 'hammer'] },
      ],
    },
    // —— 食物 ——
    {
      themeId: 'food',
      name: '食物',
      items: [
        { id: 'rice', text: '米饭', emoji: '🍚', similarGroup: 'staple' },
        { id: 'noodles', text: '面条', emoji: '🍜', similarGroup: 'staple' },
        { id: 'dumpling', text: '饺子', emoji: '🥟', similarGroup: 'staple' },
        { id: 'beer', text: '啤酒', emoji: '🍺', similarGroup: 'staple' },
        { id: 'burger', text: '汉堡', emoji: '🍔', similarGroup: 'fast' },
        { id: 'fries', text: '薯条', emoji: '🍟', similarGroup: 'fast' },
        { id: 'pizza', text: '披萨', emoji: '🍕', similarGroup: 'western' },
        { id: 'hotdog', text: '热狗', emoji: '🌭', similarGroup: 'western' },
        { id: 'sushi', text: '寿司', emoji: '🍣', similarGroup: 'japanese' },
        { id: 'bento', text: '便当', emoji: '🍱', similarGroup: 'japanese' },
        { id: 'cake', text: '蛋糕', emoji: '🍰', similarGroup: 'dessert' },
        { id: 'icecream', text: '冰淇淋', emoji: '🍦', similarGroup: 'dessert' },
        { id: 'hotpot', text: '火锅', emoji: '🍲' },
        { id: 'friedchicken', text: '炸鸡', emoji: '🍗' },
      ],
      similarGroups: [
        { groupId: 'staple', itemIds: ['rice', 'noodles', 'dumpling'] },
        { groupId: 'fast', itemIds: ['burger', 'fries'] },
        { groupId: 'western', itemIds: ['pizza', 'hotdog'] },
        { groupId: 'dessert', itemIds: ['cake', 'icecream'] },
      ],
    },
    // —— 蔬菜 ——
    {
      themeId: 'vegetables',
      name: '蔬菜',
      items: [
        // 绿叶/绿色系：图标须可区分，只保持色系相近
        { id: 'cabbage', text: '白菜', emoji: '🥬', similarGroup: 'leafy' },
        { id: 'lettuce', text: '生菜', emoji: '🥗', similarGroup: 'leafy' },
        { id: 'spinach', text: '菠菜', emoji: '🌿', similarGroup: 'leafy' },
        { id: 'carrot', text: '胡萝卜', emoji: '🥕', similarGroup: 'root' },
        { id: 'potato', text: '土豆', emoji: '🥔', similarGroup: 'root' },
        { id: 'onion', text: '洋葱', emoji: '🧅', similarGroup: 'root' },
        { id: 'broccoli', text: '西兰花', emoji: '🥦', similarGroup: 'green' },
        { id: 'cucumber', text: '黄瓜', emoji: '🥒', similarGroup: 'green' },
        { id: 'pepper', text: '辣椒', emoji: '🌶️', similarGroup: 'spicy' },
        { id: 'garlic', text: '大蒜', emoji: '🧄', similarGroup: 'spicy' },
        { id: 'mushroom', text: '蘑菇', emoji: '🍄', similarGroup: 'fungi' },
        { id: 'cornveg', text: '玉米', emoji: '🌽', similarGroup: 'fungi' },
        { id: 'tomato', text: '番茄', emoji: '🍅' },
        { id: 'eggplantveg', text: '茄子', emoji: '🍆' },
      ],
      similarGroups: [
        { groupId: 'leafy', itemIds: ['cabbage', 'lettuce', 'spinach'] },
        { groupId: 'root', itemIds: ['carrot', 'potato', 'onion'] },
        { groupId: 'green', itemIds: ['broccoli', 'cucumber'] },
        { groupId: 'spicy', itemIds: ['pepper', 'garlic'] },
      ],
    },
  ],
  // 极难补充物：外形/色系相近，但 emoji 必须互不相同（图标模式要能分辨）
  extraItems: [
    { id: 'avocado', text: '牛油果', emoji: '🥑' },
    { id: 'melon', text: '甜瓜', emoji: '🍈' },
    { id: 'greenapple', text: '青苹果', emoji: '🍏' },
    { id: 'seedling', text: '豆芽', emoji: '🌱' },
    // 红色系补充（跨品类，只求色相近且图标可区分）
    { id: 'rose', text: '玫瑰', emoji: '🌹' },
    { id: 'hibiscus', text: '芙蓉', emoji: '🌺' },
    { id: 'maple', text: '枫叶', emoji: '🍁' },
    { id: 'ladybug', text: '瓢虫', emoji: '🐞' },
    { id: 'lobster', text: '龙虾', emoji: '🦞' },
    { id: 'crab', text: '螃蟹', emoji: '🦀' },
    { id: 'redcircle', text: '红点', emoji: '🔴' },
    { id: 'fire', text: '火焰', emoji: '🔥' },
    // 黄色系补充
    { id: 'mango', text: '芒果', emoji: '🥭' },
    { id: 'cheese', text: '奶酪', emoji: '🧀' },
    { id: 'honey', text: '蜂蜜', emoji: '🍯' },
    { id: 'sunflower', text: '向日葵', emoji: '🌻' },
    { id: 'chick', text: '小鸡', emoji: '🐤' },
    { id: 'star', text: '星星', emoji: '⭐' },
    { id: 'bell', text: '铃铛', emoji: '🔔' },
    { id: 'yellowcircle', text: '黄点', emoji: '🟡' },
    { id: 'croissant', text: '可颂', emoji: '🥐' },
    { id: 'pancake', text: '松饼', emoji: '🥞' },
  ],
  // 跨主题相似池（极难专用）；池内同色系/同外形，且图标两两不同
  similarPools: [
    {
      poolId: 'red-produce',
      name: '红色系',
      itemIds: [
        'apple', 'cherry', 'strawberry', 'peach', 'tomato', 'watermelon', 'pepper',
        'rose', 'hibiscus', 'maple', 'ladybug', 'lobster', 'crab', 'redcircle', 'fire', 'mushroom',
      ],
    },
    {
      poolId: 'yellow-produce',
      name: '黄色系',
      itemIds: [
        'banana', 'lemon', 'corn', 'onion', 'potato', 'melon', 'carrot',
        'mango', 'cheese', 'honey', 'sunflower', 'chick', 'star', 'bell', 'yellowcircle', 'croissant', 'pancake', 'fries', 'beer',
      ],
    },
    {
      poolId: 'green-produce',
      name: '绿色蔬果',
      itemIds: ['cabbage', 'lettuce', 'spinach', 'broccoli', 'cucumber', 'pear', 'kiwi', 'avocado', 'greenapple', 'seedling'],
    },
    {
      poolId: 'kaomoji-happy',
      name: '开心颜文字',
      itemIds: ['smile', 'laugh', 'wink', 'spark', 'hide', 'blank', 'shock', 'shrug'],
    },
    {
      poolId: 'kaomoji-sad',
      name: '难过颜文字',
      itemIds: ['sad', 'cry', 'angry', 'sleep', 'table', 'run', 'blank', 'shock'],
    },
    {
      poolId: 'desk-tools',
      name: '桌面文具',
      itemIds: ['pen', 'pencil', 'ruler', 'clip', 'scissors', 'hammer', 'folder', 'bulb'],
    },
    {
      poolId: 'gadgets',
      name: '数码设备',
      itemIds: ['phone', 'laptop', 'camera', 'doc', 'slide', 'watch'],
    },
    {
      poolId: 'fast-food',
      name: '快餐拼盘',
      itemIds: ['burger', 'fries', 'pizza', 'hotdog', 'friedchicken', 'noodles', 'dumpling', 'sushi'],
    },
  ],
  difficulties: [
    // 简单：8×8 / 12 种 / 210s / 入场 5 · 奖励 10 · 相似权重 0.16
    { difficultyId: 'easy', name: '简单', rows: 8, cols: 8, kindCount: 12, timeLimitSec: 210, entryFee: 5, rewardCoins: 10, similarGroupWeight: 0.16 },
    // 普通：10×10 / 20 种 / 180s / 入场 5 · 奖励 15 · 相似权重 0.45
    { difficultyId: 'normal', name: '普通', rows: 10, cols: 10, kindCount: 20, timeLimitSec: 180, entryFee: 5, rewardCoins: 15, similarGroupWeight: 0.45 },
    // 困难：12×12 / 30 种 / 190s / 入场 5 · 奖励 24 · 相似权重 0.62
    { difficultyId: 'hard', name: '困难', rows: 12, cols: 12, kindCount: 30, timeLimitSec: 190, entryFee: 5, rewardCoins: 24, similarGroupWeight: 0.62 },
    // 极难：12×12 / 10 种 / 160s / 入场 5 · 奖励 35 · 权重 1（跨主题相似池，只抽同池）
    { difficultyId: 'extreme', name: '极难', rows: 12, cols: 12, kindCount: 10, timeLimitSec: 190, entryFee: 5, rewardCoins: 35, similarGroupWeight: 1 },
  ],
  // 局内刷新棋盘费用（金币）；一局仅一次
  refreshFee: 5,
  _v: 1,
};
