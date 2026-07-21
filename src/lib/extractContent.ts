import { Rect, IText, type FabricObject } from "fabric";
import { PDFDocument } from "pdf-lib";
import type { PDFPageProxy } from "pdfjs-dist";
import { pdfjsLib, DESIGN_SCALE } from "./pdf";
import { tag, type ObjectKind } from "./createObject";

type Tagged = FabricObject & {
  kind?: ObjectKind;
  formName?: string;
};

/**
 * Extract selectable/editable text from a pdf.js page into Fabric IText objects.
 * Each item gets a white background so the original glyphs are covered while
 * editing; deleting the object leaves an erase rect so the original stays gone.
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
    const width = Math.max(fontSize * 0.4, (item.width || 0) * scaleX);
    const left = m[4];
    // m[5] is baseline; Fabric IText top is near the top of the em box.
    const top = m[5] - fontSize * 0.85;

    const text = new IText(str, {
      left,
      top,
      fontSize,
      fill: "#111827",
      fontFamily: "Helvetica, Arial, sans-serif",
      backgroundColor: "#ffffff",
      padding: 1,
    });
    if (width > 0 && text.width && text.width < width * 0.85) {
      text.set({ scaleX: width / text.width });
    }
    tag(text, "pdfText");
    objects.push(text);
  }

  return objects;
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
