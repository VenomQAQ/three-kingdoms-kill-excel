/**
 * REQ-2026-001 · FE-8 · 视口自适应填充计算
 *
 * 用于 SpreadsheetGrid 系列组件在数据行数不足时用空单元格填满视口。
 * 判据：非背景色像素占视口面积 ≤ 3%（QA 用 --bg-cell CSS token 做像素扫描）
 *
 * 实现：ResizeObserver + requestAnimationFrame 防抖，每次 ≤ 60fps 更新一次
 */
import { useEffect, useRef, useState } from 'react';

const CELL_HEIGHT = 22;
const CELL_WIDTH = 88;

export interface FillCounts {
  rows: number;
  cols: number;
}

/**
 * 给一个 ref 挂上 body 元素，返回需要补的行/列数（不含数据本身占用的）
 * @param dataRows 数据本身占了多少行
 * @param dataCols 数据本身占了多少列
 */
export function useCellFiller(
  bodyRef: React.RefObject<HTMLElement | null>,
  dataRows: number,
  dataCols: number,
): FillCounts {
  const [counts, setCounts] = useState<FillCounts>({ rows: 0, cols: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    const recompute = () => {
      const { clientHeight, clientWidth } = el;
      const totalRows = Math.ceil(clientHeight / CELL_HEIGHT);
      const totalCols = Math.ceil(clientWidth / CELL_WIDTH);
      const fillerRows = Math.max(0, totalRows - dataRows);
      const fillerCols = Math.max(0, totalCols - dataCols);
      setCounts((prev) =>
        prev.rows === fillerRows && prev.cols === fillerCols
          ? prev
          : { rows: fillerRows, cols: fillerCols },
      );
    };

    const schedule = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        recompute();
      });
    };

    recompute();

    const ro = new ResizeObserver(schedule);
    ro.observe(el);

    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [bodyRef, dataRows, dataCols]);

  return counts;
}
