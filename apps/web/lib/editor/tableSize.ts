export const MAX_TABLE_ROWS = 30;
export const MAX_TABLE_COLS = 12;

/** Reads "3x4" (also "3 × 4") as rows x columns, clamped to 1-30 rows and 1-12 columns. Null when it is not of that form. */
export function parseTableSize(input: string): { rows: number; cols: number } | null {
  const m = /^\s*(\d+)\s*[x×]\s*(\d+)\s*$/i.exec(input);
  if (!m) return null;
  const clamp = (n: number, max: number) => Math.min(max, Math.max(1, n));
  return { rows: clamp(Number(m[1]), MAX_TABLE_ROWS), cols: clamp(Number(m[2]), MAX_TABLE_COLS) };
}
