// Catalog layers provide sensible placement defaults. A stored per-object
// value wins afterwards so users can deliberately restack walls and furniture.
export const DECOR_BACK_EDGE = 1;
export const FURNITURE_FRONT_EDGE = 49.999;
const FURNITURE_Y_SORT_SCALE = 1_000_000;

export function isDecorDepthReorderable(depth: number): boolean {
  return Number.isFinite(depth) && depth > DECOR_BACK_EDGE && depth < 50;
}

/**
 * Pick a value beyond every other reorderable object without renumbering the
 * whole map. Fractional indices leave room for repeated front/back operations.
 */
export function nextDecorDepth(otherDepths: number[], toFront: boolean): number {
  const depths = otherDepths.filter(isDecorDepthReorderable);
  if (depths.length === 0) return toFront ? FURNITURE_FRONT_EDGE : DECOR_BACK_EDGE + 0.001;
  const extreme = toFront ? Math.max(...depths) : Math.min(...depths);
  const edge = toFront ? FURNITURE_FRONT_EDGE : DECOR_BACK_EDGE;
  return (extreme + edge) / 2;
}

export function resolveDecorDepth(
  semanticDepth: number | null,
  storedDepth: number | null | undefined,
  fallbackDepth: number,
  sortAnchorY?: number,
): number {
  const candidate = storedDepth ?? semanticDepth ?? fallbackDepth;
  const finiteDepth = Number.isFinite(candidate) ? candidate : fallbackDepth;
  const baseDepth = Math.min(FURNITURE_FRONT_EDGE, Math.max(DECOR_BACK_EDGE, finiteDepth));

  // A custom index is exact. Y sorting only refines objects that are still on
  // their catalog default, so a manually front-stacked wall cannot drift.
  const hasCustomIndex = semanticDepth != null && storedDepth != null && storedDepth !== semanticDepth;
  if (hasCustomIndex) return baseDepth;

  // Floors, rugs and walls keep their fixed semantic layer. Furniture receives
  // a tiny Y-derived fraction inside its layer, so an object whose footprint
  // ends lower on the grid naturally renders in front of one placed above it.
  if (baseDepth < 3 || !Number.isFinite(sortAnchorY)) return baseDepth;
  const yOffset = Math.max(0, sortAnchorY!) / FURNITURE_Y_SORT_SCALE;
  return Math.min(FURNITURE_FRONT_EDGE, baseDepth + yOffset);
}
