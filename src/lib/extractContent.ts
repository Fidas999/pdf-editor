import { Rect, IText, type FabricObject, type Canvas } from "fabric";
import { PDFDocument } from "pdf-lib";
import type { PDFPageProxy } from "pdfjs-dist";
import { pdfjsLib, DESIGN_SCALE } from "./pdf";
import { tag, type ObjectKind } from "./createObject";
import { ocrPageCanvas } from "./ocrPage";
import {
  hasHeavyMojibake,
  styleFromFontName,
  textQualityScore,
  type TextStyle,
} from "./textStyle";

type Tagged = FabricObject & {
  kind?: ObjectKind;
  formName?: string;
  extractedText?: string;
  fontSizeHint?: number;
};

export interface ExtractedItem {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  style: TextStyle;
  source: "pdf" | "ocr";
}

/**
 * Pull text items + style hints from pdf.js getTextContent().
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
    const width = Math.max(fontSize * 0.5, (item.width || 0) * scaleX);
    const height = Math.max(fontSize * 0.95, fontSize);
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
      source: "pdf",
    });
  }

  return items;
}

/**
 * Rebuild the page text as a fully editable layer:
 * - Covers each original glyph box with white
 * - Places styled IText (bold/italic/size/family) on top
 * - If PDF extraction looks garbled, OCR the rendered canvas instead
 *
 * Logos / barcodes / lines outside text boxes stay on the PDF background.
 */
export async function rebuildEditableTextLayer(
  page: PDFPageProxy,
  bgCanvas: HTMLCanvasElement | null,
  onStatus?: (msg: string) => void
): Promise<{ objects: FabricObject[]; usedOcr: boolean }> {
  onStatus?.("Reading PDF text…");
  let items = await collectPdfTextItems(page);
  const quality = textQualityScore(items.map((i) => i.text));
  let usedOcr = false;

  if (quality < 0.55 && bgCanvas) {
    onStatus?.("PDF text encoding is broken — running OCR…");
    try {
      const ocrItems = await ocrPageCanvas(bgCanvas);
      if (ocrItems.length > 0) {
        items = ocrItems.map((w) => ({
          text: w.text,
          left: w.left,
          top: w.top,
          width: w.width,
          height: w.height,
          style: w.style,
          source: "ocr" as const,
        }));
        usedOcr = true;
      }
    } catch (err) {
      console.warn("OCR failed, keeping PDF extraction", err);
    }
  }

  onStatus?.("Building editable text…");
  const objects: FabricObject[] = [];

  for (const item of items) {
    // Skip clearly broken PDF strings when we did not OCR (avoid covering with junk).
    if (
      !usedOcr &&
      item.source === "pdf" &&
      (hasHeavyMojibake(item.text) || /[\uFFFD□]/.test(item.text))
    ) {
      continue;
    }

    const cover = new Rect({
      left: item.left - 1,
      top: item.top - 1,
      width: item.width + 2,
      height: item.height + 2,
      fill: "#ffffff",
      strokeWidth: 0,
      selectable: false,
      evented: false,
    });
    tag(cover, "erase");

    const text = new IText(item.text, {
      left: item.left,
      top: item.top,
      fontSize: item.style.fontSize,
      fill: item.style.fill,
      fontFamily: item.style.fontFamily,
      fontWeight: item.style.fontWeight,
      fontStyle: item.style.fontStyle,
      backgroundColor: "#ffffff",
      padding: 0,
    });
    tag(text, "pdfText");

    objects.push(cover, text);
  }

  return { objects, usedOcr };
}

/**
 * Turn a leftover text hit-box into an editable IText (legacy path).
 */
export function activatePdfTextHit(canvas: Canvas, hit: FabricObject): IText {
  const bound = hit.getBoundingRect();
  const tagged = hit as Tagged;
  const fontSize = tagged.fontSizeHint ?? Math.max(10, bound.height * 0.7);
  const guess = tagged.extractedText ?? "";
  const looksBroken = /[\uFFFD□]/.test(guess) || hasHeavyMojibake(guess);
  const initial = looksBroken ? "" : guess;

  const text = new IText(initial, {
    left: bound.left,
    top: bound.top,
    fontSize,
    fill: "#111827",
    fontFamily: "Helvetica, Arial, sans-serif",
    fontWeight: "normal",
    backgroundColor: "#ffffff",
    padding: 1,
  });
  if (bound.width > 0) text.set({ width: bound.width });
  tag(text, "pdfText");

  canvas.remove(hit);
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
          fill: "#ffffff",
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
          backgroundColor: "rgba(219,234,254,0.35)",
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

/** @deprecated hit-box extraction replaced by rebuildEditableTextLayer */
export async function extractPageText(page: PDFPageProxy): Promise<FabricObject[]> {
  const items = await collectPdfTextItems(page);
  return items.map((item) => {
    const hit = new Rect({
      left: item.left,
      top: item.top,
      width: item.width,
      height: item.height,
      fill: "rgba(59, 130, 246, 0.04)",
      stroke: "rgba(59, 130, 246, 0)",
      strokeWidth: 1,
      hoverCursor: "text",
    });
    const tagged = hit as Tagged;
    tagged.extractedText = item.text;
    tagged.fontSizeHint = item.style.fontSize;
    tag(hit, "pdfTextHit");
    return hit;
  });
}
