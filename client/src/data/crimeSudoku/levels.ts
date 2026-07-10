import type { CrimeSudokuLevel } from '@tk/shared';

const HINT_COST = 5;
const MAX_HINTS = 3;

function buildLv2Scene(): CrimeSudokuLevel['scene'] {
  const roomsGrid = [
    ['hall', 'hall', 'hall', 'office', 'office', 'office', 'gate', 'gate', 'gate'],
    ['hall', 'hall', 'hall', 'office', 'office', 'office', 'gate', 'gate', 'gate'],
    ['hall', 'hall', 'hall', 'office', 'office', 'office', 'gate', 'gate', 'gate'],
    ['side', 'side', 'side', 'jail', 'jail', 'jail', 'garden', 'garden', 'garden'],
    ['side', 'side', 'side', 'jail', 'jail', 'jail', 'garden', 'garden', 'garden'],
    ['side', 'side', 'side', 'jail', 'jail', 'jail', 'garden', 'garden', 'garden'],
    ['side', 'side', 'side', 'jail', 'jail', 'jail', 'garden', 'garden', 'garden'],
    ['side', 'side', 'side', 'office', 'office', 'office', 'gate', 'gate', 'gate'],
    ['side', 'side', 'side', 'office', 'office', 'office', 'gate', 'gate', 'gate'],
  ];
  const props: Record<string, Array<[string, string]>> = {
    hall: [
      ['⚖️', '案桌'], ['', '空地'], ['🪑', '公座'], ['📜', '文牍'], ['', '空地'],
      ['🪑', '旁席'], ['🪟', '窗'], ['', '空地'], ['💡', '灯'],
    ],
    office: [
      ['🛏️', '尸榻'], ['📜', '签押'], ['', '空地'], ['🪑', '坐席'], ['🪴', '盆景'],
      ['', '空地'], ['🪟', '窗'], ['💡', '灯'], ['', '空地'],
    ],
    gate: [
      ['🚪', '仪门'], ['', '空地'], ['🌿', '树'], ['🪑', '门岗'], ['', '空地'],
      ['🌿', '树'], ['', '空地'], ['🚪', '侧门'], ['', '空地'],
    ],
    side: [
      ['🛏️', '卧榻'], ['', '空地'], ['🪟', '窗边'], ['🪑', '坐席'], ['', '空地'],
      ['🪴', '盆景'], ['', '空地'], ['💡', '灯'], ['', '空地'],
    ],
    jail: [
      ['⛓️', '枷锁'], ['', '空地'], ['🪑', '看守'], ['', '空地'], ['⛓️', '枷锁'],
      ['', '空地'], ['🪟', '铁窗'], ['', '空地'], ['🪣', '水桶'],
    ],
    garden: [
      ['🌿', '花木'], ['🪨', '石凳'], ['🌿', '花木'], ['', '空地'], ['🌿', '花木'],
      ['', '空地'], ['🪴', '盆景'], ['🌿', '花木'], ['', '空地'],
    ],
  };
  const counter: Record<string, number> = {
    hall: 0, office: 0, gate: 0, side: 0, jail: 0, garden: 0,
  };
  return roomsGrid.map((row) =>
    row.map((room) => {
      const i = counter[room]!++;
      const pair = props[room]?.[i % (props[room]?.length ?? 1)] ?? ['', '空地'];
      return { room, prop: pair[0]!, propLabel: pair[1]! };
    }),
  );
}

