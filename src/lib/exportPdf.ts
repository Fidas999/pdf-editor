import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { FabricObject, IText } from "fabric";
import { getCanvas } from "./fabricRegistry";
import { dataUrlToBytes, downloadFiles, type NamedFile } from "./download";
import { getContentKind } from "./extractContent";
import { useEditorStore } from "../store/editorStore";
import { DESIGN_SCALE } from "./pdf";
import {
  findFontByCssFamily,
  findFontById,
  type CatalogFont,
  type PdfStandardFont,
} from "./fontCatalog";

/** Extra resolution when flattening non-text layers into the output PDF. */
const EXPORT_MULTIPLIER = 2;

const TEXT_KINDS = new Set(["text", "pdfText", "formField"]);

interface TextExportItem {
  text: string;
  left: number;
  top: number;
  fontSize: number;
  fontFamily: string;
  fontId?: string;
  fontWeight: string;
  fontStyle: string;
  fill: string;
  textAlign: string;
}

/**
 * Build a hybrid PDF: raster page without editable text, then vector text
 * drawn with embedded / standard fonts via pdf-lib.
 */
export async function buildFlatPdf(): Promise<Uint8Array> {
  const { pages } = useEditorStore.getState();
  const pdfDoc = await PDFDocument.create();
  const fontCache = new Map<string, PDFFont>();

  for (let i = 0; i < pages.length; i++) {
    const info = pages[i];
    const page = pdfDoc.addPage([info.width, info.height]);
    const canvas = getCanvas(i);
    if (!canvas) continue;

    const textObjs = canvas
      .getObjects()
      .filter((o) => TEXT_KINDS.has(getContentKind(o) ?? ""));
    const hits = canvas
      .getObjects()
      .filter((o) => getContentKind(o) === "pdfTextHit");

    const textSnapshot: TextExportItem[] = textObjs.map((o) => snapshotText(o));

    // Hide interactive overlays + editable text for clean raster background
    for (const h of hits) h.set({ visible: false });
    for (const t of textObjs) t.set({ visible: false });

    const active = canvas.getActiveObject();
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    const dataUrl = canvas.toDataURL({
      format: "png",
      multiplier: EXPORT_MULTIPLIER,
    });

    for (const h of hits) h.set({ visible: true });
    for (const t of textObjs) t.set({ visible: true });
    if (active) canvas.setActiveObject(active);
    canvas.requestRenderAll();

    const png = await pdfDoc.embedPng(dataUrlToBytes(dataUrl));
    page.drawImage(png, {
      x: 0,
      y: 0,
      width: info.width,
      height: info.height,
    });

    for (const item of textSnapshot) {
      await drawVectorText(pdfDoc, page, item, info.height, fontCache);
    }
  }

  return pdfDoc.save();
}

function snapshotText(obj: FabricObject): TextExportItem {
  const t = obj as IText & { fontId?: string };
  return {
    text: String(t.text ?? ""),
    left: t.left ?? 0,
    top: t.top ?? 0,
    fontSize: (t.fontSize as number) ?? 12,
    fontFamily: (t.fontFamily as string) ?? "Helvetica",
    fontId: t.fontId,
    fontWeight: String(t.fontWeight ?? "normal"),
    fontStyle: String(t.fontStyle ?? "normal"),
    fill: String(t.fill ?? "#111827"),
    textAlign: String(t.textAlign ?? "left"),
  };
}

async function drawVectorText(
  pdfDoc: PDFDocument,
  page: PDFPage,
  item: TextExportItem,
  pageHeightPt: number,
  fontCache: Map<string, PDFFont>
) {
  if (!item.text.trim()) return;

  const scale = 1 / DESIGN_SCALE;
  const fontSizePt = item.fontSize * scale;
  const x = item.left * scale;
  // Fabric Y is top-down; PDF Y is bottom-up. Use top + ascent approx.
  const y = pageHeightPt - (item.top + item.fontSize * 0.85) * scale;

  const font = await resolveFont(pdfDoc, item, fontCache);
  const color = parseRgb(item.fill);

  const lines = item.text.split(/\r?\n/);
  let lineY = y;
  for (const line of lines) {
    let drawX = x;
    if (item.textAlign === "center" || item.textAlign === "right") {
      const w = font.widthOfTextAtSize(line, fontSizePt);
      if (item.textAlign === "center") drawX = x - w / 2;
      else drawX = x - w;
    }
    page.drawText(line, {
      x: drawX,
      y: lineY,
      size: fontSizePt,
      font,
      color,
    });
    lineY -= fontSizePt * 1.2;
  }
}

