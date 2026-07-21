import { Rect, IText, type FabricObject, type Canvas } from "fabric";
import { PDFDocument } from "pdf-lib";
import type { PDFPageProxy } from "pdfjs-dist";
import { pdfjsLib, DESIGN_SCALE } from "./pdf";
import { tag, type ObjectKind } from "./createObject";

type Tagged = FabricObject & {
  kind?: ObjectKind;
  formName?: string;
  extractedText?: string;
  fontSizeHint?: number;
};

/**
 * Extract text *regions* from a pdf.js page as nearly-invisible hit boxes.
 *
 * We deliberately do NOT paint the extracted strings over the page: many PDFs
 * (insurance forms, etc.) use custom font encodings where getTextContent()
 * returns wrong characters even though the page renders correctly. Covering
 * the page with those strings looked like a "UTF-8 bug". Instead the user
 * double-clicks a region to edit it.
 */
export async function extractPageText(
  page: PDFPageProxy
): Promise<FabricObject[]> {
  const viewport = page.getViewport({ scale: DESIGN_SCALE });
  const content = await page.getTextContent();
  const objects: FabricObject[] = [];

  for (const raw of content.items) {
    if (!("str" in raw)) continue;
    const item = raw as {
      str: string;
      transform: number[];
      width: number;
      height: number;
    };
    const str = item.str;
    if (!str || !str.trim()) continue;

    const m = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontSize = Math.max(6, Math.hypot(m[2], m[3]));
    const scaleX = Math.hypot(m[0], m[1]);
    const width = Math.max(fontSize * 0.5, (item.width || 0) * scaleX);
    const height = Math.max(fontSize * 0.9, fontSize);
    const left = m[4];
    const top = m[5] - fontSize * 0.85;

    const hit = new Rect({
      left,
      top,
      width,
      height,
      // Almost invisible — original PDF stays visible underneath.
      fill: "rgba(59, 130, 246, 0.04)",
      stroke: "rgba(59, 130, 246, 0)",
      strokeWidth: 1,
      hoverCursor: "text",
    });
    const tagged = hit as Tagged;
    tagged.extractedText = str;
    tagged.fontSizeHint = fontSize;
    tag(hit, "pdfTextHit");
    objects.push(hit);
  }

  return objects;
}

/**
 * Turn a text hit-box into an editable IText with a white cover so the
 * original glyphs disappear while the user types the replacement.
 */
export function activatePdfTextHit(canvas: Canvas, hit: FabricObject): IText {
  const bound = hit.getBoundingRect();
  const tagged = hit as Tagged;
  const fontSize = tagged.fontSizeHint ?? Math.max(10, bound.height * 0.7);
  // Prefer empty string when extracted text looks like mojibake / tofu —
  // user can type the correct value from what they see on the page.
  const guess = tagged.extractedText ?? "";
  const looksBroken = /[\uFFFD□]/.test(guess) || hasHeavyMojibake(guess);
  const initial = looksBroken ? "" : guess;

  const text = new IText(initial, {
    left: bound.left,
    top: bound.top,
    fontSize,
    fill: "#111827",
    fontFamily: "Helvetica, Arial, sans-serif",
    backgroundColor: "#ffffff",
    padding: 1,
  });
  if (bound.width > 0) {
    text.set({ width: bound.width });
  }
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

/** Heuristic: lots of Latin-1 symbols / control-ish chars → bad extraction. */
function hasHeavyMojibake(s: string): boolean {
  if (s.length < 2) return false;
  let weird = 0;
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    // Private use, replacement, or common mojibake punctuation blocks
    if (
      (code >= 0x80 && code <= 0xff && !/[àáâãäåèéêëìíîïòóôõöùúûüçñÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑ]/.test(ch)) ||
      (code >= 0x2000 && code <= 0x206f)
    ) {
      weird++;
    }
  }
  return weird / s.length > 0.35;
}

/**
 * Create editable overlays for AcroForm text fields on a page.
 * Coordinates come from pdf-lib (PDF points, origin bottom-left).
 */
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

/** White erase rectangle covering an object's axis-aligned bounding box. */
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

/** Interactive erase brush start — a live rectangle updated while dragging. */
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
