type RepeatableSurfaceSource = CanvasImageSource & {
  readonly width: number;
  readonly height: number;
};

// TileSprite can fall back to Phaser's missing texture in Canvas mode. Produce
// the repeated pixels once so runtime scenes can use a regular, reliable Image.
export function createRepeatedSurfaceCanvas(
  source: RepeatableSurfaceSource,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  if (!source.width || !source.height) return null;

  const renderWidth = Math.max(1, Math.round(width));
  const renderHeight = Math.max(1, Math.round(height));
  const canvas = document.createElement('canvas');
  canvas.width = renderWidth;
  canvas.height = renderHeight;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.imageSmoothingEnabled = false;

  for (let y = 0; y < renderHeight; y += source.height) {
    for (let x = 0; x < renderWidth; x += source.width) {
      const copyWidth = Math.min(source.width, renderWidth - x);
      const copyHeight = Math.min(source.height, renderHeight - y);
      context.drawImage(source, 0, 0, copyWidth, copyHeight, x, y, copyWidth, copyHeight);
    }
  }

  return canvas;
}
