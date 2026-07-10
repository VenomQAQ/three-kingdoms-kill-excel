import type { CrimeSudokuLevel, CrimeSudokuSceneCell } from '@tk/shared';

export function sceneAt(level: CrimeSudokuLevel, r: number, c: number): CrimeSudokuSceneCell {
  return level.scene[r]?.[c] ?? { room: 'hall', prop: '', propLabel: '空地' };
}

/**
 * 房间隔墙只画单侧，避免相邻格各画一条粗边导致 6px 叠线、网格错位。
 * - 左/上：仅盘面外轮廓
 * - 右/下：外轮廓，或与右侧/下方房间不同
 */
export function roomWalls(level: CrimeSudokuLevel, r: number, c: number) {
  const cur = sceneAt(level, r, c).room;
  return {
    l: c === 0,
    t: r === 0,
    r: c === level.size - 1 || sceneAt(level, r, c + 1).room !== cur,
    b: r === level.size - 1 || sceneAt(level, r + 1, c).room !== cur,
  };
}

export function isConflict(
  board: number[][],
  size: number,
  box: [number, number],
  r: number,
  c: number,
  val: number,
): boolean {
  if (!val) return false;
  for (let i = 0; i < size; i += 1) {
    if (i !== c && board[r]?.[i] === val) return true;
    if (i !== r && board[i]?.[c] === val) return true;
  }
  const [br, bc] = box;
  const r0 = Math.floor(r / br) * br;
  const c0 = Math.floor(c / bc) * bc;
  for (let i = r0; i < r0 + br; i += 1) {
    for (let j = c0; j < c0 + bc; j += 1) {
      if ((i !== r || j !== c) && board[i]?.[j] === val) return true;
    }
  }
  return false;
}

export function recomputeErrors(
  board: number[][],
  size: number,
  box: [number, number],
): Set<string> {
  const errors = new Set<string>();
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const v = board[r]?.[c] ?? 0;
      if (v && isConflict(board, size, box, r, c, v)) {
        errors.add(`${r},${c}`);
      }
    }
  }
  return errors;
}

export function emptyNotes(size: number): number[][][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => [] as number[]),
  );
}

export function cloneBoard(board: number[][]): number[][] {
  return board.map((row) => row.slice());
}

export function cloneNotes(notes: number[][][]): number[][][] {
  return notes.map((row) => row.map((cell) => cell.slice()));
}

export function boardsEqual(a: number[][], b: number[][]): boolean {
  if (a.length !== b.length) return false;
  for (let r = 0; r < a.length; r += 1) {
    if (a[r]!.length !== b[r]!.length) return false;
    for (let c = 0; c < a[r]!.length; c += 1) {
      if (a[r]![c] !== b[r]![c]) return false;
    }
  }
  return true;
}

export function filledCount(board: number[][]): { n: number; total: number } {
  let n = 0;
  let total = 0;
  for (const row of board) {
    for (const v of row) {
      total += 1;
      if (v) n += 1;
    }
  }
  return { n, total };
}

export type CheckWinResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * 锁定真凶：受害者所在房间/区域内，盘面上出现的唯一嫌疑人编号即为凶手。
 * （凶案现场通常设计为单格房间，故「独处」自然成立。）
 */
export function findAloneWithVictim(
  level: CrimeSudokuLevel,
  board: number[][],
): { ok: true; killer: number } | { ok: false; reason: string } {
  const roomId = level.victim.room;
  const nums = new Set<number>();
  for (let r = 0; r < level.size; r += 1) {
    for (let c = 0; c < level.size; c += 1) {
      if (sceneAt(level, r, c).room !== roomId) continue;
      const v = board[r]?.[c] ?? 0;
      if (v) nums.add(v);
    }
  }
  if (nums.size === 0) {
    return { ok: false, reason: `受害者所在区域「${level.rooms[roomId]?.name ?? roomId}」尚无站位` };
  }
  if (nums.size > 1) {
    return {
      ok: false,
      reason: `「${level.rooms[roomId]?.name ?? roomId}」内有 ${nums.size} 人，无法锁定独处真凶`,
    };
  }
  return { ok: true, killer: [...nums][0]! };
}

export function checkWin(
  level: CrimeSudokuLevel,
  board: number[][],
  accused: number | null,
): CheckWinResult {
  const { n, total } = filledCount(board);
  if (n < total) return { ok: false, reason: `盘面未填完（${n}/${total}）` };
  const errors = recomputeErrors(board, level.size, level.box);
  if (errors.size) return { ok: false, reason: `存在 ${errors.size} 处冲突` };
  if (!boardsEqual(board, level.solution)) {
    return { ok: false, reason: '盘面无冲突，但与标准解不一致' };
  }
  const alone = findAloneWithVictim(level, board);
  if (!alone.ok) return alone;
  if (alone.killer !== level.killer) {
    return { ok: false, reason: '关卡配置异常：独处真凶与标准答案不一致' };
  }
  if (accused == null) return { ok: false, reason: '请先指认凶手' };
  if (accused !== level.killer) {
    const wrong = level.suspects.find((s) => s.num === accused);
    return { ok: false, reason: `指认错误：${wrong?.name || accused} 不是真凶` };
  }
  return { ok: true };
}

