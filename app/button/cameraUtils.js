export function toGrayInPlace(imageData) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) | 0;
    data[i] = y;
    data[i + 1] = y;
    data[i + 2] = y;
  }
}

export function forceGrayscale2D(ctx, w, h) {
  if (!ctx || !w || !h) return;
  try {
    const imageData = ctx.getImageData(0, 0, w, h);
    toGrayInPlace(imageData);
    ctx.putImageData(imageData, 0, 0);
  } catch {
    // Ignore canvas read failures and keep UI responsive.
  }
}
