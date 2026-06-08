export const DECOY_HEADERS = ['区域', 'Q1销售', 'Q2销售', 'Q3销售', 'Q4销售', '同比', '环比', '备注'];

export const DECOY_ROWS: string[][] = [
  ['华北', '128.4', '142.1', '156.8', '171.2', '12.3%', '8.5%', ''],
  ['华东', '203.6', '218.9', '225.4', '241.0', '15.1%', '6.9%', ''],
  ['华南', '98.2', '105.7', '112.3', '118.6', '9.8%', '5.6%', ''],
  ['西南', '76.5', '81.2', '88.9', '94.1', '11.2%', '5.9%', ''],
  ['西北', '45.3', '48.6', '52.1', '55.8', '8.4%', '7.1%', ''],
  ['东北', '62.8', '67.4', '71.2', '74.9', '7.6%', '5.2%', ''],
  ['华中', '134.7', '141.2', '148.6', '155.3', '10.5%', '4.5%', ''],
  ['合计', '749.5', '805.1', '855.3', '910.9', '11.2%', '6.5%', ''],
];

export const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

/** 与 @tk/shared SANDBOX_ROOM_CODE 保持一致 */
export const SANDBOX_ROOM_CODE = '70755712';

export const GAME_SHEET_ID = 'game';
export const DECOY_SHEET_IDS = ['sheet1', 'sheet2'] as const;

export type SheetId = (typeof DECOY_SHEET_IDS)[number] | typeof GAME_SHEET_ID;

export const SHEET_LABELS: Record<SheetId, string> = {
  sheet1: '房间列表',
  sheet2: '区域销售',
  game: '2024汇总',
};

export const DEFAULT_FILE_NAMES: Record<SheetId, string> = {
  sheet1: '房间列表.xlsx',
  sheet2: '区域销售汇总.xlsx',
  game: '2024汇总.xlsx',
};
