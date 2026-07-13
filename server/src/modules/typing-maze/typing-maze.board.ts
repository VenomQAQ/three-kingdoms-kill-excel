import type { TypingMazeCell, TypingMazeCellKind, TypingMazeModeId, TypingMazePos } from '@tk/shared';
import {
  TYPING_MAZE_EN_WORDS,
  TYPING_MAZE_MATH_RATIO,
  TYPING_MAZE_ZH_WORDS,
} from './typing-maze.config';

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

function shuffleInPlace<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = list[i]!;
    list[i] = list[j]!;
    list[j] = tmp;
  }
  return list;
}

function makeMathCell(r: number, c: number): TypingMazeCell {
  const ops: Array<'+' | '-' | '*'> = ['+', '-', '*'];
  const op = pick(ops);
  let a = 0;
  let b = 0;
  let answer = 0;

  if (op === '+') {
    a = randInt(10, 80);
    b = randInt(10, 99);
    answer = a + b;
  } else if (op === '-') {
    a = randInt(20, 99);
    b = randInt(1, a);
    answer = a - b;
  } else {
    a = randInt(2, 25);
    b = randInt(2, 50);
    answer = a * b;
  }

  return {
    r,
    c,
    kind: 'math',
    display: `${a}${op}${b} = ？`,
    answer: String(answer),
  };
}

function pickUniqueWord(kind: TypingMazeCellKind, used: Set<string>): string {
  const pool = kind === 'zh' ? TYPING_MAZE_ZH_WORDS : TYPING_MAZE_EN_WORDS;
  const fresh = pool.filter((w) => !used.has(w.toLowerCase()));
  const source = fresh.length > 0 ? fresh : pool;
  const long = source.filter((w) => w.length >= (kind === 'zh' ? 4 : 8));
  const prefer = long.length > 0 && Math.random() < 0.7 ? long : source;
  return pick(prefer);
}

function makeWordCell(r: number, c: number, usedAnswers: Set<string>): TypingMazeCell {
  if (Math.random() < TYPING_MAZE_MATH_RATIO) {
    for (let i = 0; i < 8; i += 1) {
      const cell = makeMathCell(r, c);
      if (!usedAnswers.has(cell.answer)) {
        usedAnswers.add(cell.answer);
        return cell;
      }
    }
    const fallback = makeMathCell(r, c);
    usedAnswers.add(fallback.answer);
    return fallback;
  }
  const kind: TypingMazeCellKind = Math.random() < 0.55 ? 'zh' : 'en';
  const word = pickUniqueWord(kind, usedAnswers);
  usedAnswers.add(word.toLowerCase());
  return { r, c, kind, display: word, answer: word };
}

export interface GeneratedBoard {
  board: Array<Array<TypingMazeCell | null>>;
  start: TypingMazePos;
  end: TypingMazePos;
  pathCount: number;
}

function emptyBoard(rows: number, cols: number): Array<Array<TypingMazeCell | null>> {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

function keyOf(p: TypingMazePos): string {
  return `${p.r},${p.c}`;
}

/** 并查集 */
class UnionFind {
  private readonly parent: number[];
  private readonly rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.rank = Array.from({ length: size }, () => 0);
  }

  find(x: number): number {
    const p = this.parent[x]!;
    if (p !== x) this.parent[x] = this.find(p);
    return this.parent[x]!;
  }

  /** @returns 是否发生合并 */
  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    const rankA = this.rank[ra]!;
    const rankB = this.rank[rb]!;
    if (rankA < rankB) this.parent[ra] = rb;
    else if (rankA > rankB) this.parent[rb] = ra;
    else {
      this.parent[rb] = ra;
      this.rank[ra] = rankA + 1;
    }
    return true;
  }
}

interface MazeWall {
  /** 墙格物理坐标（打通后变为路径） */
  wall: TypingMazePos;
  /** 墙两侧房间的一维下标 */
  a: number;
  b: number;
}

interface CarvedMaze {
  path: Set<string>;
  start: TypingMazePos;
  end: TypingMazePos;
}

