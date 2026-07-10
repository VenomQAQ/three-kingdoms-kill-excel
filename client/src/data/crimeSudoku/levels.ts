import type { CrimeSudokuLevel, CrimeSudokuSceneCell } from '@tk/shared';

const HINT_COST = 5;
const MAX_HINTS = 3;

type RoomGrid = string[][];
type PropPair = [string, string];

function buildScene(roomsGrid: RoomGrid, propsByRoom: Record<string, PropPair[]>): CrimeSudokuSceneCell[][] {
  const counter: Record<string, number> = {};
  return roomsGrid.map((row) =>
    row.map((room) => {
      const i = counter[room] ?? 0;
      counter[room] = i + 1;
      const list = propsByRoom[room] ?? [['', '空地']];
      const pair = list[i % list.length] ?? ['', '空地'];
      return { room, prop: pair[0]!, propLabel: pair[1]! };
    }),
  );
}

function isValidSudoku(board: number[][], size: number, box: [number, number]): boolean {
  const [br, bc] = box;
  for (let r = 0; r < size; r += 1) {
    const row = new Set<number>();
    const col = new Set<number>();
    for (let c = 0; c < size; c += 1) {
      const rv = board[r]![c]!;
      const cv = board[c]![r]!;
      if (!rv || !cv || row.has(rv) || col.has(cv)) return false;
      row.add(rv);
      col.add(cv);
    }
  }
  for (let r0 = 0; r0 < size; r0 += br) {
    for (let c0 = 0; c0 < size; c0 += bc) {
      const boxSet = new Set<number>();
      for (let i = r0; i < r0 + br; i += 1) {
        for (let j = c0; j < c0 + bc; j += 1) {
          const v = board[i]![j]!;
          if (!v || boxSet.has(v)) return false;
          boxSet.add(v);
        }
      }
    }
  }
  return true;
}

function assertLevel(level: CrimeSudokuLevel): void {
  if (!isValidSudoku(level.solution, level.size, level.box)) {
    throw new Error(`[crime-sudoku] ${level.id} 标准解非法`);
  }
  for (let r = 0; r < level.size; r += 1) {
    for (let c = 0; c < level.size; c += 1) {
      const g = level.given[r]![c]!;
      if (g && g !== level.solution[r]![c]!) {
        throw new Error(`[crime-sudoku] ${level.id} given≠solution @${r},${c}`);
      }
    }
  }
  const roomId = level.victim.room;
  const nums: number[] = [];
  for (let r = 0; r < level.size; r += 1) {
    for (let c = 0; c < level.size; c += 1) {
      if (level.scene[r]![c]!.room !== roomId) continue;
      const v = level.solution[r]![c]!;
      if (v) nums.push(v);
    }
  }
  if (nums.length !== 1 || nums[0] !== level.killer) {
    throw new Error(
      `[crime-sudoku] ${level.id} 独处真凶不成立：room=${roomId} nums=[${nums}] killer=${level.killer}`,
    );
  }
}

/** 经典合法 6×6（宫 2×3） */
const SOL_6A: number[][] = [
  [1, 2, 3, 4, 5, 6],
  [4, 5, 6, 1, 2, 3],
  [2, 3, 1, 5, 6, 4],
  [5, 6, 4, 2, 3, 1],
  [3, 1, 2, 6, 4, 5],
  [6, 4, 5, 3, 1, 2],
];

/** 另一组合法 6×6 */
const SOL_6C: number[][] = [
  [6, 5, 4, 3, 2, 1],
  [3, 2, 1, 6, 5, 4],
  [5, 4, 6, 2, 1, 3],
  [2, 1, 3, 5, 4, 6],
  [4, 6, 5, 1, 3, 2],
  [1, 3, 2, 4, 6, 5],
];

/** 经典合法 9×9 */
const SOL_9: number[][] = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2],
  [6, 7, 2, 1, 9, 5, 3, 4, 8],
  [1, 9, 8, 3, 4, 2, 5, 6, 7],
  [8, 5, 9, 7, 6, 1, 4, 2, 3],
  [4, 2, 6, 8, 5, 3, 7, 9, 1],
  [7, 1, 3, 9, 2, 4, 8, 5, 6],
  [9, 6, 1, 5, 3, 7, 2, 8, 4],
  [2, 8, 7, 4, 1, 9, 6, 3, 5],
  [3, 4, 5, 2, 8, 6, 1, 7, 9],
];

