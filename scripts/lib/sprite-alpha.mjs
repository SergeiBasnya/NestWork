/**
 * Recover a clean sprite silhouette from generated images whose checkerboard
 * or white background was baked into the RGB pixels.
 *
 * Neutral background pixels are flood-filled from the cell edges. Dark or
 * coloured outline pixels act as a barrier, so neutral colours enclosed by an
 * object (white tabletops, lamp shades, screens…) remain opaque.
 */
export function removeExteriorNeutral(data, info, rect, neutralMin = 32, neutralSpread = 22) {
  const width = rect.width;
  const height = rect.height;
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const localIndex = (x, y) => (y - rect.top) * width + x - rect.left;
  const isExteriorCandidate = (x, y) => {
    const offset = (y * info.width + x) * 4;
    if (data[offset + 3] < 16) return true;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    return Math.max(red, green, blue) - Math.min(red, green, blue) <= neutralSpread
      && Math.min(red, green, blue) >= neutralMin;
  };

  let head = 0;
  let tail = 0;
  const enqueue = (x, y) => {
    const local = localIndex(x, y);
    if (seen[local] || !isExteriorCandidate(x, y)) return;
    seen[local] = 1;
    queue[tail++] = y * info.width + x;
  };

  for (let x = rect.left; x < rect.left + width; x++) {
    enqueue(x, rect.top);
    enqueue(x, rect.top + height - 1);
  }
  for (let y = rect.top; y < rect.top + height; y++) {
    enqueue(rect.left, y);
    enqueue(rect.left + width - 1, y);
  }

  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    data.fill(0, pixel * 4, pixel * 4 + 4);
    if (x > rect.left) enqueue(x - 1, y);
    if (x < rect.left + width - 1) enqueue(x + 1, y);
    if (y > rect.top) enqueue(x, y - 1);
    if (y < rect.top + height - 1) enqueue(x, y + 1);
  }

}

/** Remove a flat magenta production background without confusing cream assets for it. */
export function removeExteriorMagenta(data, info, rect) {
  const width = rect.width;
  const height = rect.height;
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const localIndex = (x, y) => (y - rect.top) * width + x - rect.left;
  const isExteriorCandidate = (x, y) => {
    const offset = (y * info.width + x) * 4;
    if (data[offset + 3] < 16) return true;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    return Math.min(red, blue) >= 8
      && Math.min(red, blue) - green >= 8
      && Math.abs(red - blue) <= 128;
  };

  let head = 0;
  let tail = 0;
  const enqueue = (x, y) => {
    const local = localIndex(x, y);
    if (seen[local] || !isExteriorCandidate(x, y)) return;
    seen[local] = 1;
    queue[tail++] = y * info.width + x;
  };

  for (let x = rect.left; x < rect.left + width; x++) {
    enqueue(x, rect.top);
    enqueue(x, rect.top + height - 1);
  }
  for (let y = rect.top; y < rect.top + height; y++) {
    enqueue(rect.left, y);
    enqueue(rect.left + width - 1, y);
  }

  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    data.fill(0, pixel * 4, pixel * 4 + 4);
    if (x > rect.left) enqueue(x - 1, y);
    if (x < rect.left + width - 1) enqueue(x + 1, y);
    if (y > rect.top) enqueue(x, y - 1);
    if (y < rect.top + height - 1) enqueue(x, y + 1);
  }

  // Magenta is a forbidden production colour for this normalization mode, so
  // also clear small islands separated from the exterior by compression noise.
  for (let y = rect.top; y < rect.top + height; y++) {
    for (let x = rect.left; x < rect.left + width; x++) {
      if (isExteriorCandidate(x, y)) {
        data.fill(0, (y * info.width + x) * 4, (y * info.width + x) * 4 + 4);
      }
    }
  }
}

export function assertNoMagentaResidue(data, info, label) {
  let residues = 0;
  for (let pixel = 0; pixel < info.width * info.height; pixel++) {
    const offset = pixel * 4;
    if (data[offset + 3] < 16) continue;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    if (
      Math.min(red, blue) >= 8
      && Math.min(red, blue) - green >= 8
      && Math.abs(red - blue) <= 128
    ) {
      residues++;
    }
  }
  if (residues) throw new Error(`${label}: ${residues} magenta background pixel(s) remain`);
}

