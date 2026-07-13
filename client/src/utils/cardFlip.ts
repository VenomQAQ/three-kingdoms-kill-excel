import type { CardFlipTile } from '@tk/shared';

/** kindCount = 物品种类数；实际配对数 = rows * cols / 2 */
export function buildDemoBoard(itemIds: string[], rows: number, cols: number, kindCount: number): CardFlipTile[] {
  const total = rows * cols;
  const pairTotal = Math.floor(total / 2);
  const selected = itemIds.slice(0, Math.max(1, Math.min(kindCount, itemIds.length)));
  const ids: string[] = [];
  for (let pair = 0; pair < pairTotal; pair += 1) {
    const itemId = selected[pair % selected.length]!;
    ids.push(itemId, itemId);
  }
  // 演示盘固定顺序，避免每次切换主题都闪烁
  return Array.from({ length: total }, (_, index) => ({
    tileId: `demo-${index}`,
    itemId: ids[index] ?? selected[0]!,
    row: Math.floor(index / cols),
    col: index % cols,
  }));
}

export function formatCardFlipTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export const CARD_FLIP_RULES_HTML = `
<h4>目标</h4>
<p>在限定时间内翻开并配对所有相同物品，通关可获得金币奖励。</p>
<h4>怎么玩</h4>
<ul>
  <li>每次最多翻开 2 张牌。</li>
  <li>两张相同：配对成功，牌保持翻开状态。</li>
  <li>两张不同：短暂展示后自动翻回。</li>
  <li>全部配对完成即通关。</li>
</ul>
<h4>展示模式</h4>
<ul>
  <li><strong>图标</strong>：显示 emoji 图案。</li>
  <li><strong>文字</strong>：显示物品名称。</li>
</ul>
<h4>难度与奖励</h4>
<ul>
  <li><strong>简单</strong>：6×6（18 对 / 8 种），90 秒，通关 +10 金币</li>
  <li><strong>普通</strong>：8×8（32 对 / 12 种），150 秒，通关 +20 金币</li>
  <li><strong>困难</strong>：10×10（50 对 / 16 种），210 秒，通关 +35 金币</li>
</ul>
<h4>费用</h4>
<ul>
  <li>每次开局消耗 <strong>5 金币</strong></li>
  <li>超时或未配对完算失败，不返还入场费</li>
</ul>
<h4>提示</h4>
<p>难度越高，棋盘越大、种类越多、时间压力越大。开局前可切换主题预览牌面范围。</p>
`;