/**
 * 第 1 关 · 客栈夜杀（6×6）
 * 尸房单格 @ (0,2)=3 → 真凶书生孙八（须解盘后由「同区独处」得出，不在口供/给定中剧透）
 */
const LV1: CrimeSudokuLevel = {
  id: 'lv1',
  name: '第 1 关 · 客栈夜杀',
  difficulty: '入门',
  size: 6,
  box: [2, 3],
  title: '客栈夜杀',
  story:
    '洛阳客栈夜半命案。掌柜死在尸房。把 1–6 号人物填入平面图，使每行/列/宫不重复；全部放好后，再根据「同区独处」指认真凶。',
  ruleHint: '先还原站位；全部放好后，唯一与受害者同房间独处者即凶手。',
  rooms: {
    dining: { name: '饭厅', color: '#fff8e7' },
    crime: { name: '尸房', color: '#fce4ec' },
    bedroom: { name: '客房', color: '#f3e5f5' },
    kitchen: { name: '厨房', color: '#eceff1' },
    porch: { name: '门廊', color: '#efebe9' },
    yard: { name: '前院', color: '#e3f2fd' },
    account: { name: '账房', color: '#e8f5e9' },
  },
  scene: [
    [
      { room: 'dining', prop: '🪑', propLabel: '太师椅' },
      { room: 'dining', prop: '🪵', propLabel: '长桌' },
      { room: 'crime', prop: '🛏️', propLabel: '尸榻' },
      { room: 'bedroom', prop: '🪴', propLabel: '盆景' },
      { room: 'bedroom', prop: '🛏️', propLabel: '卧榻' },
      { room: 'bedroom', prop: '🪟', propLabel: '窗边' },
    ],
    [
      { room: 'dining', prop: '🪴', propLabel: '盆景' },
      { room: 'dining', prop: '🪑', propLabel: '太师椅' },
      { room: 'dining', prop: '🪵', propLabel: '长桌' },
      { room: 'bedroom', prop: '', propLabel: '空地' },
      { room: 'bedroom', prop: '🪴', propLabel: '盆景' },
      { room: 'bedroom', prop: '🪟', propLabel: '窗边' },
    ],
    [
      { room: 'kitchen', prop: '🔥', propLabel: '灶台' },
      { room: 'kitchen', prop: '🪵', propLabel: '案板' },
      { room: 'kitchen', prop: '', propLabel: '空地' },
      { room: 'porch', prop: '🟫', propLabel: '地毯' },
      { room: 'porch', prop: '🪑', propLabel: '条凳' },
      { room: 'porch', prop: '🚪', propLabel: '大门' },
    ],
    [
      { room: 'kitchen', prop: '🪣', propLabel: '水缸' },
      { room: 'kitchen', prop: '🔥', propLabel: '灶台' },
      { room: 'kitchen', prop: '🪵', propLabel: '案板' },
      { room: 'porch', prop: '🟫', propLabel: '地毯' },
      { room: 'porch', prop: '', propLabel: '空地' },
      { room: 'porch', prop: '🟫', propLabel: '地毯' },
    ],
    [
      { room: 'account', prop: '📜', propLabel: '账册' },
      { room: 'account', prop: '🪑', propLabel: '坐席' },
      { room: 'account', prop: '', propLabel: '空地' },
      { room: 'yard', prop: '🌿', propLabel: '灌木' },
      { room: 'yard', prop: '🌿', propLabel: '灌木' },
      { room: 'yard', prop: '', propLabel: '空地' },
    ],
    [
      { room: 'account', prop: '', propLabel: '空地' },
      { room: 'account', prop: '📜', propLabel: '账册' },
      { room: 'account', prop: '💡', propLabel: '灯台' },
      { room: 'yard', prop: '🌿', propLabel: '灌木' },
      { room: 'yard', prop: '', propLabel: '空地' },
      { room: 'yard', prop: '🌿', propLabel: '灌木' },
    ],
  ],
  suspects: [
    { num: 1, name: '赵六', role: '跑堂', clue: '我在账房坐席上。' },
    { num: 2, name: '钱七', role: '镖师', clue: '我在厨房灶台边。' },
    { num: 3, name: '孙八', role: '书生', clue: '我在饭厅与客房之间。' },
    { num: 4, name: '李九', role: '商人', clue: '我在前院灌木旁。' },
    { num: 5, name: '周十', role: '游侠', clue: '我站在门廊地毯上。' },
    { num: 6, name: '吴十一', role: '捕快', clue: '我在前院空地。' },
  ],
  victim: {
    name: '掌柜王五',
    room: 'crime',
    clue: '死者倒在尸房，当时与凶手独处。',
  },
  killer: 3,
  clues: [
    '厨房「灶台」边是镖师（2）。',
    '门廊「地毯」上是游侠（5）。',
    '账房「坐席」是跑堂赵六（1）。',
    '前院「灌木」旁是商人（4）。',
    '书生在饭厅与客房之间。',
  ],
  given: [
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [2, 0, 0, 5, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 1, 0, 0, 4, 0],
    [0, 0, 0, 0, 0, 0],
  ],
  solution: SOL_6A.map((row) => row.slice()),
  rewardCoins: 15,
  maxHints: MAX_HINTS,
  hintCost: HINT_COST,
};