/** Remove detached post-resize specks while retaining legitimate object parts. */
export function removeSmallAlphaComponents(
  data,
  info,
  rect,
  { minimumPixels = 12, minimumRatio = 0.012, largestOnly = false } = {},
) {
  const visited = new Uint8Array(rect.width * rect.height);
  const queue = new Int32Array(rect.width * rect.height);
  const components = [];
  const localIndex = (x, y) => (y - rect.top) * rect.width + x - rect.left;
  const isVisible = (x, y) => data[(y * info.width + x) * 4 + 3] >= 16;

  for (let y = rect.top; y < rect.top + rect.height; y++) {
    for (let x = rect.left; x < rect.left + rect.width; x++) {
      const start = localIndex(x, y);
      if (visited[start] || !isVisible(x, y)) continue;
      let head = 0;
      let tail = 0;
      const component = [];
      visited[start] = 1;
      queue[tail++] = y * info.width + x;
      while (head < tail) {
        const pixel = queue[head++];
        const px = pixel % info.width;
        const py = Math.floor(pixel / info.width);
        component.push(pixel);
        for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
          if (nx < rect.left || nx >= rect.left + rect.width || ny < rect.top || ny >= rect.top + rect.height) continue;
          const next = localIndex(nx, ny);
          if (visited[next] || !isVisible(nx, ny)) continue;
          visited[next] = 1;
          queue[tail++] = ny * info.width + nx;
        }
      }
      components.push(component);
    }
  }

  const largest = Math.max(0, ...components.map((component) => component.length));
  const keep = new Set(
    components
      .filter((component) => largestOnly
        ? component.length === largest
        : component.length >= Math.max(minimumPixels, largest * minimumRatio))
      .flat(),
  );
  for (let y = rect.top; y < rect.top + rect.height; y++) {
    for (let x = rect.left; x < rect.left + rect.width; x++) {
      const pixel = y * info.width + x;
      if (!keep.has(pixel)) data.fill(0, pixel * 4, pixel * 4 + 4);
    }
  }
}

/**
 * Remove one-pixel antennae left by a generated matte. Real silhouettes enter
 * a frame with a meaningful run of pixels; one or two pixels on an outermost
 * row/column are extraction debris.
 */
export function trimSparseAlphaEdges(data, info, rect, maximumPixels = 2) {
  const visible = (x, y) => data[(y * info.width + x) * 4 + 3] >= 16;
  const clearPixel = (x, y) => data.fill(0, (y * info.width + x) * 4, (y * info.width + x) * 4 + 4);
  let left = rect.left;
  let right = rect.left + rect.width - 1;
  let top = rect.top;
  let bottom = rect.top + rect.height - 1;

  const countColumn = (x) => {
    let count = 0;
    for (let y = top; y <= bottom; y++) if (visible(x, y)) count++;
    return count;
  };
  const countRow = (y) => {
    let count = 0;
    for (let x = left; x <= right; x++) if (visible(x, y)) count++;
    return count;
  };

  while (left <= right && countColumn(left) > 0 && countColumn(left) <= maximumPixels) {
    for (let y = top; y <= bottom; y++) clearPixel(left, y);
    left++;
  }
  while (right >= left && countColumn(right) > 0 && countColumn(right) <= maximumPixels) {
    for (let y = top; y <= bottom; y++) clearPixel(right, y);
    right--;
  }
  while (top <= bottom && countRow(top) > 0 && countRow(top) <= maximumPixels) {
    for (let x = left; x <= right; x++) clearPixel(x, top);
    top++;
  }
  while (bottom >= top && countRow(bottom) > 0 && countRow(bottom) <= maximumPixels) {
    for (let x = left; x <= right; x++) clearPixel(x, bottom);
    bottom--;
  }
}

export function alphaBounds(data, info, threshold = 16) {
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] < threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) throw new Error('Sprite source contains no visible pixels');
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Fail fast when an isolated source is opaque, cropped, or missing the alpha
 * margin required by the packer. A bad source must never silently become a
 * bad runtime sprite.
 */
export function assertTransparentMargin(data, info, label, minimumMargin = 4) {
  if (info.channels !== 4) throw new Error(`${label}: expected an RGBA source`);
  const bounds = alphaBounds(data, info);
  const margins = {
    left: bounds.left,
    top: bounds.top,
    right: info.width - bounds.left - bounds.width,
    bottom: info.height - bounds.top - bounds.height,
  };

  for (const [edge, margin] of Object.entries(margins)) {
    if (margin < minimumMargin) {
      throw new Error(`${label}: ${edge} alpha margin is ${margin}px; expected at least ${minimumMargin}px`);
    }
  }

  return bounds;
}