/**
 * Kruskal 迷宫（房间/墙格映射）：
 * - 偶数坐标为房间（各自独立集合）
 * - 相邻房间之间的奇数墙列入候选
 * - 随机打乱墙：若两侧不同集则打通并合并
 * - 直至全部房间连通（最小生成树）
 * - 再随机打通少量墙形成环，增加迷惑性
 *
 * 未打通的墙格保持为 null（前端灰数字），与现有「词格可走」模型兼容。
 */
function carveMazePathKruskal(rows: number, cols: number): CarvedMaze {
  const roomRows = Math.floor((rows + 1) / 2);
  const roomCols = Math.floor((cols + 1) / 2);
  const roomCount = roomRows * roomCols;
  const roomId = (ri: number, ci: number) => ri * roomCols + ci;
  const roomPos = (ri: number, ci: number): TypingMazePos => ({ r: ri * 2, c: ci * 2 });

  const path = new Set<string>();
  const start = roomPos(0, 0);
  const end = roomPos(roomRows - 1, roomCols - 1);

  // 所有房间先入路径
  for (let ri = 0; ri < roomRows; ri += 1) {
    for (let ci = 0; ci < roomCols; ci += 1) {
      path.add(keyOf(roomPos(ri, ci)));
    }
  }

  const walls: MazeWall[] = [];
  for (let ri = 0; ri < roomRows; ri += 1) {
    for (let ci = 0; ci < roomCols; ci += 1) {
      // 右侧墙：连接 (ri,ci) 与 (ri,ci+1)
      if (ci + 1 < roomCols) {
        walls.push({
          wall: { r: ri * 2, c: ci * 2 + 1 },
          a: roomId(ri, ci),
          b: roomId(ri, ci + 1),
        });
      }
      // 下侧墙：连接 (ri,ci) 与 (ri+1,ci)
      if (ri + 1 < roomRows) {
        walls.push({
          wall: { r: ri * 2 + 1, c: ci * 2 },
          a: roomId(ri, ci),
          b: roomId(ri + 1, ci),
        });
      }
    }
  }

  shuffleInPlace(walls);
  const uf = new UnionFind(roomCount);
  let merged = 0;
  const need = roomCount - 1;
  const leftover: MazeWall[] = [];

  for (const wall of walls) {
    if (merged >= need) {
      leftover.push(wall);
      continue;
    }
    if (uf.union(wall.a, wall.b)) {
      // 仅打通仍在棋盘内的墙格
      if (wall.wall.r < rows && wall.wall.c < cols) {
        path.add(keyOf(wall.wall));
      }
      merged += 1;
    } else {
      leftover.push(wall);
    }
  }

  // 约 6%~10% 额外打通，打破「完美树」的唯一通路，增加分叉迷惑
  const extraRatio = 0.06 + Math.random() * 0.04;
  const extraCount = Math.max(1, Math.floor(leftover.length * extraRatio));
  shuffleInPlace(leftover);
  for (let i = 0; i < extraCount && i < leftover.length; i += 1) {
    const wall = leftover[i]!;
    if (wall.wall.r < rows && wall.wall.c < cols) {
      path.add(keyOf(wall.wall));
    }
  }

  return { path, start, end };
}

export function generateBoard(modeId: TypingMazeModeId, rows: number, cols: number): GeneratedBoard {
  const board = emptyBoard(rows, cols);
  const usedAnswers = new Set<string>();

  if (modeId === 'pure') {
    const start: TypingMazePos = { r: 0, c: 0 };
    const end: TypingMazePos = { r: rows - 1, c: cols - 1 };
    let count = 0;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        board[r]![c] = makeWordCell(r, c, usedAnswers);
        count += 1;
      }
    }
    return { board, start, end, pathCount: count };
  }

  const { path, start, end } = carveMazePathKruskal(rows, cols);
  for (const cellKey of path) {
    const [rStr, cStr] = cellKey.split(',');
    const r = Number(rStr);
    const c = Number(cStr);
    if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
    board[r]![c] = makeWordCell(r, c, usedAnswers);
  }
  return { board, start, end, pathCount: path.size };
}
