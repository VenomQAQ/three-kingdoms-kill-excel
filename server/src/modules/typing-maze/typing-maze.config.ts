import type { TypingMazeConfig } from '@tk/shared';

/**
 * 打字迷宫 · 模式与经济配置（经 GET /api/typing-maze/config 下发）
 *
 * - entryFee：开局扣费（两模式均为 5）
 * - extendFee / extendSec：延长器费用与秒数
 * - pure：整表填词，按序打完；输错可重试，限时内全部打完即通关
 * - maze：迷宫路径填词，输入匹配相邻格即可前进
 */
export const TYPING_MAZE_CONFIG: TypingMazeConfig = {
  modes: [
    {
      modeId: 'maze',
      name: '打字迷宫',
      rows: 12,
      cols: 12,
      timeLimitSec: 220,
      entryFee: 5,
      rewardCoins: 22,
    },
    {
      modeId: 'pure',
      name: '纯打字',
      rows: 6,
      cols: 8,
      timeLimitSec: 90,
      entryFee: 5,
      rewardCoins: 10,
    },
  ],
  defaultModeId: 'maze',
  entryFee: 5,
  extendFee: 5,
  extendSec: 20,
  maxExtends: 3,
  _v: 1,
};

/** 中文词库（成语、文言、生僻词为主，提高输入难度） */
export const TYPING_MAZE_ZH_WORDS = [
  '青龙', '白虎', '朱雀', '玄武', '麒麟', '凤凰', '貂蝉', '吕布',
  '关羽', '张飞', '赵云', '黄忠', '马超', '诸葛亮', '曹操', '刘备',
  '孙权', '周瑜', '鲁肃', '司马懿', '魏延', '姜维', '典韦', '许褚',
  '破釜沉舟', '背水一战', '草船借箭', '空城计策', '三顾茅庐', '鞠躬尽瘁',
  '卧薪尝胆', '完璧归赵', '负荆请罪', '纸上谈兵', '围魏救赵', '暗度陈仓',
  '指鹿为马', '逐鹿中原', '问鼎中原', '鹿死谁手', '投笔从戎', '马革裹尸',
  '金戈铁马', '气吞山河', '纵横捭阖', '运筹帷幄', '决胜千里', '韬光养晦',
  '沐猴而冠', '尸位素餐', '尔虞我诈', '钩心斗角', '党同伐异', '诛心之论',
  '鳞次栉比', '熙熙攘攘', '灯红酒绿', '觥筹交错', '杯盘狼藉', '酩酊大醉',
  '脍炙人口', '汗牛充栋', '罄竹难书', '囫囵吞枣', '邯郸学步', '东施效颦',
  '买椟还珠', '掩耳盗铃', '刻舟求剑', '守株待兔', '亡羊补牢', '塞翁失马',
  '狐假虎威', '叶公好龙', '画蛇添足', '滥竽充数', '对牛弹琴', '井底之蛙',
  '饕餮盛宴', '貔貅瑞兽', '夔龙纹饰', '獬豸神兽', '睚眦必报', '混沌初开',
  '醍醐灌顶', '琥珀凝光', '琉璃瓦片', '翡翠屏风', '玛瑙手串', '珊瑚礁石',
  '氤氲雾气', '磅礴气势', '旖旎风光', '峥嵘岁月', '崔嵬山峰', '迤逦前行',
  '踌躇满志', '彷徨不定', '逡巡不前', '踟蹰片刻', '徘徊良久', '踯躅街头',
  '缄默不语', '聒噪不休', '喋喋不休', '喃喃自语', '嘶哑嗓音', '谶语成真',
  '镌刻碑文', '雕琢玉器', '镂空花窗', '砥砺前行', '淬炼成钢', '锤炼意志',
  '编纂史书', '校雠文本', '笺注典籍', '训诂文字', '考据详实', '钩沉史料',
  '阡陌交通', '桑梓情深', '闾阎百姓', '市井生活', '巷陌深深', '津渡渡口',
  '关隘险要', '要塞坚固', '社稷安危', '宗庙祭祀', '陵寝肃穆', '碑碣林立',
  '轩辕黄帝', '嫘祖养蚕', '仓颉造字', '伏羲八卦', '女娲补天', '后羿射日',
  '羯鼓催花', '羌笛悠扬', '胡笳十八', '琵琶遮面', '箜篌引曲', '笙竽齐鸣',
  '朝乾夕惕', '宵衣旰食', '夙兴夜寐', '焚膏继晷', '韦编三绝', '悬梁刺股',
  '凿壁偷光', '囊萤映雪', '程门立雪', '闻鸡起舞', '枕戈待旦', '励精图治',
  '经天纬地', '经纶满腹', '博古通今', '学富五车', '才高八斗', '出口成章',
  '字斟句酌', '惜墨如金', '力透纸背', '入木三分', '鞭辟入里', '振聋发聩',
];

