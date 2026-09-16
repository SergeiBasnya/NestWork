export const SURFACE_RENDER_BLEED = 1;

export interface SurfaceRenderRect {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

// Canvas can reveal a one-screen-pixel gap between two separately transformed
// contiguous surface sprites at fractional camera positions. Keep the logical top-left fixed
// and extend only the right/bottom edges so adjacent surfaces overlap invisibly.
export function surfaceRenderRect(
  x: number,
  y: number,
  width: number,
  height: number,
  bleed = SURFACE_RENDER_BLEED,
): SurfaceRenderRect {
  const safeBleed = Math.max(0, bleed);
  const renderWidth = width + safeBleed;
  const renderHeight = height + safeBleed;
  return {
    centerX: x + renderWidth / 2,
    centerY: y + renderHeight / 2,
    width: renderWidth,
    height: renderHeight,
  };
}
