import { Rect, IText, type FabricObject, type Canvas } from "fabric";
import { PDFDocument } from "pdf-lib";
import type { PDFPageProxy } from "pdfjs-dist";
import { pdfjsLib, DESIGN_SCALE } from "./pdf";
import { tag, type ObjectKind } from "./createObject";
import {
  hasHeavyMojibake,
  styleFromFontName,
  type TextStyle,
} from "./textStyle";

type Tagged = FabricObject & {
  kind?: ObjectKind;
  formName?: string;
  extractedText?: string;
  fontSizeHint?: number;
  fontWeightHint?: "normal" | "bold";
  fontStyleHint?: "normal" | "italic";
  fontFamilyHint?: string;
};

export interface ExtractedItem {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  style: TextStyle;
}

/**
 * Extract raw text items from pdf.js (positions + style from font name).
 */
export async function collectPdfTextItems(
  page: PDFPageProxy
): Promise<ExtractedItem[]> {
  const viewport = page.getViewport({ scale: DESIGN_SCALE });
  const content = await page.getTextContent();
  const items: ExtractedItem[] = [];

  for (const raw of content.items) {
    if (!("str" in raw)) continue;
    const item = raw as {
      str: string;
      transform: number[];
      width: number;
      height: number;
      fontName?: string;
    };
    const str = item.str;
    if (!str || !str.trim()) continue;

    const m = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontSize = Math.max(6, Math.hypot(m[2], m[3]));
    const scaleX = Math.hypot(m[0], m[1]);
    const width = Math.max(fontSize * 0.35, (item.width || 0) * scaleX);
    const height = Math.max(fontSize * 0.9, fontSize);
    const left = m[4];
    const top = m[5] - fontSize * 0.85;
    const style = styleFromFontName(item.fontName, fontSize);

    items.push({
      text: str,
      left,
      top,
      width,
      height,
      style,
    });
  }

  return items;
}

/** Reject barcode-like / absurd boxes that destroy the layout. */
export function isJunkBox(
  width: number,
  height: number,
  pageW: number,
  pageH: number
): boolean {
  if (width < 2 || height < 2) return true;
  if (width > pageW * 0.95 && height > pageH * 0.2) return true;
  // Tall thin strips (vertical barcodes misread as text)
  if (height > width * 4 && height > pageH * 0.15) return true;
  if (width > height * 25 && height < 14) return true;
  return false;
}

/**
 * Merge nearby fragments on the same line into fewer editable regions
 * so we don't get one box per letter.
 */
