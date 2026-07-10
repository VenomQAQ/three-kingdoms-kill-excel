/**
 * 形近字组（可 2 个及以上）：同组内任意两字可互为「错账」差异。
 * 例如 戊/戌/戍/戎 一眼极像，比固定两两配对更难扫。
 */
export const SIMILAR_CHAR_GROUPS: ReadonlyArray<readonly string[]> = [
  // —— 多字形近组 ——
  ['戊', '戌', '戍', '戎'],
  ['己', '已', '巳'],
  ['子', '孓', '孑'],
  ['辨', '辩', '辫'],
  ['未', '末', '朱'],
  ['日', '曰', '臼'],
  ['人', '入', '八'],
  ['刀', '刃', '刁'],
  ['土', '士', '干'],
  ['大', '太', '犬'],
  ['天', '夭', '夫'],
  ['免', '兔'],
  ['乌', '鸟', '岛'],
  ['鸣', '呜'],
  ['冷', '泠', '伶'],
  ['汩', '汨'],
  ['余', '佘'],
  ['折', '拆', '析', '柝'],
  ['梢', '稍', '捎'],
  ['漂', '飘', '剽'],
  ['燥', '躁', '噪'],
  ['幕', '暮', '慕', '墓'],
  ['暑', '署', '曙'],
  ['壁', '璧'],
  ['侯', '候', '喉'],
  ['博', '搏', '膊'],
  ['牛', '午'],
  ['戴', '载', '裁'],
  ['微', '徵', '徽'],
  ['瞻', '赡', '檐'],
  ['滔', '韬'],
  ['棵', '颗'],
  ['菅', '管'],
  ['籍', '藉'],
  ['赢', '嬴', '羸'],
  ['赝', '膺'],
  ['崇', '祟'],
  ['壶', '壸'],
  ['竞', '竟'],
  ['毫', '豪', '亳'],
  ['梁', '粱'],
  ['杨', '扬'],
  ['拔', '拨'],
  ['晴', '睛'],
  ['盲', '肓'],
  ['茶', '荼'],
  ['刺', '剌'],
  ['厂', '广'],
  ['住', '往'],
  ['侍', '待', '持'],
  ['哀', '衷', '衰'],
  ['官', '宫', '宦'],
  ['密', '蜜'],
  ['寇', '冠'],
  ['徒', '徙', '陡'],
  ['悔', '诲'],
  ['捐', '损'],
  ['掂', '惦', '踮'],
  ['掉', '悼'],
  ['描', '瞄'],
  ['搓', '磋', '蹉'],
  ['撤', '澈', '辙'],
  ['暖', '暧'],
  ['暗', '谙', '黯'],
  ['暴', '曝', '瀑'],
  ['束', '柬'],
  ['染', '柒'],
  ['栗', '粟'],
  ['椎', '锥', '稚'],
  ['棉', '绵', '锦'],
  ['棱', '凌', '陵'],
  ['椅', '倚'],
  ['楼', '搂', '镂'],
  ['概', '慨', '溉'],
  ['榆', '逾', '愉'],
  ['榜', '傍', '谤'],
  ['橙', '澄', '瞪'],
  ['橡', '像', '象'],
  ['檀', '擅', '颤'],
  ['欧', '殴', '鸥'],
  ['欲', '浴', '裕'],
  ['段', '锻', '缎'],
  ['殷', '殿'],
  ['杆', '竿', '秆'],
  ['材', '村', '财'],
  ['极', '级', '汲'],
  ['构', '购', '沟'],
  ['枝', '技', '肢'],
  ['枢', '驱', '躯'],
  ['枪', '抢', '呛'],
  ['枫', '风', '讽'],
  ['枯', '姑', '估'],
  ['柏', '伯', '泊'],
  ['柔', '揉', '蹂'],
  ['柜', '拒', '矩'],
  ['柠', '宁', '拧'],
  ['查', '楂', '渣'],
  ['柱', '注', '驻'],
  ['柳', '聊'],
  ['标', '瓢'],
  ['栈', '贱', '浅'],
  ['栋', '冻'],
  ['栏', '拦', '烂'],
  ['校', '较', '绞'],
  ['栓', '拴'],
  ['晴', '清', '情'],
  ['核', '刻'],
  ['椒', '菽'],
  ['欠', '吹', '炊'],
  ['款', '歉'],
  ['歇', '蝎', '揭'],
  ['殖', '植', '值'],
  ['残', '贱', '钱'],
  ['权', '欢', '观'],
  ['杜', '肚', '社'],
  ['杏', '否'],
  ['杉', '衫'],
  ['枇', '批'],
  ['枉', '旺', '汪'],
  ['枕', '耽'],
  ['林', '森', '淋'],
  ['果', '裹'],
  ['枣', '棘'],
  ['架', '驾'],
  ['柄', '炳', '病'],
  ['柑', '甘'],
  ['柚', '抽', '油'],
  ['柢', '底', '抵'],
  ['柯', '苛', '河'],
  ['柴', '紫'],
  ['柿', '沛'],
  ['栅', '册', '删'],
  ['栖', '西'],
];

