/** Cache alpha-aware panel shadows so blur is never recomputed per video frame. */
export function createPanelShadowCache() {
  const cache = new Map<
    string,
    { canvas: HTMLCanvasElement; padding: number; width: number; height: number }
  >();

  return (
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    x: number,
    y: number,
    width: number,
    height: number,
    viewportWidth: number,
    color: string,
  ) => {
    // Normalize to a 720px-wide preview, independent of output resolution or zoom.
    const referenceWidth = 1280;
    const fitRatio = Math.min(
      1,
      ((image.width / image.height) * ctx.canvas.height) / viewportWidth,
    );
    const rasterWidth = Math.max(1, Math.round(referenceWidth * fitRatio));
    const rasterHeight = Math.max(1, Math.round((rasterWidth * image.height) / image.width));
    const blur = (72 * referenceWidth) / 720;
    const offset = (12 * referenceWidth) / 720;
    const padding = Math.ceil(blur * 2 + offset);
    const key = `${image.src}:${rasterWidth}:${rasterHeight}:${color}`;
    let entry = cache.get(key);
    if (!entry) {
      const canvas = document.createElement("canvas");
      canvas.width = rasterWidth + padding * 2;
      canvas.height = rasterHeight + padding * 2;
      const shadowCtx = canvas.getContext("2d");
      if (!shadowCtx) return;
      shadowCtx.shadowColor = color;
      shadowCtx.shadowBlur = blur;
      shadowCtx.shadowOffsetX = 0;
      shadowCtx.shadowOffsetY = offset;
      shadowCtx.drawImage(image, padding, padding, rasterWidth, rasterHeight);
      // Remove the source pixels; keep only the alpha-aware shadow around them.
      shadowCtx.shadowColor = "transparent";
      shadowCtx.shadowBlur = 0;
      shadowCtx.shadowOffsetY = 0;
      shadowCtx.globalCompositeOperation = "destination-out";
      shadowCtx.drawImage(image, padding, padding, rasterWidth, rasterHeight);
      entry = { canvas, padding, width: rasterWidth, height: rasterHeight };
      if (cache.size >= 8) cache.delete(cache.keys().next().value ?? "");
      cache.set(key, entry);
    }
    const scaleX = width / entry.width;
    const scaleY = height / entry.height;
    ctx.drawImage(
      entry.canvas,
      x - entry.padding * scaleX,
      y - entry.padding * scaleY,
      entry.canvas.width * scaleX,
      entry.canvas.height * scaleY,
    );
  };
}