/**
 * 第 2 关 · 修车铺夜案（6×6）
 * 参考 Murdoku「Car Repair」
 * 工具间单格 @ (0,5)=6 → 真凶老板老冯（须解盘后由「同区独处」得出）
 */
const LV2: CrimeSudokuLevel = {
  id: 'lv2',
  name: '第 2 关 · 修车铺夜案',
  difficulty: '入门',
  size: 6,
  box: [2, 3],
  title: '修车铺夜案',
  story:
    '城南修车铺夜班。抬升机上的车还在滴油——车主已死在工具间。参考 Murdoku「Car Repair」：用车间、候客区、库房等线索还原站位，再根据「同区独处」指认真凶。',
  ruleHint: '先还原站位；全部放好后，唯一与受害者同房间独处者即凶手。',
  rooms: {
    garage: { name: '车间', color: '#eceff1' },
    wait: { name: '候客区', color: '#fff8e1' },
    reception: { name: '前台', color: '#e3f2fd' },
    storage: { name: '库房', color: '#efebe9' },
    kitchen: { name: '茶水间', color: '#e8f5e9' },
    dining: { name: '休息桌', color: '#f3e5f5' },
    crime: { name: '工具间', color: '#fce4ec' },
  },
  scene: buildScene(
    [
      ['garage', 'garage', 'garage', 'wait', 'wait', 'crime'],
      ['garage', 'garage', 'garage', 'wait', 'wait', 'wait'],
      ['reception', 'reception', 'reception', 'storage', 'storage', 'storage'],
      ['reception', 'reception', 'reception', 'storage', 'storage', 'storage'],
      ['kitchen', 'kitchen', 'kitchen', 'dining', 'dining', 'dining'],
      ['kitchen', 'kitchen', 'kitchen', 'dining', 'dining', 'dining'],
    ],
    {
      garage: [
        ['🚗', '车内'],
        ['🛢️', '油渍'],
        ['', '空地'],
        ['🔧', '工具'],
        ['🚗', '车内'],
        ['', '空地'],
      ],
      wait: [
        ['🪑', '坐椅'],
        ['', '空地'],
        ['🪴', '绿植'],
        ['🪑', '坐椅'],
        ['', '空地'],
      ],
      crime: [['🧰', '工具箱']],
      reception: [
        ['📋', '台账'],
        ['🪑', '坐席'],
        ['', '空地'],
        ['🚪', '门'],
        ['', '空地'],
        ['💡', '灯'],
      ],
      storage: [
        ['📦', '货架'],
        ['', '空地'],
        ['📦', '货架'],
        ['', '空地'],
        ['🪣', '水桶'],
        ['📦', '货架'],
      ],
      kitchen: [
        ['🔥', '灶台'],
        ['', '空地'],
        ['🪣', '水缸'],
        ['🪵', '案板'],
        ['', '空地'],
        ['🔥', '灶台'],
      ],
      dining: [
        ['🪑', '条凳'],
        ['🪵', '长桌'],
        ['', '空地'],
        ['🪴', '盆景'],
        ['🪑', '条凳'],
        ['', '空地'],
      ],
    },
  ),
  suspects: [
    { num: 1, name: '安拓', role: '学徒', clue: '我在车间车内。' },
    { num: 2, name: '布洛克', role: '技工', clue: '我踩在车间油渍上。' },
    { num: 3, name: '可心', role: '前台', clue: '我在候客区东侧空地。' },
    { num: 4, name: '黛安', role: '客属', clue: '我坐在候客区坐椅上。' },
    { num: 5, name: '艾米', role: '仓管', clue: '我在库房货架旁。' },
    { num: 6, name: '老冯', role: '老板', clue: '我在候客区以东。' },
  ],
  victim: {
    name: '车主老温',
    room: 'crime',
    clue: '死者倒在工具间，当时与凶手独处。',
  },
  killer: 6,
  clues: [
    '车间「车内」是学徒安拓（1）。',
    '车间「油渍」上是技工布洛克（2）。',
    '候客区「坐椅」是客属黛安（4）。',
    '库房「货架」旁是仓管艾米（5）。',
    '老板在候客区以东。',
  ],
  given: [
    [1, 2, 0, 4, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 5, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
  ],
  solution: SOL_6A.map((row) => row.slice()),
  rewardCoins: 20,
  maxHints: MAX_HINTS,
  hintCost: HINT_COST,
};

/**
 * 第 3 关 · 花坊晨杀（6×6）
 * 参考 Murdoku「The Flower Store」
 * 展台单格 @ (0,0)=6 → 真凶合伙人菲菲（须解盘后由「同区独处」得出）
 */
const LV3: CrimeSudokuLevel = {
  id: 'lv3',
  name: '第 3 关 · 花坊晨杀',
  difficulty: '进阶',
  size: 6,
  box: [2, 3],
  title: '花坊晨杀',
  story:
    '黎明时分的街角花坊，玫瑰与百合的香气里混着异味。店主倒在展台旁——收银机却没被动过。参考 Murdoku「The Flower Store」：用家具与区域线索还原站位，再根据「同区独处」指认真凶。',
  ruleHint: '先还原站位；全部放好后，唯一与受害者同房间独处者即凶手。',
  rooms: {
    crime: { name: '展台', color: '#fce4ec' },
    floor: { name: '店面', color: '#e8f5e9' },
    cashier: { name: '收银台', color: '#fff8e1' },
    office: { name: '账房', color: '#e3f2fd' },
    dock: { name: '卸货区', color: '#efebe9' },
    prep: { name: '理花间', color: '#f3e5f5' },
  },
  scene: buildScene(
    [
      ['crime', 'floor', 'floor', 'cashier', 'cashier', 'cashier'],
      ['floor', 'floor', 'floor', 'cashier', 'cashier', 'cashier'],
      ['office', 'office', 'office', 'dock', 'dock', 'dock'],
      ['office', 'office', 'office', 'dock', 'dock', 'dock'],
      ['prep', 'prep', 'prep', 'prep', 'prep', 'prep'],
      ['prep', 'prep', 'prep', 'prep', 'prep', 'prep'],
    ],
    {
      crime: [['💐', '花束']],
      floor: [
        ['🪴', '盆景'],
        ['🟫', '地毯'],
        ['🌸', '花束'],
        ['🪴', '盆景'],
        ['', '空地'],
      ],
      cashier: [
        ['💰', '收银'],
        ['🪑', '坐椅'],
        ['', '空地'],
        ['📋', '单据'],
        ['', '空地'],
        ['💡', '灯'],
      ],
      office: [
        ['📜', '账册'],
        ['🪑', '坐席'],
        ['', '空地'],
        ['🪟', '窗边'],
        ['', '空地'],
        ['💡', '灯'],
      ],
      dock: [
        ['📦', '货箱'],
        ['', '空地'],
        ['🚪', '后门'],
        ['📦', '货箱'],
        ['', '空地'],
        ['🪣', '水桶'],
      ],
      prep: [
        ['✂️', '剪刀'],
        ['🪵', '案台'],
        ['', '空地'],
        ['🪴', '盆景'],
        ['🪑', '坐椅'],
        ['🌸', '花材'],
        ['', '空地'],
        ['🪵', '案台'],
        ['🪴', '盆景'],
        ['', '空地'],
        ['✂️', '剪刀'],
        ['', '空地'],
      ],
    },
  ),
  suspects: [
    { num: 1, name: '阿明', role: '店员', clue: '我在理花间盆景旁。' },
    { num: 2, name: '碧安', role: '理花师', clue: '我在理花间南侧盆景旁。' },
    { num: 3, name: '可丽', role: '收银', clue: '我在收银台收银旁。' },
    { num: 4, name: '黛安', role: '会计', clue: '我在账房坐席上。' },
    { num: 5, name: '艾默', role: '卸货', clue: '我在账房靠卸货区一侧。' },
    { num: 6, name: '菲菲', role: '合伙人', clue: '我在店面西邻。' },
  ],
  victim: {
    name: '店主薇琪',
    room: 'crime',
    clue: '死者倒在展台，当时与凶手独处。',
  },
  killer: 6,
  clues: [
    '收银台「收银」旁是可丽（3）——见给定格。',
    '左列靠卸货区一侧有艾默（5）——见给定格。',
    '理花间「盆景」旁是阿明（1）——见给定格。',
    '合伙人在店面西邻。',
  ],
  given: [
    [0, 0, 0, 3, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [5, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0, 0],
  ],
  solution: SOL_6C.map((row) => row.slice()),
  rewardCoins: 25,
  maxHints: MAX_HINTS,
  hintCost: HINT_COST,
};

/**
 * 第 4 关 · 府衙签押（9×9）
 * 尸榻间单格 @ (0,4)=7 → 真凶药铺掌柜（须解盘后由「同区独处」得出）
 */
const LV4: CrimeSudokuLevel = {
  id: 'lv4',
  name: '第 4 关 · 府衙签押',
  difficulty: '进阶',
  size: 9,
  box: [3, 3],
  title: '府衙签押',
  story:
    '县令死于尸榻间。九宫平面图划分公堂、签押、牢侧、花园等区域。先还原站位，再根据「同区独处」指认真凶。',
  ruleHint: '9×9 标准数独 + 场景房间。先还原站位；全部放好后，唯一与受害者同房间独处者即凶手。',
  rooms: {
    hall: { name: '公堂', color: '#fff8e1' },
    office: { name: '签押', color: '#fce4ec' },
    crime: { name: '尸榻间', color: '#f8bbd0' },
    jail: { name: '牢侧', color: '#efebe9' },
    garden: { name: '花园', color: '#e8f5e9' },
    gate: { name: '仪门', color: '#e3f2fd' },
    side: { name: '厢房', color: '#f3e5f5' },
  },
  scene: buildScene(
    [
      ['hall', 'hall', 'hall', 'office', 'crime', 'office', 'gate', 'gate', 'gate'],
      ['hall', 'hall', 'hall', 'office', 'office', 'office', 'gate', 'gate', 'gate'],
      ['hall', 'hall', 'hall', 'office', 'office', 'office', 'gate', 'gate', 'gate'],
      ['side', 'side', 'side', 'jail', 'jail', 'jail', 'garden', 'garden', 'garden'],
      ['side', 'side', 'side', 'jail', 'jail', 'jail', 'garden', 'garden', 'garden'],
      ['side', 'side', 'side', 'jail', 'jail', 'jail', 'garden', 'garden', 'garden'],
      ['side', 'side', 'side', 'jail', 'jail', 'jail', 'garden', 'garden', 'garden'],
      ['side', 'side', 'side', 'office', 'office', 'office', 'gate', 'gate', 'gate'],
      ['side', 'side', 'side', 'office', 'office', 'office', 'gate', 'gate', 'gate'],
    ],
    {
      hall: [
        ['⚖️', '案桌'],
        ['', '空地'],
        ['🪑', '公座'],
        ['📜', '文牍'],
        ['', '空地'],
        ['🪑', '旁席'],
        ['🪟', '窗'],
        ['', '空地'],
        ['💡', '灯'],
      ],
      office: [
        ['📜', '签押'],
        ['🪑', '坐席'],
        ['🪴', '盆景'],
        ['', '空地'],
        ['🪟', '窗'],
        ['💡', '灯'],
        ['', '空地'],
        ['📜', '文牍'],
        ['🪑', '坐席'],
        ['🪴', '盆景'],
        ['', '空地'],
        ['🪟', '窗'],
      ],
      crime: [['🛏️', '尸榻']],
      gate: [
        ['🚪', '仪门'],
        ['', '空地'],
        ['🌿', '树'],
        ['🪑', '门岗'],
        ['', '空地'],
        ['🌿', '树'],
        ['', '空地'],
        ['🚪', '侧门'],
        ['', '空地'],
        ['🚪', '仪门'],
        ['', '空地'],
        ['🌿', '树'],
      ],
      side: [
        ['🛏️', '卧榻'],
        ['', '空地'],
        ['🪟', '窗边'],
        ['🪑', '坐席'],
        ['', '空地'],
        ['🪴', '盆景'],
        ['', '空地'],
        ['💡', '灯'],
        ['', '空地'],
        ['🛏️', '卧榻'],
        ['', '空地'],
        ['🪟', '窗边'],
      ],
      jail: [
        ['⛓️', '枷锁'],
        ['', '空地'],
        ['🪑', '看守'],
        ['', '空地'],
        ['⛓️', '枷锁'],
        ['', '空地'],
        ['🪟', '铁窗'],
        ['', '空地'],
        ['🪣', '水桶'],
        ['⛓️', '枷锁'],
        ['', '空地'],
        ['🪑', '看守'],
      ],
      garden: [
        ['🌿', '花木'],
        ['🪨', '石凳'],
        ['🌿', '花木'],
        ['', '空地'],
        ['🌿', '花木'],
        ['', '空地'],
        ['🪴', '盆景'],
        ['🌿', '花木'],
        ['', '空地'],
        ['🌿', '花木'],
        ['🪨', '石凳'],
        ['🌿', '花木'],
      ],
    },
  ),
  suspects: [
    { num: 1, name: '主簿', role: '文吏', clue: '我在签押房盆景旁。' },
    { num: 2, name: '捕头', role: '武职', clue: '我在仪门旁的树下。' },
    { num: 3, name: '师爷', role: '幕僚', clue: '我在公堂空地。' },
    { num: 4, name: '衙役甲', role: '差役', clue: '我在厢房坐席上。' },
    { num: 5, name: '衙役乙', role: '差役', clue: '我在公堂案桌旁。' },
    { num: 6, name: '讼棍', role: '访客', clue: '我在公堂文牍旁。' },
    { num: 7, name: '药铺掌柜', role: '访客', clue: '我在公堂与仪门之间、签押区北侧正中。' },
    { num: 8, name: '县尉', role: '武职', clue: '我在公堂灯旁。' },
    { num: 9, name: '夫人', role: '内眷', clue: '我在厢房窗边。' },
  ],
  victim: {
    name: '县令',
    room: 'crime',
    clue: '死者倒在尸榻间，当时与凶手独处。',
  },
  killer: 7,
  clues: [
    '公堂「案桌」旁是衙役乙（结合给定格与数独）。',
    '签押「盆景」旁是主簿。',
    '仪门旁的树下有捕头。',
    '厢房「窗边」是夫人。',
    '药铺掌柜在公堂与仪门之间、签押区北侧正中。',
  ],
  given: [
    [5, 3, 0, 0, 0, 0, 0, 0, 0],
    [6, 0, 0, 1, 9, 5, 0, 0, 0],
    [0, 9, 8, 0, 0, 0, 0, 6, 0],
    [8, 0, 0, 0, 6, 0, 0, 0, 3],
    [4, 0, 0, 8, 0, 3, 0, 0, 1],
    [7, 0, 0, 0, 2, 0, 0, 0, 6],
    [0, 6, 0, 0, 0, 0, 2, 8, 0],
    [0, 0, 0, 4, 1, 9, 0, 0, 5],
    [0, 0, 0, 0, 8, 0, 0, 7, 9],
  ],
  solution: SOL_9.map((row) => row.slice()),
  rewardCoins: 30,
  maxHints: MAX_HINTS,
  hintCost: HINT_COST,
};

/**
 * 第 5 关 · 海滨溺亡（6×6）
 * 参考 Murdoku「The Beach」
 * 水线单格 @ (4,3)=6 → 真凶向导法比（须解盘后由「同区独处」得出）
 */
const LV5: CrimeSudokuLevel = {
  id: 'lv5',
  name: '第 5 关 · 海滨溺亡',
  difficulty: '进阶',
  size: 6,
  box: [2, 3],
  title: '海滨溺亡',
  story:
    '阳光沙滩，遮阳伞与浴巾散落。潮水冲刷着水线旁的尸体——度假天堂成了案发现场。参考 Murdoku「The Beach」：用沙滩、浅海、瞭望塔、更衣室线索还原站位，再根据「同区独处」指认真凶。',
  ruleHint: '先还原站位；全部放好后，唯一与受害者同房间独处者即凶手。',
  rooms: {
    beach: { name: '沙滩', color: '#fff8e1' },
    sea: { name: '浅海', color: '#e3f2fd' },
    tower: { name: '瞭望塔', color: '#efebe9' },
    change: { name: '更衣室', color: '#f3e5f5' },
    crime: { name: '水线', color: '#fce4ec' },
  },
  scene: buildScene(
    [
      ['beach', 'beach', 'beach', 'sea', 'sea', 'sea'],
      ['beach', 'beach', 'beach', 'sea', 'sea', 'sea'],
      ['tower', 'tower', 'tower', 'change', 'change', 'change'],
      ['tower', 'tower', 'tower', 'change', 'change', 'change'],
      ['beach', 'beach', 'beach', 'crime', 'change', 'change'],
      ['beach', 'beach', 'beach', 'sea', 'sea', 'sea'],
    ],
    {
      beach: [
        ['🪨', '礁石'],
        ['🟫', '毯子'],
        ['', '空地'],
        ['🪑', '躺椅'],
        ['☂️', '遮阳伞'],
        ['', '空地'],
        ['🪨', '礁石'],
        ['', '空地'],
        ['🟫', '毯子'],
        ['☂️', '遮阳伞'],
        ['', '空地'],
        ['🪑', '躺椅'],
      ],
      sea: [
        ['🌊', '浪花'],
        ['', '空地'],
        ['🌊', '浪花'],
        ['', '空地'],
        ['🌊', '浪花'],
        ['', '空地'],
        ['🌊', '浪花'],
        ['', '空地'],
        ['🌊', '浪花'],
      ],
      tower: [
        ['🔭', '望远镜'],
        ['🪑', '坐椅'],
        ['', '空地'],
        ['🚪', '门'],
        ['', '空地'],
        ['💡', '灯'],
      ],
      change: [
        ['🚪', '隔间'],
        ['🪑', '坐椅'],
        ['', '空地'],
        ['🪞', '镜子'],
        ['', '空地'],
        ['🪣', '水桶'],
        ['🚪', '隔间'],
        ['', '空地'],
      ],
      crime: [['💀', '水线']],
    },
  ),
  suspects: [
    { num: 1, name: '阿什', role: '游客', clue: '我在沙滩礁石旁。' },
    { num: 2, name: '布兰', role: '游客', clue: '我躺在毯子上。' },
    { num: 3, name: '卡拉', role: '教练', clue: '我在沙滩北侧空地。' },
    { num: 4, name: '黛儿', role: '游客', clue: '我坐在沙滩躺椅上。' },
    { num: 5, name: '厄尔', role: '救生员', clue: '我在瞭望塔门边。' },
    { num: 6, name: '法比', role: '向导', clue: '我在更衣室西邻、沙滩东缘。' },
  ],
  victim: {
    name: '瓦伦',
    room: 'crime',
    clue: '死者倒在水线，当时与凶手独处。',
  },
  killer: 6,
  clues: [
    '沙滩「礁石」旁是阿什（1）。',
    '沙滩「毯子」上是布兰（2）。',
    '瞭望塔「门」边是救生员厄尔（5）。',
    '向导在更衣室西邻、沙滩东缘。',
  ],
  given: [
    [1, 2, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [5, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
  ],
  solution: SOL_6A.map((row) => row.slice()),
  rewardCoins: 25,
  maxHints: MAX_HINTS,
  hintCost: HINT_COST,
};

export const CRIME_SUDOKU_LEVELS: CrimeSudokuLevel[] = [LV1, LV2, LV3, LV4, LV5];

for (const level of CRIME_SUDOKU_LEVELS) {
  assertLevel(level);
}

export const CRIME_SUDOKU_HINT_COST = HINT_COST;
export const CRIME_SUDOKU_MAX_HINTS = MAX_HINTS;

export function getCrimeSudokuLevel(id: string): CrimeSudokuLevel | undefined {
  return CRIME_SUDOKU_LEVELS.find((level) => level.id === id);
}
