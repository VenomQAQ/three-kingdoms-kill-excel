/**
 * REQ-2026-001 · FE-8 · 视口自适应填充计算
 *
 * 根据容器高度一次性计算需要补的空行数，避免逐帧增量渲染。
 */
import { useLayoutEffect, useState } from 'react';

const CELL_HEIGHT = 22;
const CELL_WIDTH = 88;
const COL_HEADER_HEIGHT = 22;
const ROW_HEADER_WIDTH = 40;

function estimateFillerRows(dataRows: number): number {
  if (typeof window === 'undefined') return 24;
  const bodyHeight = Math.max(window.innerHeight - 220, 200);
  const totalRows = Math.ceil(bodyHeight / CELL_HEIGHT);
  return Math.max(0, totalRows - dataRows);
}

function estimateFillerCols(dataCols: number, cellWidth: number): number {
  if (typeof window === 'undefined' || dataCols <= 0) return 0;
  const bodyWidth = Math.max(window.innerWidth - ROW_HEADER_WIDTH, 0);
  const totalCols = Math.max(dataCols, Math.ceil(bodyWidth / cellWidth));
  return Math.max(0, totalCols - dataCols);
}

export interface FillCounts {
  rows: number;
  cols: number;
}

/**
 * 监听容器高度，返回需要补的空行数（不含数据本身占用的行）
 */
export function useCellFiller(
  containerRef: React.RefObject<HTMLElement | null>,
  dataRows: number,
  dataCols = 0,
  cellWidth = CELL_WIDTH,
): FillCounts {
  const [rows, setRows] = useState(() => estimateFillerRows(dataRows));
  const [cols, setCols] = useState(() => estimateFillerCols(dataCols, cellWidth));

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const recompute = () => {
      const bodyHeight = Math.max(el.clientHeight - COL_HEADER_HEIGHT, 0);
      const totalRows = Math.max(dataRows, Math.ceil(bodyHeight / CELL_HEIGHT));
      const fillerRows = Math.max(0, totalRows - dataRows);
      const bodyWidth = Math.max(el.clientWidth - ROW_HEADER_WIDTH, 0);
      const totalCols = dataCols > 0 ? Math.max(dataCols, Math.ceil(bodyWidth / cellWidth)) : dataCols;
      const fillerCols = Math.max(0, totalCols - dataCols);
      setRows((prev) => (prev === fillerRows ? prev : fillerRows));
      setCols((prev) => (prev === fillerCols ? prev : fillerCols));
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, dataRows, dataCols, cellWidth]);

  return { rows, cols };
}