export function mergeLineItems(items: ExtractedItem[]): ExtractedItem[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) =>
    Math.abs(a.top - b.top) < 2 ? a.left - b.left : a.top - b.top
  );

  const lines: ExtractedItem[] = [];
  let cur: ExtractedItem | null = null;

  for (const item of sorted) {
    if (!cur) {
      cur = { ...item };
      continue;
    }
    const sameLine =
      Math.abs(item.top - cur.top) < Math.max(cur.height, item.height) * 0.55;
    const gap: number = item.left - (cur.left + cur.width);
    const close = gap < Math.max(cur.style.fontSize, item.style.fontSize) * 0.7;

    if (sameLine && close && gap > -cur.style.fontSize * 0.3) {
      const space: string = gap > cur.style.fontSize * 0.18 ? " " : "";
      const right = Math.max(cur.left + cur.width, item.left + item.width);
      const bottom = Math.max(cur.top + cur.height, item.top + item.height);
      const nextLeft = Math.min(cur.left, item.left);
      const nextTop = Math.min(cur.top, item.top);
      cur = {
        text: cur.text + space + item.text,
        left: nextLeft,
        top: nextTop,
        width: right - nextLeft,
        height: bottom - nextTop,
        style: {
          ...cur.style,
          fontSize: Math.max(cur.style.fontSize, item.style.fontSize),
          fontWeight:
            cur.style.fontWeight === "bold" || item.style.fontWeight === "bold"
              ? "bold"
              : "normal",
          fontStyle:
            cur.style.fontStyle === "italic" || item.style.fontStyle === "italic"
              ? "italic"
              : "normal",
        },
      };
    } else {
      lines.push(cur);
      cur = { ...item };
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Nearly-invisible hit boxes over PDF text. Does NOT cover the original page.
 * Double-click a box to replace that region with editable text.
 */
export async function createTextHitBoxes(
  page: PDFPageProxy
): Promise<FabricObject[]> {
  const viewport = page.getViewport({ scale: DESIGN_SCALE });
  const pageW = viewport.width;
  const pageH = viewport.height;
  const raw = await collectPdfTextItems(page);
  const filtered = raw.filter(
    (i) => !isJunkBox(i.width, i.height, pageW, pageH)
  );
  const merged = mergeLineItems(filtered);
  const objects: FabricObject[] = [];

  for (const item of merged) {
    if (isJunkBox(item.width, item.height, pageW, pageH)) continue;
    // Skip obviously broken strings for the "guess" label, but keep the hit
    // so the user can still retype over that area.
    const hit = new Rect({
      left: item.left,
      top: item.top,
      width: Math.max(8, item.width),
      height: Math.max(8, item.height),
      fill: "rgba(59, 130, 246, 0.05)",
      stroke: "rgba(59, 130, 246, 0)",
      strokeWidth: 1,
      hoverCursor: "text",
    });
    const tagged = hit as Tagged;
    tagged.extractedText = item.text;
    tagged.fontSizeHint = item.style.fontSize;
    tagged.fontWeightHint = item.style.fontWeight;
    tagged.fontStyleHint = item.style.fontStyle;
    tagged.fontFamilyHint = item.style.fontFamily;
    tag(hit, "pdfTextHit");
    objects.push(hit);
  }

  return objects;
}

/**
 * Replace a hit-box with whiteout + editable IText (only that region).
 */
export function activatePdfTextHit(canvas: Canvas, hit: FabricObject): IText {
  const bound = hit.getBoundingRect();
  const tagged = hit as Tagged;
  const fontSize = tagged.fontSizeHint ?? Math.max(10, bound.height * 0.7);
  const guess = tagged.extractedText ?? "";
  const looksBroken =
    /[\uFFFD□]/.test(guess) || hasHeavyMojibake(guess) || guess.length === 0;
  const initial = looksBroken ? "" : guess;

  const cover = new Rect({
    left: bound.left - 1,
    top: bound.top - 1,
    width: bound.width + 2,
    height: bound.height + 2,
    fill: "#ffffff",
    strokeWidth: 0,
    selectable: false,
    evented: false,
  });
  tag(cover, "erase");

  const text = new IText(initial || "", {
    left: bound.left,
    top: bound.top,
    fontSize,
    fill: "#111827",
    fontFamily: tagged.fontFamilyHint ?? "Helvetica, Arial, sans-serif",
    fontWeight: tagged.fontWeightHint ?? "normal",
    fontStyle: tagged.fontStyleHint ?? "normal",
    backgroundColor: "#ffffff",
    padding: 1,
  });
  if (bound.width > 0) text.set({ width: bound.width });
  tag(text, "pdfText");

  canvas.remove(hit);
  canvas.add(cover);
  canvas.sendObjectToBack(cover);
  canvas.add(text);
  canvas.setActiveObject(text);
  canvas.requestRenderAll();

  const editable = text as unknown as {
    enterEditing: () => void;
    selectAll: () => void;
  };
  editable.enterEditing();
  if (initial) editable.selectAll();

  return text;
}

export async function extractFormFields(
  pdfBytes: Uint8Array,
  pageIndex: number,
  _pageWidthPt: number,
  pageHeightPt: number
): Promise<FabricObject[]> {
  const objects: FabricObject[] = [];
  try {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const form = doc.getForm();
    const fields = form.getFields();
    const scale = DESIGN_SCALE;
    const pages = doc.getPages();

    for (const field of fields) {
      let value = "";
      try {
        const maybe = field as { getText?: () => string };
        if (typeof maybe.getText !== "function") continue;
        value = maybe.getText() ?? "";
      } catch {
        continue;
      }

      const name = field.getName();
      const widgets = field.acroField.getWidgets();
      for (const widget of widgets) {
        const pageRef = widget.P();
        let widgetPage = pageRef
          ? pages.findIndex((p) => p.ref === pageRef)
          : -1;
        if (widgetPage < 0) {
          if (pages.length === 1) widgetPage = 0;
          else continue;
        }
        if (widgetPage !== pageIndex) continue;

        const { x, y, width, height } = widget.getRectangle();
        const left = x * scale;
        const top = (pageHeightPt - y - height) * scale;
        const fontSize = Math.max(8, height * scale * 0.55);

        const bg = new Rect({
          left,
          top,
          width: width * scale,
          height: height * scale,
          fill: "rgba(219, 234, 254, 0.25)",
          stroke: "#93c5fd",
          strokeWidth: 1,
          selectable: false,
          evented: false,
        });
        tag(bg, "erase");

        const text = new IText(value || "", {
          left: left + 2,
          top: top + Math.max(0, (height * scale - fontSize) / 2),
          fontSize,
          fill: "#111827",
          fontFamily: "Helvetica, Arial, sans-serif",
          backgroundColor: "rgba(255,255,255,0.85)",
        });
        (text as Tagged).formName = name;
        tag(text, "formField");

        objects.push(bg, text);
      }
    }
  } catch (err) {
    console.warn("Form field extraction skipped:", err);
  }
  return objects;
}

export function createEraseFromBounds(
  left: number,
  top: number,
  width: number,
  height: number
) {
  const r = new Rect({
    left,
    top,
    width: Math.max(4, width),
    height: Math.max(4, height),
    fill: "#ffffff",
    stroke: "#e5e7eb",
    strokeWidth: 1,
    opacity: 1,
  });
  return tag(r, "erase");
}

export function createEraseFromObject(obj: FabricObject) {
  const bound = obj.getBoundingRect();
  return createEraseFromBounds(bound.left, bound.top, bound.width, bound.height);
}

export function createEraseDraft(x: number, y: number): Rect {
  const r = new Rect({
    left: x,
    top: y,
    width: 1,
    height: 1,
    fill: "#ffffff",
    stroke: "#f87171",
    strokeWidth: 1,
    strokeDashArray: [4, 3],
    opacity: 0.85,
    selectable: false,
    evented: false,
  });
  tag(r, "erase");
  return r;
}

export function getContentKind(obj: FabricObject): ObjectKind | undefined {
  return (obj as Tagged).kind;
}

export function tagContent(obj: FabricObject, kind: ObjectKind) {
  return tag(obj, kind);
}
