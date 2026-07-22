/**
 * Font / style heuristics for PDF text import.
 * Local matching against the font catalog + confidence scores.
 */

import {
  DEFAULT_FONT,
  FONT_CATALOG,
  type CatalogFont,
} from "./fontCatalog";

export interface TextStyle {
  fontSize: number;
  fontFamily: string;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  fill: string;
  /** Catalog font id when matched. */
  fontId?: string;
  /** 0–1 local match confidence. */
  confidence?: number;
  /** Original PDF font name from pdf.js, if any. */
  sourceFontName?: string;
}

export interface FontMatchResult {
  font: CatalogFont;
  confidence: number;
  bold: boolean;
  italic: boolean;
  source: "alias" | "category" | "default";
}

const HIGH_CONFIDENCE = 0.78;

export function isHighConfidence(confidence: number): boolean {
  return confidence >= HIGH_CONFIDENCE;
}

export function matchFontLocally(
  fontName: string | undefined
): FontMatchResult {
  const name = fontName ?? "";
  const bold =
    /bold|black|heavy|extrabold|demibold|semibold|bd\b/i.test(name);
  const italic = /italic|oblique|\bit\b/i.test(name);

  let best: { font: CatalogFont; confidence: number } | null = null;
  for (const font of FONT_CATALOG) {
    for (const alias of font.aliases) {
      if (alias.test(name)) {
        const confidence = font.aliasConfidence;
        if (!best || confidence > best.confidence) {
          best = { font, confidence };
        }
        break;
      }
    }
  }

  if (best) {
    return {
      font: best.font,
      confidence: best.confidence,
      bold,
      italic,
      source: "alias",
    };
  }

  // Category guess from keywords when no alias hits
  if (/serif|times|georgia|garamond|baskerville|roman/i.test(name)) {
    const font =
      FONT_CATALOG.find((f) => f.id === "times") ?? DEFAULT_FONT;
    return {
      font,
      confidence: 0.55,
      bold,
      italic,
      source: "category",
    };
  }
  if (/mono|courier|console|code|typewriter/i.test(name)) {
    const font =
      FONT_CATALOG.find((f) => f.id === "courier") ?? DEFAULT_FONT;
    return {
      font,
      confidence: 0.55,
      bold,
      italic,
      source: "category",
    };
  }
  if (/sans|gothic|grotesk|arial|helvetica|calibri|verdana/i.test(name)) {
    const font =
      FONT_CATALOG.find((f) => f.id === "helvetica") ?? DEFAULT_FONT;
    return {
      font,
      confidence: 0.5,
      bold,
      italic,
      source: "category",
    };
  }

  return {
    font: DEFAULT_FONT,
    confidence: name ? 0.35 : 0.2,
    bold,
    italic,
    source: "default",
  };
}

export function styleFromFontName(
  fontName: string | undefined,
  fontSize: number
): TextStyle {
  const match = matchFontLocally(fontName);
  return {
    fontSize: Math.max(6, fontSize),
    fontFamily: match.font.cssFamily,
    fontWeight: match.bold ? "bold" : "normal",
    fontStyle: match.italic ? "italic" : "normal",
    fill: "#111827",
    fontId: match.font.id,
    confidence: match.confidence,
    sourceFontName: fontName,
  };
}

/**
 * Estimate whether a text patch on the rendered page looks bold by measuring
 * how "heavy" dark ink is inside the box (quick local check).
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
    if (
      /^[\wÀ-ÿ0-9\s.,;:/€$%ºª°'"()\-–—]+$/i.test(t) ||
      /[A-Za-zÀ-ÿ]{2,}/.test(t)
    ) {
      good++;
    }
  }
  return good / samples.length;
}
