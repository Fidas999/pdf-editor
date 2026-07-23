import type { Canvas } from "fabric";

/**
 * Off-screen rendered PDF page bitmaps (design-scale). Used as the visible
 * page preview under Fabric and when exporting.
 */
const pageBitmaps = new Map<number, HTMLCanvasElement>();
const pageDataUrls = new Map<number, string>();

export function setPageBitmap(pageIndex: number, canvas: HTMLCanvasElement) {
  pageBitmaps.set(pageIndex, canvas);
  try {
    pageDataUrls.set(pageIndex, canvas.toDataURL("image/png"));
  } catch (err) {
    console.warn("Failed to snapshot page bitmap", err);
    pageDataUrls.delete(pageIndex);
  }
}

export function getPageBitmap(pageIndex: number): HTMLCanvasElement | undefined {
  return pageBitmaps.get(pageIndex);
}

export function getPageDataUrl(pageIndex: number): string | undefined {
  return pageDataUrls.get(pageIndex);
}

export function clearPageBitmaps() {
  pageBitmaps.clear();
  pageDataUrls.clear();
}

export function unregisterPageBitmap(pageIndex: number) {
  pageBitmaps.delete(pageIndex);
  pageDataUrls.delete(pageIndex);
}

/** Composite bitmap + fabric overlay into a PNG data URL for export. */
export function compositePageToDataUrl(
  pageIndex: number,
  fabricCanvas: Canvas,
  multiplier = 2
): string | null {
  const bg = pageBitmaps.get(pageIndex);
  const w = fabricCanvas.getWidth();
  const h = fabricCanvas.getHeight();
  if (!w || !h) return null;

  const out = document.createElement("canvas");
  out.width = Math.round(w * multiplier);
  out.height = Math.round(h * multiplier);
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.scale(multiplier, multiplier);

  if (bg) {
    ctx.drawImage(bg, 0, 0, w, h);
  }

  // Overlay fabric (transparent bg) — hide hit boxes first
  const lower = fabricCanvas.toCanvasElement(1);
  ctx.drawImage(lower, 0, 0, w, h);

  return out.toDataURL("image/png");
}