async function resolveFont(
  pdfDoc: PDFDocument,
  item: TextExportItem,
  cache: Map<string, PDFFont>
): Promise<PDFFont> {
  const catalog =
    (item.fontId ? findFontById(item.fontId) : undefined) ??
    findFontByCssFamily(item.fontFamily);

  const bold = /bold|700|800|900/i.test(item.fontWeight);
  const italic = /italic|oblique/i.test(item.fontStyle);
  const cacheKey = `${catalog?.id ?? "helvetica"}:${bold}:${italic}`;

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  let font: PDFFont;

  if (catalog?.embedUrl && !catalog.pdfStandard) {
    try {
      font = await embedCatalogFont(pdfDoc, catalog, cacheKey);
    } catch (err) {
      console.warn("Font embed failed, using standard", catalog.id, err);
      font = await embedStandard(pdfDoc, catalog?.pdfStandard ?? "Helvetica", bold, italic);
    }
  } else {
    font = await embedStandard(
      pdfDoc,
      catalog?.pdfStandard ?? "Helvetica",
      bold,
      italic
    );
  }

  cache.set(cacheKey, font);
  return font;
}

const embedBytesCache = new Map<string, ArrayBuffer>();

async function embedCatalogFont(
  pdfDoc: PDFDocument,
  catalog: CatalogFont,
  cacheKey: string
): Promise<PDFFont> {
  if (!catalog.embedUrl) {
    return embedStandard(pdfDoc, "Helvetica", false, false);
  }
  let bytes = embedBytesCache.get(catalog.embedUrl);
  if (!bytes) {
    const res = await fetch(catalog.embedUrl);
    if (!res.ok) throw new Error(`Failed to fetch font ${catalog.id}`);
    bytes = await res.arrayBuffer();
    embedBytesCache.set(catalog.embedUrl, bytes);
  }
  const font = await pdfDoc.embedFont(bytes, { subset: true });
  // Note: single weight file; bold/italic simulated by standard fallback if needed
  void cacheKey;
  return font;
}

async function embedStandard(
  pdfDoc: PDFDocument,
  name: PdfStandardFont,
  bold: boolean,
  italic: boolean
): Promise<PDFFont> {
  let std = StandardFonts.Helvetica;
  if (name === "TimesRoman") {
    if (bold && italic) std = StandardFonts.TimesRomanBoldItalic;
    else if (bold) std = StandardFonts.TimesRomanBold;
    else if (italic) std = StandardFonts.TimesRomanItalic;
    else std = StandardFonts.TimesRoman;
  } else if (name === "Courier") {
    if (bold && italic) std = StandardFonts.CourierBoldOblique;
    else if (bold) std = StandardFonts.CourierBold;
    else if (italic) std = StandardFonts.CourierOblique;
    else std = StandardFonts.Courier;
  } else {
    if (bold && italic) std = StandardFonts.HelveticaBoldOblique;
    else if (bold) std = StandardFonts.HelveticaBold;
    else if (italic) std = StandardFonts.HelveticaOblique;
    else std = StandardFonts.Helvetica;
  }
  return pdfDoc.embedFont(std);
}

function parseRgb(color: string) {
  const hex = toHex(color);
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return rgb(
    Number.isFinite(r) ? r : 0,
    Number.isFinite(g) ? g : 0,
    Number.isFinite(b) ? b : 0
  );
}

function toHex(color: string): string {
  if (color.startsWith("#") && color.length >= 7) return color.slice(0, 7);
  if (typeof document === "undefined") return "#111827";
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return "#111827";
  ctx.fillStyle = color;
  const v = ctx.fillStyle;
  return v.startsWith("#") ? v.slice(0, 7) : "#111827";
}

/** Export one PDF file per page (ZIP if combined size > 1MB). */
export async function downloadEditedPdf(baseName: string) {
  const flat = await buildFlatPdf();
  const edited = await PDFDocument.load(flat);
  const pageCount = edited.getPageCount();
  const files: NamedFile[] = [];

  for (let i = 0; i < pageCount; i++) {
    const single = await PDFDocument.create();
    const [copied] = await single.copyPages(edited, [i]);
    single.addPage(copied);
    const bytes = await single.save();
    const name =
      pageCount === 1 ? `${baseName}.pdf` : `${baseName}-page-${i + 1}.pdf`;
    files.push({ name, bytes, mime: "application/pdf" });
  }

  await downloadFiles(files, `${baseName}-pages`);
}