export const CRIME_SUDOKU_RULES_HTML = `
<p><strong>一句话</strong>：先按普通数独把盘面填对，再根据「同区独处」从嫌疑人里<strong>点选唯一真凶</strong>，点「验算通关」即可。</p>

<h4>1. 怎么玩（核心）</h4>
<ul>
  <li><strong>主体就是数独</strong>：把 1～N 填进格子，保证每行、每列、每宫不重复。</li>
  <li>格子上的房间/家具是线索提示，帮你推理谁站在哪。</li>
  <li><strong>锁定真凶</strong>：全部人放好后，唯一与受害者在同一个房间/区域独处的人即为凶手。</li>
  <li><strong>指认凶手只能选一个人</strong>：在右侧「嫌疑人 · 口供」里点选；再点别人会改成新的指认。</li>
  <li>通关条件 = 盘面与标准解一致 + 指认的那个人就是真凶。</li>
</ul>

<h4>2. 盘面是什么</h4>
<ul>
  <li>每个可玩格子是一个<strong>站位</strong>，同时带有房间与家具/地面信息。</li>
  <li>格子里的<strong>数字</strong>表示站在该格的嫌疑人编号（1～N）。</li>
  <li>相邻格子若房间不同，会画<strong>细墙线</strong>，帮助你辨认区域。</li>
</ul>

<h4>3. 数独规则</h4>
<ul>
  <li>每一行、每一列、每一个宫内，数字 1～N 各出现一次，不得重复。</li>
  <li>题面给定的深色数字不可修改；你填入的数字可改、可清。</li>
  <li>出现同行/列/宫重复时，格子会标红提示冲突。</li>
</ul>

<h4>4. 笔记模式怎么用</h4>
<ul>
  <li>点击工具栏「笔记模式」，按钮变为「笔记中…」即表示已开启；再点一次可退出。</li>
  <li>也可按键盘 <strong>N</strong> 快速开关笔记模式。</li>
  <li>选中一个<strong>空格</strong>（没有正式答案的格子），再点数字键 1～N，或点右侧数字盘。</li>
  <li>该格不会出现大号答案，而是在格子底部用<strong>小字候选数字</strong>显示（类似数独铅笔标记）。</li>
  <li>同一数字再点一次会取消该候选；一格可同时标记多个候选。</li>
  <li>退出笔记模式后，再填数字会写入正式答案，并<strong>清空该格笔记</strong>。</li>
  <li>题面给定格、已有正式答案的格子不能记笔记。</li>
  <li>笔记会保存在本机；刷新或切换 Sheet 后仍会保留。</li>
</ul>

<h4>5. 破案步骤</h4>
<ol>
  <li>阅读右侧案情、受害者位置与线索，对照平面图上的房间与物品。</li>
  <li>像普通数独一样把盘面填满（不确定时可先用笔记标记候选）。</li>
  <li>全部人放好后，找出<strong>唯一与受害者同房间/区域独处</strong>的人，即为真凶。</li>
  <li>在嫌疑人列表中<strong>点选唯一真凶</strong>（只能指认一人）。</li>
  <li>点击「验算通关」：盘面正确且指认正确，才算破案。</li>
</ol>

<h4>6. 工具栏功能</h4>
<ul>
  <li><strong>关卡</strong>：配置化关卡，免费游玩；每关有独立奖励与提示额度。</li>
  <li><strong>图标 / 文字</strong>：默认文字模式——极浅灰底 + 文字标注；图标模式展示家具图标与房间底色。</li>
  <li><strong>笔记模式</strong>：见上方「笔记模式怎么用」。</li>
  <li><strong>提示</strong>：每次消耗 5 金币，每局最多 3 次；会填入当前选中空格的正确答案。</li>
  <li><strong>计时器</strong>：开局起计时，通关后停止；首次通关时长会记录，便于日后排行。</li>
  <li><strong>玩法说明</strong>：即本弹窗。</li>
</ul>

<h4>7. 奖励与重玩</h4>
<ul>
  <li>游玩本身免费，不扣入场费。</li>
  <li>每关<strong>首次通关</strong>发放配置的奖励金币，并记录通关时长。</li>
  <li>已通关关卡可再玩，但<strong>不再发奖励</strong>，提示仍扣费，也<strong>不更新</strong>通关时长记录。</li>
</ul>

<h4>8. 进度保存</h4>
<ul>
  <li>未通关时，切换 Sheet、刷新或关闭页面都会把当前盘面、笔记、指认、用时等保存在本机。</li>
  <li>通关后进度标记为已完成；再玩会开新局（仍可本地保存新一局的进行中进度）。</li>
</ul>
`.trim();
