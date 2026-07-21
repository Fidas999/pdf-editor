/**
 * Heuristics for PDF / OCR text styling (bold, italic, family).
 * Not a full AI model — fast local checks from font names + pixel density.
 */

export interface TextStyle {
  fontSize: number;
  fontFamily: string;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  fill: string;
}

const FAMILY_MAP: Array<{ test: RegExp; family: string }> = [
  { test: /times|georgia|serif/i, family: "Times New Roman, Times, serif" },
  { test: /courier|mono/i, family: "Courier New, Courier, monospace" },
  { test: /helvetica|arial|sans|roboto|calibri|verdana/i, family: "Helvetica, Arial, sans-serif" },
];

export function styleFromFontName(
  fontName: string | undefined,
  fontSize: number
): TextStyle {
  const name = fontName ?? "";
  const bold =
    /bold|black|heavy|extrabold|demibold|semibold|bd\b|heavy/i.test(name);
  const italic = /italic|oblique|it\b|oblique/i.test(name);
  let fontFamily = "Helvetica, Arial, sans-serif";
  for (const m of FAMILY_MAP) {
    if (m.test.test(name)) {
      fontFamily = m.family;
      break;
    }
  }
  return {
    fontSize: Math.max(6, fontSize),
    fontFamily,
    fontWeight: bold ? "bold" : "normal",
    fontStyle: italic ? "italic" : "normal",
    fill: "#111827",
  };
}

/**
 * Estimate whether a text patch on the rendered page looks bold by measuring
 * how "heavy" dark ink is inside the box (quick local "AI-like" check).
 */
export function estimateBoldFromPixels(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number
): boolean {
  const x = Math.max(0, Math.floor(left));
  const y = Math.max(0, Math.floor(top));
  const w = Math.max(1, Math.min(Math.floor(width), ctx.canvas.width - x));
  const h = Math.max(1, Math.min(Math.floor(height), ctx.canvas.height - y));
  if (w < 2 || h < 2) return false;

  let data: ImageData;
  try {
    data = ctx.getImageData(x, y, w, h);
  } catch {
    return false;
  }

  let dark = 0;
  let ink = 0;
  const { data: px } = data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const a = px[i + 3];
    if (a < 20) continue;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 200) {
      ink++;
      if (lum < 90) dark++;
    }
  }
  if (ink < 8) return false;
  // Bold text tends to have a higher share of very-dark pixels.
  return dark / ink > 0.42;
}

export function hasHeavyMojibake(s: string): boolean {
  if (s.length < 2) return false;
  let weird = 0;
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (
      (code >= 0x80 &&
        code <= 0xff &&
        !/[àáâãäåèéêëìíîïòóôõöùúûüçñÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑ]/.test(ch)) ||
      (code >= 0x2000 && code <= 0x206f) ||
      ch === "\uFFFD" ||
      ch === "□"
    ) {
      weird++;
    }
  }
  return weird / s.length > 0.35;
}

export function textQualityScore(samples: string[]): number {
  if (samples.length === 0) return 0;
  let good = 0;
  for (const s of samples) {
    const t = s.trim();
    if (!t) continue;
    if (/[\uFFFD□]/.test(t) || hasHeavyMojibake(t)) continue;
    // Prefer tokens with mostly letters/digits/punctuation used in docs
    if (/^[\wÀ-ÿ0-9\s.,;:/€$%ºª°'"()\-–—]+$/i.test(t) || /[A-Za-zÀ-ÿ]{2,}/.test(t)) {
      good++;
    }
  }
  return good / samples.length;
}
