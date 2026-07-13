import type { TypingMazeCell, TypingMazePos, TypingMazeSession } from '@tk/shared';
import { COL_LABELS } from '../data/decoy';

export const TYPING_MAZE_RULES_HTML = `
  <h4>两种模式</h4>
  <ul>
    <li><b>纯打字</b>：表格每个格子预先填词，按 A1 → B1 → … 顺序打完。输入错误可重试，改对后进入下一格；限时内全部打完即可通关领奖。</li>
    <li><b>打字迷宫</b>：路径格有词，墙格为灰色数字。从起点出发，直接输入相邻路径格的内容即可前进（无需点选格子）；打错可重试，抵达终点通关。</li>
  </ul>
  <h4>格子内容</h4>
  <ul>
    <li>中文词 / 英文词：原样输入（英文不区分大小写）</li>
    <li>算术题：格子显示如 <code>20*50 = ？</code>，输入数字答案</li>
  </ul>
  <h4>经济</h4>
  <ul>
    <li>开局消耗 5 金币；通关奖励因模式而异</li>
    <li>延长器：5 金币延长 30 秒，每局最多 3 次</li>
  </ul>
`;

const DEMO_ZH = ['破釜沉舟', '运筹帷幄', '鳞次栉比', '醍醐灌顶', '鞠躬尽瘁', '韬光养晦', '觥筹交错', '砥砺前行', '朝乾夕惕', '振聋发聩'];
const DEMO_EN = ['perseverance', 'bureaucracy', 'phenomenon', 'infrastructure', 'questionnaire', 'entrepreneur', 'procrastination', 'indispensable', 'extraordinary', 'simultaneously'];

export interface TypingMazeDemoCell {
  display: string;
  isWall: boolean;
  isStart?: boolean;
  isEnd?: boolean;
}

/** 墙格展示用伪随机数字（确定性，仅视觉装饰） */
export function wallDecoyNumber(r: number, c: number): string {
  const n = ((r + 1) * 37 + (c + 1) * 91 + r * c * 13) % 900 + 100;
  return String(n);
}

function demoWord(r: number, c: number, i: number): string {
  if ((r + c + i) % 11 === 0) {
    const a = 10 + ((r * 3 + c) % 20);
    const b = 2 + ((r + c * 5) % 12);
    return `${a}*${b} = ？`;
  }
  if ((r + c) % 2 === 0) return DEMO_ZH[(r * 3 + c + i) % DEMO_ZH.length]!;
  return DEMO_EN[(r * 5 + c * 2 + i) % DEMO_EN.length]!;
}

/**
 * 非对局时的预览棋盘：迷宫模式生成与实战相近的路径+墙数字；纯打字整表填词。
 */