/** 英文词库（长词、难拼写、非常用词为主） */
export const TYPING_MAZE_EN_WORDS = [
  'dragon', 'phoenix', 'castle', 'knight', 'shadow', 'legend', 'victory', 'wisdom',
  'responsibility', 'opportunity', 'environment', 'communication', 'organization',
  'development', 'performance', 'understanding', 'relationship', 'experience',
  'information', 'management', 'technology', 'education', 'government',
  'temperature', 'dictionary', 'restaurant', 'chocolate', 'adventure',
  'challenge', 'beautiful', 'important', 'different', 'necessary',
  'successful', 'dangerous', 'wonderful', 'excellent', 'incredible',
  'accommodate', 'acknowledge', 'acquire', 'aggressive', 'amateur',
  'apparent', 'argument', 'awkward', 'bureaucracy', 'calendar',
  'category', 'cemetery', 'changeable', 'colleague', 'committed',
  'conscience', 'conscious', 'consensus', 'controversy', 'convenience',
  'correspondence', 'criticism', 'definite', 'desperate', 'disappear',
  'discipline', 'embarrass', 'equipment', 'especially', 'exaggeration',
  'existence', 'familiar', 'fascinating', 'foreign', 'guarantee',
  'harassment', 'hierarchy', 'humorous', 'ignorance', 'immediate',
  'independent', 'indispensable', 'intelligence', 'interrupt', 'irresistible',
  'jewelry', 'knowledge', 'laboratory', 'leisure', 'liaison',
  'lightning', 'maintenance', 'maneuver', 'medieval', 'millennium',
  'miniature', 'mischievous', 'misspell', 'neighbor', 'noticeable',
  'occasion', 'occurrence', 'parallel', 'parliament', 'particular',
  'pastime', 'perceive', 'permanent', 'perseverance', 'personnel',
  'persuade', 'phenomenon', 'physically', 'playwright', 'possession',
  'preferred', 'privilege', 'procedure', 'pronunciation', 'publicly',
  'questionnaire', 'receipt', 'recommend', 'reference', 'relevant',
  'religious', 'repetition', 'rhythm', 'ridiculous', 'sacrifice',
  'schedule', 'secretary', 'separate', 'sergeant', 'siege',
  'similar', 'sincerely', 'souvenir', 'specifically', 'succeed',
  'surprise', 'suspicious', 'technical', 'temporary', 'thorough',
  'threshold', 'tomorrow', 'twelfth', 'tyranny', 'unfortunately',
  'vacuum', 'vehicle', 'vicious', 'violence', 'visible',
  'weather', 'weird', 'wherever', 'writing', 'infrastructure',
  'entrepreneur', 'procrastination', 'extraordinary', 'characterization',
  'misunderstanding', 'congratulations', 'implementation', 'recommendation',
  'representation', 'transformation', 'transportation', 'archaeology',
  'philosophy', 'psychology', 'meteorology', 'geography', 'democracy',
  'diplomacy', 'hypocrisy', 'aristocracy', 'simultaneously', 'unquestionably',
  'unprecedented', 'sophisticated', 'overwhelmingly', 'conscientious',
  'incomprehensible', 'inconceivable', 'indispensable', 'interchangeable',
];

/** 算术题占比 */
export const TYPING_MAZE_MATH_RATIO = 0.5;
