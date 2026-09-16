export interface GridOrigin {
  x: number;
  y: number;
}

export interface GridPosition {
  x: number;
  y: number;
}

export interface GridEdgeSnap {
  x: boolean;
  y: boolean;
}

/**
 * Convert a pointer to a logical placement cell. Regular objects use the cell
 * under the pointer; edge-anchored objects use the nearest grid line instead.
 */
export function placementFromPointer(
  x: number,
  y: number,
  origin: GridOrigin,
  tileSize: number,
  edges: GridEdgeSnap = { x: false, y: false },
): GridPosition {
  const project = (value: number, axisOrigin: number, nearestEdge: boolean) =>
    axisOrigin + (nearestEdge ? Math.round : Math.floor)((value - axisOrigin) / tileSize) * tileSize;

  return {
    x: project(x, origin.x, edges.x),
    y: project(y, origin.y, edges.y),
  };
}

/** Snap an object's logical top-left to the grid owned by its room. */
export function snapToGrid(
  x: number,
  y: number,
  origin: GridOrigin,
  tileSize: number,
): GridPosition {
  return {
    x: origin.x + Math.round((x - origin.x) / tileSize) * tileSize,
    y: origin.y + Math.round((y - origin.y) / tileSize) * tileSize,
  };
}