export function buildTypingMazeDemo(
  modeId: 'pure' | 'maze',
  rows: number,
  cols: number,
): TypingMazeDemoCell[][] {
  if (modeId === 'pure') {
    return Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({
        display: demoWord(r, c, 0),
        isWall: false,
        isStart: r === 0 && c === 0,
        isEnd: r === rows - 1 && c === cols - 1,
      })),
    );
  }

  // 确定性蜿蜒主路径 + 支路，视觉接近真实局
  const path = new Set<string>();
  const key = (r: number, c: number) => `${r},${c}`;
  let r = 0;
  let c = 0;
  path.add(key(r, c));
  let phase = 0;
  while (r < rows - 1 || c < cols - 1) {
    const goDown = phase % 4 < 2;
    if (goDown && r < rows - 1) {
      r += 1;
    } else if (c < cols - 1) {
      c += 1;
    } else if (r < rows - 1) {
      r += 1;
    } else {
      break;
    }
    path.add(key(r, c));
    // 每隔几步拐一次，并在旁侧探出短支路
    if (path.size % 3 === 0) phase += 1;
    if (path.size % 5 === 0) {
      const br = Math.min(rows - 1, r + (phase % 2 === 0 ? 0 : 1));
      const bc = Math.min(cols - 1, c + (phase % 2 === 0 ? 1 : 0));
      if (!path.has(key(br, bc)) && (br !== r || bc !== c)) path.add(key(br, bc));
      if (br + 1 < rows && phase % 3 === 0) path.add(key(br + 1, bc));
      if (bc + 1 < cols && phase % 3 === 1) path.add(key(br, bc + 1));
    }
  }
  path.add(key(rows - 1, cols - 1));

  // 额外岔路点缀
  for (let i = 0; i < Math.floor(rows * cols * 0.08); i += 1) {
    const pr = (i * 7 + 3) % rows;
    const pc = (i * 11 + 5) % cols;
    if (path.has(key(pr, pc))) {
      const nr = Math.min(rows - 1, pr + (i % 2));
      const nc = Math.min(cols - 1, pc + ((i + 1) % 2));
      path.add(key(nr, nc));
    }
  }

  let pathIndex = 0;
  return Array.from({ length: rows }, (_, rr) =>
    Array.from({ length: cols }, (_, cc) => {
      const onPath = path.has(key(rr, cc));
      if (!onPath) {
        return { display: wallDecoyNumber(rr, cc), isWall: true };
      }
      const display = demoWord(rr, cc, pathIndex);
      pathIndex += 1;
      return {
        display,
        isWall: false,
        isStart: rr === 0 && cc === 0,
        isEnd: rr === rows - 1 && cc === cols - 1,
      };
    }),
  );
}

export function formatTypingMazeTime(ms: number): string {
  const safe = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function cellRef(r: number, c: number): string {
  return `${COL_LABELS[c] ?? c}${r + 1}`;
}

export function normalizeTypingAnswer(raw: string, kind: TypingMazeCell['kind']): string {
  const trimmed = raw.trim();
  if (kind === 'en') return trimmed.toLowerCase();
  if (kind === 'math') return trimmed.replace(/\s+/g, '');
  return trimmed;
}

export function checkTypingAnswer(input: string, cell: TypingMazeCell): boolean {
  const expected =
    cell.kind === 'en' ? cell.answer.toLowerCase() : cell.kind === 'math' ? cell.answer.trim() : cell.answer;
  return normalizeTypingAnswer(input, cell.kind) === expected;
}

export function isAdjacent(a: TypingMazePos, b: TypingMazePos): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

export function getPureOrder(session: TypingMazeSession): TypingMazePos[] {
  const order: TypingMazePos[] = [];
  for (let r = 0; r < session.rows; r += 1) {
    for (let c = 0; c < session.cols; c += 1) {
      if (session.board[r]?.[c]) order.push({ r, c });
    }
  }
  return order;
}

export function getCell(session: TypingMazeSession, pos: TypingMazePos): TypingMazeCell | null {
  return session.board[pos.r]?.[pos.c] ?? null;
}

/** 迷宫：当前位置的四邻中属于路径的格子 */
export function getMazeNeighbors(session: TypingMazeSession, pos: TypingMazePos): TypingMazePos[] {
  const dirs: TypingMazePos[] = [
    { r: pos.r - 1, c: pos.c },
    { r: pos.r + 1, c: pos.c },
    { r: pos.r, c: pos.c - 1 },
    { r: pos.r, c: pos.c + 1 },
  ];
  return dirs.filter((p) => {
    if (p.r < 0 || p.c < 0 || p.r >= session.rows || p.c >= session.cols) return false;
    return Boolean(session.board[p.r]?.[p.c]);
  });
}

/** 根据输入匹配相邻路径格；优先未走过的格子 */
export function matchMazeNeighborByInput(
  session: TypingMazeSession,
  cursor: TypingMazePos,
  input: string,
  cleared: Set<string>,
): TypingMazePos | null {
  const neighbors = getMazeNeighbors(session, cursor);
  const hits = neighbors.filter((pos) => {
    const cell = getCell(session, pos);
    return cell ? checkTypingAnswer(input, cell) : false;
  });
  if (hits.length === 0) return null;
  const uncleared = hits.find((pos) => !cleared.has(`${pos.r},${pos.c}`));
  return uncleared ?? hits[0] ?? null;
}