export interface ReconCheckRoundInternal {
  left: string[][];
  right: string[][];
  /** `row,col` 0-based */
  diffKeys: string[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

function pickGroup(rand: () => number): readonly string[] {
  const group = SIMILAR_CHAR_GROUPS[Math.floor(rand() * SIMILAR_CHAR_GROUPS.length)]!;
  const unique = [...new Set(group)];
  return unique.length >= 2 ? unique : ['子', '孓'];
}

function pickFromGroup(group: readonly string[], rand: () => number): string {
  return group[Math.floor(rand() * group.length)]!;
}

/** 从同组抽取两个不同字，作为左右差异 */
function pickDiffPair(rand: () => number): readonly [string, string] {
  const group = pickGroup(rand);
  const a = pickFromGroup(group, rand);
  let b = pickFromGroup(group, rand);
  for (let i = 0; i < 8 && b === a; i += 1) {
    b = pickFromGroup(group, rand);
  }
  if (b === a) {
    b = group.find((ch) => ch !== a) ?? (a === '子' ? '孓' : '子');
  }
  return [a, b];
}

/** 填充也用形近字池，整盘看起来都「差不多」 */
function pickCamouflageChar(rand: () => number): string {
  return pickFromGroup(pickGroup(rand), rand);
}

export function generateReconRounds(input: {
  rows: number;
  cols: number;
  rounds: number;
  diffsPerRound: number;
  seed?: number;
}): ReconCheckRoundInternal[] {
  const rand = mulberry32(input.seed ?? Date.now());
  const totalCells = input.rows * input.cols;
  const diffs = Math.min(Math.max(1, input.diffsPerRound), totalCells);

  const result: ReconCheckRoundInternal[] = [];
  for (let r = 0; r < input.rounds; r += 1) {
    const left: string[][] = [];
    const right: string[][] = [];
    for (let row = 0; row < input.rows; row += 1) {
      const leftRow: string[] = [];
      const rightRow: string[] = [];
      for (let col = 0; col < input.cols; col += 1) {
        const ch = pickCamouflageChar(rand);
        leftRow.push(ch);
        rightRow.push(ch);
      }
      left.push(leftRow);
      right.push(rightRow);
    }

    const indices = Array.from({ length: totalCells }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = indices[i]!;
      indices[i] = indices[j]!;
      indices[j] = tmp;
    }

    const diffKeys: string[] = [];
    for (let i = 0; i < diffs; i += 1) {
      const idx = indices[i]!;
      const row = Math.floor(idx / input.cols);
      const col = idx % input.cols;
      const [a, b] = pickDiffPair(rand);
      if (rand() < 0.5) {
        left[row]![col] = a;
        right[row]![col] = b;
      } else {
        left[row]![col] = b;
        right[row]![col] = a;
      }
      diffKeys.push(cellKey(row, col));
    }
    diffKeys.sort();
    result.push({ left, right, diffKeys });
  }
  return result;
}

export function toPublicBoards(
  rounds: ReconCheckRoundInternal[],
): Array<{ left: string[][]; right: string[][] }> {
  return rounds.map((round) => ({ left: round.left, right: round.right }));
}

export function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}
