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

function pickUniqueWord(
  kind: TypingMazeCellKind,
  used: Set<string>,
): string {
  const pool = kind === 'zh' ? TYPING_MAZE_ZH_WORDS : TYPING_MAZE_EN_WORDS;
  const fresh = pool.filter((w) => !used.has(w.toLowerCase()));
  const source = fresh.length > 0 ? fresh : pool;
  // 70% 偏长词，抬高输入难度
  const long = source.filter((w) => w.length >= (kind === 'zh' ? 4 : 8));
  const prefer = long.length > 0 && Math.random() < 0.7 ? long : source;
  return pick(prefer);
}

function makeWordCell(r: number, c: number, usedAnswers: Set<string>): TypingMazeCell {
  if (Math.random() < TYPING_MAZE_MATH_RATIO) {
    // 算术答案也尽量不与相邻重复
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

function neighbors(r: number, c: number, rows: number, cols: number): TypingMazePos[] {
  const dirs: TypingMazePos[] = [
    { r: r - 1, c },
    { r: r + 1, c },
    { r, c: c - 1 },
    { r, c: c + 1 },
  ];
  return dirs.filter((p) => p.r >= 0 && p.r < rows && p.c >= 0 && p.c < cols);
}

function keyOf(p: TypingMazePos): string {
  return `${p.r},${p.c}`;
}

function parseKey(s: string): TypingMazePos {
  const [r, c] = s.split(',').map(Number);
  return { r: r!, c: c! };
}

/**
 * 迷宫生成（高难度）：
 * 1) 主廊道强制绕远（更长最短路径门槛），少碰终点
 * 2) 大量长死胡同制造迷惑分叉
 * 3) 极少环路，避免抄近路
 * 4) 可走密度约 48%~58%，岔路更密
 */
function carveMazePath(rows: number, cols: number): Set<string> {
  const start: TypingMazePos = { r: 0, c: 0 };
  const end: TypingMazePos = { r: rows - 1, c: cols - 1 };
  const total = rows * cols;
  const targetDensity = 0.48 + Math.random() * 0.1; // 约 48%~58%
  const maxDensity = Math.min(0.6, targetDensity + 0.05);
  const minMainLen = Math.max(
    Math.floor((rows + cols) * 2.2),
    Math.floor(total * 0.3),
  );
  const maxMainLen = Math.max(minMainLen + 12, Math.floor(total * 0.38));
  const distToEnd = (p: TypingMazePos) => Math.abs(p.r - end.r) + Math.abs(p.c - end.c);

  const path = new Set<string>([keyOf(start)]);
  const stack: TypingMazePos[] = [start];
  let steps = 0;
  const maxSteps = total * 8;

  while (stack.length > 0 && steps < maxSteps && path.size < maxMainLen) {
    steps += 1;
    const cur = stack[stack.length - 1]!;
    const atEnd = cur.r === end.r && cur.c === end.c;
    if (atEnd && path.size >= minMainLen) break;

    const nexts = shuffleInPlace(neighbors(cur.r, cur.c, rows, cols)).filter(
      (n) => !path.has(keyOf(n)),
    );
    if (nexts.length === 0) {
      stack.pop();
      continue;
    }

    // 未达很长距离前严禁踏入终点；即便允许，也极少直奔终点
    const allowEnd = path.size >= minMainLen;
    const filtered = allowEnd
      ? nexts
      : nexts.filter((n) => !(n.r === end.r && n.c === end.c) && distToEnd(n) > 1);
    const pool = filtered.length > 0 ? filtered : nexts;

    const roll = Math.random();
    let chosen: TypingMazePos;
    if (allowEnd && roll < 0.08) {
      chosen = pool.reduce((best, n) => (distToEnd(n) < distToEnd(best) ? n : best), pool[0]!);
    } else if (roll < 0.55) {
      // 多数时候故意远离终点，主路径更绕
      chosen = pool.reduce((best, n) => (distToEnd(n) > distToEnd(best) ? n : best), pool[0]!);
    } else {
      chosen = pool[Math.floor(Math.random() * pool.length)]!;
    }

    path.add(keyOf(chosen));
    stack.push(chosen);
  }

  if (!path.has(keyOf(end))) {
    const pathList = [...path].map(parseKey);
    const queue: TypingMazePos[] = [...pathList];
    const came = new Map<string, string | null>();
    for (const p of pathList) came.set(keyOf(p), null);
    let reached: TypingMazePos | null = null;
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur.r === end.r && cur.c === end.c) {
        reached = cur;
        break;
      }
      for (const n of neighbors(cur.r, cur.c, rows, cols)) {
        const k = keyOf(n);
        if (came.has(k)) continue;
        came.set(k, keyOf(cur));
        queue.push(n);
      }
    }
    if (reached) {
      let walk: string | null = keyOf(reached);
      while (walk) {
        const alreadyOnPath = path.has(walk);
        path.add(walk);
        if (alreadyOnPath) break;
        walk = came.get(walk) ?? null;
      }
    } else {
      let r = start.r;
      let c = start.c;
      let zigzag = true;
      while (r !== end.r || c !== end.c) {
        if (zigzag && r !== end.r) r += r < end.r ? 1 : -1;
        else if (c !== end.c) c += c < end.c ? 1 : -1;
        else r += r < end.r ? 1 : -1;
        zigzag = !zigzag;
        path.add(`${r},${c}`);
      }
    }
  }

  // 大量长死胡同：从主廊道各处伸出，迷惑方向
  const pathList = [...path].map(parseKey);
  let guard = 0;
  while (path.size / total < targetDensity && guard < total * 5) {
    guard += 1;
    const origin = pick(pathList);
    let cur = origin;
    const len = randInt(4, Math.max(6, Math.floor(Math.min(rows, cols) * 0.7)));
    for (let step = 0; step < len; step += 1) {
      if (path.size / total >= maxDensity) break;
      const opts = neighbors(cur.r, cur.c, rows, cols).filter((n) => !path.has(keyOf(n)));
      if (opts.length === 0) break;
      // 优先伸向「路径邻居少」的格子，死胡同更细长
      opts.sort((a, b) => {
        const ca = neighbors(a.r, a.c, rows, cols).filter((n) => path.has(keyOf(n))).length;
        const cb = neighbors(b.r, b.c, rows, cols).filter((n) => path.has(keyOf(n))).length;
        return ca - cb;
      });
      const n = Math.random() < 0.85 ? opts[0]! : pick(opts);
      path.add(keyOf(n));
      pathList.push(n);
      cur = n;
    }
  }

  // 极少环路：略增岔路交叉，但不给明显近路
  const loopTries = Math.max(2, Math.floor(total * 0.03));
  for (let i = 0; i < loopTries; i += 1) {
    if (path.size / total >= maxDensity) break;
    const origin = pick(pathList);
    const opts = neighbors(origin.r, origin.c, rows, cols).filter((n) => !path.has(keyOf(n)));
    if (opts.length === 0) continue;
    const mid = pick(opts);
    const reconnect = neighbors(mid.r, mid.c, rows, cols).filter(
      (n) => path.has(keyOf(n)) && (n.r !== origin.r || n.c !== origin.c),
    );
    if (reconnect.length === 0) continue;
    path.add(keyOf(mid));
    pathList.push(mid);
  }

  return path;
}

export function generateBoard(modeId: TypingMazeModeId, rows: number, cols: number): GeneratedBoard {
  const start: TypingMazePos = { r: 0, c: 0 };
  const end: TypingMazePos = { r: rows - 1, c: cols - 1 };
  const board = emptyBoard(rows, cols);
  const usedAnswers = new Set<string>();

  if (modeId === 'pure') {
    let count = 0;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        board[r]![c] = makeWordCell(r, c, usedAnswers);
        count += 1;
      }
    }
    return { board, start, end, pathCount: count };
  }

  const path = carveMazePath(rows, cols);
  for (const cellKey of path) {
    const [rStr, cStr] = cellKey.split(',');
    const r = Number(rStr);
    const c = Number(cStr);
    board[r]![c] = makeWordCell(r, c, usedAnswers);
  }
  return { board, start, end, pathCount: path.size };
}
