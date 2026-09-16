export const MAX_TILE_FILL_SPAN = 64;

export interface TileFillRect {
  col: number;
  row: number;
  w: number;
  h: number;
}

function clampCell(value: number, cellCount: number): number {
  return Math.min(Math.max(0, cellCount - 1), Math.max(0, value));
}

// Turns a start cell + live pointer cell into a room-bounded rectangle. The
// server accepts furniture footprints up to 64×64, so the preview uses the same
// limit and can never promise a placement that persistence would reject.
export function tileFillRect(
  startCol: number,
  startRow: number,
  targetCol: number,
  targetRow: number,
  roomCols: number,
  roomRows: number,
  maxSpan = MAX_TILE_FILL_SPAN,
): TileFillRect {
  const safeCols = Math.max(1, roomCols);
  const safeRows = Math.max(1, roomRows);
  const safeSpan = Math.max(1, maxSpan);
  const startC = clampCell(startCol, safeCols);
  const startR = clampCell(startRow, safeRows);
  const targetC = Math.min(startC + safeSpan - 1, Math.max(startC - safeSpan + 1, clampCell(targetCol, safeCols)));
  const targetR = Math.min(startR + safeSpan - 1, Math.max(startR - safeSpan + 1, clampCell(targetRow, safeRows)));

  return {
    col: Math.min(startC, targetC),
    row: Math.min(startR, targetR),
    w: Math.abs(targetC - startC) + 1,
    h: Math.abs(targetR - startR) + 1,
  };
}