export const CRIME_SUDOKU_LEVELS: CrimeSudokuLevel[] = [
  {
    id: 'lv1',
    name: '第 1 关 · 客栈夜杀',
    difficulty: '入门',
    size: 6,
    box: [2, 3],
    title: '客栈夜杀',
    story:
      '洛阳客栈夜半命案。盘面是当晚平面图：每格是一个站位，格子里的家具/地面即场景。把 1–6 号人物填入，使每行/列/宫不重复，并结合口供找出真凶。',
    ruleHint: '场景格：房间 + 家具。数字 = 站在该格的人。粗线 = 房间隔墙。',
    rooms: {
      dining: { name: '饭厅', color: '#fff8e7' },
      bedroom: { name: '客房', color: '#f3e5f5' },
      kitchen: { name: '厨房', color: '#eceff1' },
      porch: { name: '门廊', color: '#efebe9' },
      yard: { name: '前院', color: '#e3f2fd' },
      account: { name: '账房', color: '#e8f5e9' },
    },
    scene: [
      [
        { room: 'dining', prop: '🪑', propLabel: '太师椅' },
        { room: 'dining', prop: '🪑', propLabel: '太师椅' },
        { room: 'dining', prop: '🪵', propLabel: '长桌' },
        { room: 'bedroom', prop: '🛏️', propLabel: '卧榻' },
        { room: 'bedroom', prop: '🪴', propLabel: '盆景' },
        { room: 'bedroom', prop: '', propLabel: '空地' },
      ],
      [
        { room: 'dining', prop: '🪴', propLabel: '盆景' },
        { room: 'dining', prop: '🪵', propLabel: '长桌' },
        { room: 'dining', prop: '🪑', propLabel: '太师椅' },
        { room: 'bedroom', prop: '', propLabel: '空地' },
        { room: 'bedroom', prop: '🛏️', propLabel: '卧榻' },
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
      { num: 3, name: '孙八', role: '书生', clue: '我在饭厅长桌旁；客房内另有真凶。' },
      { num: 4, name: '李九', role: '商人', clue: '我在前院灌木旁。' },
      { num: 5, name: '周十', role: '游侠', clue: '我站在门廊地毯上。' },
      { num: 6, name: '吴十一', role: '捕快', clue: '我刚到前院空地。' },
    ],
    killer: 3,
    clues: [
      '饭厅「长桌」旁是书生（3）。',
      '厨房「灶台」边是镖师（2）。',
      '门廊「地毯」上是游侠（5）。',
      '账房「坐席」是跑堂赵六（1）。',
      '前院「灌木」旁是商人（4）。',
      '死者在客房卧榻；当时客房内另有一人即真凶（书生）。',
    ],
    given: [
      [0, 0, 3, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [2, 0, 0, 5, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 4, 0],
      [0, 0, 0, 0, 0, 0],
    ],
    solution: [
      [1, 2, 3, 4, 5, 6],
      [4, 5, 6, 1, 2, 3],
      [2, 3, 1, 5, 6, 4],
      [5, 6, 4, 2, 3, 1],
      [3, 1, 2, 6, 4, 5],
      [6, 4, 5, 3, 1, 2],
    ],
    rewardCoins: 15,
    maxHints: MAX_HINTS,
    hintCost: HINT_COST,
  },
  {
    id: 'lv2',
    name: '第 2 关 · 府衙签押',
    difficulty: '进阶',
    size: 9,
    box: [3, 3],
    title: '府衙签押',
    story: '县令死于签押房。九宫平面图划分公堂、签押、牢侧、花园等区域。先还原站位，再指认真凶。',
    ruleHint: '9×9 标准数独 + 场景房间。粗线为房间墙，不一定等于 3×3 宫线。',
    rooms: {
      hall: { name: '公堂', color: '#fff8e1' },
      office: { name: '签押', color: '#fce4ec' },
      jail: { name: '牢侧', color: '#efebe9' },
      garden: { name: '花园', color: '#e8f5e9' },
      gate: { name: '仪门', color: '#e3f2fd' },
      side: { name: '厢房', color: '#f3e5f5' },
    },
    scene: buildLv2Scene(),
    suspects: [
      { num: 1, name: '主簿', role: '文吏', clue: '我在公堂案桌旁。' },
      { num: 2, name: '捕头', role: '武职', clue: '我守在仪门。' },
      { num: 3, name: '师爷', role: '幕僚', clue: '我在签押房。' },
      { num: 4, name: '衙役甲', role: '差役', clue: '我在牢侧。' },
      { num: 5, name: '衙役乙', role: '差役', clue: '我在厢房空地。' },
      { num: 6, name: '讼棍', role: '访客', clue: '我在花园石凳。' },
      { num: 7, name: '药铺掌柜', role: '访客', clue: '死者独与我同处签押——且我是真凶。' },
      { num: 8, name: '县尉', role: '武职', clue: '我在公堂一侧。' },
      { num: 9, name: '夫人', role: '内眷', clue: '我在厢房窗边。' },
    ],
    killer: 7,
    clues: [
      '公堂「案桌」旁是主簿。',
      '仪门有捕头把守。',
      '花园「石凳」上是讼棍。',
      '厢房「窗边」是夫人。',
      '签押房内除死者外另有一人，即真凶（药铺掌柜）。',
    ],
    given: [
      [5, 3, 0, 0, 7, 0, 0, 0, 0],
      [6, 0, 0, 1, 9, 5, 0, 0, 0],
      [0, 9, 8, 0, 0, 0, 0, 6, 0],
      [8, 0, 0, 0, 6, 0, 0, 0, 3],
      [4, 0, 0, 8, 0, 3, 0, 0, 1],
      [7, 0, 0, 0, 2, 0, 0, 0, 6],
      [0, 6, 0, 0, 0, 0, 2, 8, 0],
      [0, 0, 0, 4, 1, 9, 0, 0, 5],
      [0, 0, 0, 0, 8, 0, 0, 7, 9],
    ],
    solution: [
      [5, 3, 4, 6, 7, 8, 9, 1, 2],
      [6, 7, 2, 1, 9, 5, 3, 4, 8],
      [1, 9, 8, 3, 4, 2, 5, 6, 7],
      [8, 5, 9, 7, 6, 1, 4, 2, 3],
      [4, 2, 6, 8, 5, 3, 7, 9, 1],
      [7, 1, 3, 9, 2, 4, 8, 5, 6],
      [9, 6, 1, 5, 3, 7, 2, 8, 4],
      [2, 8, 7, 4, 1, 9, 6, 3, 5],
      [3, 4, 5, 2, 8, 6, 1, 7, 9],
    ],
    rewardCoins: 30,
    maxHints: MAX_HINTS,
    hintCost: HINT_COST,
  },
];

export const CRIME_SUDOKU_HINT_COST = HINT_COST;
export const CRIME_SUDOKU_MAX_HINTS = MAX_HINTS;

export function getCrimeSudokuLevel(id: string): CrimeSudokuLevel | undefined {
  return CRIME_SUDOKU_LEVELS.find((level) => level.id === id);
}
