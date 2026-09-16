// Remove the pale neutral fringe left when generated artwork is cut out from a
// white canvas. The operation is deliberately conservative: it only removes
// light, almost-grey pixels touching transparency, stopping at the coloured or
// dark outline. Clearing RGB as well as alpha prevents texture sampling from
// pulling the old white matte back into scaled sprites.
export async function cleanSpriteMatte(sharp, input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const transparentAt = (x, y) => {
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return true;
    return data[(y * info.width + x) * 4 + 3] === 0;
  };

  for (let pass = 0; pass < 4; pass++) {
    const remove = [];
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const index = (y * info.width + x) * 4;
        if (!data[index + 3]) continue;
        // The packer deliberately aligns feet to the last source row. A light
        // shoe pixel there is a baseline anchor, not background matte.
        if (y === info.height - 1) continue;
        const touchesTransparency =
          transparentAt(x - 1, y) ||
          transparentAt(x + 1, y) ||
          transparentAt(x, y - 1) ||
          transparentAt(x, y + 1);
        if (!touchesTransparency) continue;

        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const lightest = Math.max(red, green, blue);
        const darkest = Math.min(red, green, blue);
        if (darkest > 105 && lightest - darkest <= 36) remove.push(index);
      }
    }
    if (!remove.length) break;
    for (const index of remove) data.fill(0, index, index + 4);
  }

  for (let index = 0; index < data.length; index += 4) {
    if (!data[index + 3]) data.fill(0, index, index + 4);
  }

  return sharp(data, { raw: info }).png().toBuffer();
}
