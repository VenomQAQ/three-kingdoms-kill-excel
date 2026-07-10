import type { ReconCheckConfig, ReconCheckRoundPublic } from '@tk/shared';

/** 与服务端形近字组对齐的预览用字组（可 2+） */
const DEMO_GROUPS: ReadonlyArray<readonly string[]> = [
  ['戊', '戌', '戍', '戎'],
  ['己', '已', '巳'],
  ['子', '孓', '孑'],
  ['辨', '辩', '辫'],
  ['未', '末', '朱'],
  ['日', '曰', '臼'],
  ['人', '入', '八'],
  ['刀', '刃', '刁'],
  ['土', '士', '干'],
  ['天', '夭', '夫'],
  ['折', '拆', '析', '柝'],
  ['幕', '暮', '慕', '墓'],
  ['侯', '候', '喉'],
  ['晴', '睛'],
  ['茶', '荼'],
  ['余', '佘'],
  ['冷', '泠', '伶'],
  ['汩', '汨'],
  ['拔', '拨'],
  ['壁', '璧'],
  ['燥', '躁', '噪'],
  ['哀', '衷', '衰'],
  ['官', '宫', '宦'],
  ['徒', '徙', '陡'],
];

export function reconCellKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function formatReconTime(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

/** 图标模式占位：用方括号包一层，后续可换成真实图标映射 */
export function reconDisplayGlyph(ch: string, mode: 'text' | 'icon'): string {
  if (mode === 'icon') return `〔${ch}〕`;
  return ch;
}

/** 本地对比左右盘，得到差异 key（仅用于客户端交互反馈；通关仍由服务端校验） */
export function findDiffKeys(left: string[][], right: string[][]): string[] {
  const keys: string[] = [];
  const rows = Math.min(left.length, right.length);
  for (let row = 0; row < rows; row += 1) {
    const leftRow = left[row] ?? [];
    const rightRow = right[row] ?? [];
    const cols = Math.max(leftRow.length, rightRow.length);
    for (let col = 0; col < cols; col += 1) {
      if ((leftRow[col] ?? '') !== (rightRow[col] ?? '')) {
        keys.push(reconCellKey(row, col));
      }
    }
  }
  return keys;
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

/** 未开局时的演示盘面：按当前难度生成多处形近差异 */
export function buildDemoBoards(config: ReconCheckConfig | null, difficultyId: string): ReconCheckRoundPublic {
  const difficulty = config?.difficulties.find((item) => item.difficultyId === difficultyId)
    ?? config?.difficulties[0];
  const rows = difficulty?.rows ?? 6;
  const cols = difficulty?.cols ?? 5;
  const diffsWanted = Math.min(difficulty?.diffsPerRound ?? 5, rows * cols);
  const rand = mulberry32(difficultyId.length * 97 + rows * 13 + cols * 17);

  const left: string[][] = [];
  const right: string[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const leftRow: string[] = [];
    const rightRow: string[] = [];
    for (let col = 0; col < cols; col += 1) {
      const group = DEMO_GROUPS[Math.floor(rand() * DEMO_GROUPS.length)]!;
      const ch = group[Math.floor(rand() * group.length)]!;
      leftRow.push(ch);
      rightRow.push(ch);
    }
    left.push(leftRow);
    right.push(rightRow);
  }

  const indices = Array.from({ length: rows * cols }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = indices[i]!;
    indices[i] = indices[j]!;
    indices[j] = tmp;
  }
  for (let i = 0; i < diffsWanted; i += 1) {
    const idx = indices[i]!;
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    const group = DEMO_GROUPS[i % DEMO_GROUPS.length]!;
    const a = group[0]!;
    const b = group[1 + (i % Math.max(1, group.length - 1))] ?? group[group.length - 1]!;
    left[row]![col] = a;
    right[row]![col] = b === a ? (group.find((ch) => ch !== a) ?? '孓') : b;
  }
  return { left, right };
}

/** 整表列布局：左盘 | 空白分隔列 | 右盘 */
export function reconSheetLayout(sideCols: number) {
  const gapCol = sideCols;
  const rightStart = sideCols + 1;
  const dataColCount = sideCols * 2 + 1;
  return { gapCol, rightStart, dataColCount };
}

export const RECON_CHECK_RULES_HTML = `
<h4>这是什么</h4>
<p>表面是「往来账目差异核对」，其实就是<strong>找不同</strong>：左右两块账目区几乎一样，中间隔一列空白；找出字形相近但不同的格子。</p>
<h4>怎么玩</h4>
<ul>
  <li>选择难度后点击「开始核对」，消耗入场费。</li>
  <li>左侧列为系统账区域，右侧列为银行回单区域（中间隔一空白列）；点击<strong>任一侧</strong>有差异的格子即可标记。</li>
  <li>每轮有多处差异（数量随难度升高）；找齐本轮全部差异后自动进入下一轮。</li>
  <li>点到相同格算失误；失误超过 3 次或时间耗尽则失败。</li>
</ul>
<h4>难度差异</h4>
<ul>
  <li><strong>简单</strong>：单侧 6×5 · 3 轮 · <strong>每轮 3 处</strong>差异 · 120 秒 · 奖励 10 金币</li>
  <li><strong>普通</strong>：单侧 8×6 · 5 轮 · <strong>每轮 5 处</strong>差异 · 180 秒 · 奖励 16 金币</li>
  <li><strong>困难</strong>：单侧 10×7 · 7 轮 · <strong>每轮 8 处</strong>差异 · 240 秒 · 奖励 28 金币</li>
</ul>
<h4>费用</h4>
<ul>
  <li>每次开局消耗 5 金币</li>
  <li>「延长器」每次 5 金币，增加 15 秒，单局最多 3 次</li>
</ul>
<h4>提示</h4>
<p>整盘都是形近字伪装，差异更难一眼扫出。同组可有多个字，例如 <strong>戊/戌/戍/戎</strong>、<strong>己/已/巳</strong>、<strong>辨/辩/辫</strong>、<strong>幕/暮/慕/墓</strong>。</p>
`;
