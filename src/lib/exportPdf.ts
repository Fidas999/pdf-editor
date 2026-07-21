import { PDFDocument } from "pdf-lib";
import { getCanvas } from "./fabricRegistry";

/**
 * Multiplier applied when rasterizing each overlay canvas for export. The
 * overlay canvases already render at DESIGN_SCALE; this adds extra resolution
 * so stamped annotations stay crisp in the output PDF.
 */
const EXPORT_MULTIPLIER = 2;

/**
 * Merge every page's Fabric overlay onto the original PDF and return the bytes.
 *
 * Each overlay canvas is transparent except for the objects the user added, so
 * stamping it full-page over the original preserves the existing content and
 * lays the edits on top. Rasterizing guarantees that shapes, tables, images,
 * text, rotations and scaling all reproduce exactly as shown on screen.
 */
export async function buildEditedPdf(
  originalBytes: Uint8Array,
  pageCount: number
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBytes);
  const pages = pdfDoc.getPages();

  for (let i = 0; i < pageCount; i++) {
    const canvas = getCanvas(i);
    if (!canvas) continue;
    if (canvas.getObjects().length === 0) continue;

    // Don't bake selection handles into the export.
    const active = canvas.getActiveObject();
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    const dataUrl = canvas.toDataURL({
      format: "png",
      multiplier: EXPORT_MULTIPLIER,
    });

    if (active) {
      canvas.setActiveObject(active);
      canvas.requestRenderAll();
    }

    const pngBytes = dataUrlToBytes(dataUrl);
    const png = await pdfDoc.embedPng(pngBytes);
    const page = pages[i];
    const { width, height } = page.getSize();
    page.drawImage(png, { x: 0, y: 0, width, height });
  }

  return pdfDoc.save();
}

export async function downloadEditedPdf(
  originalBytes: Uint8Array,
  pageCount: number,
  fileName: string
) {
  const bytes = await buildEditedPdf(originalBytes, pageCount);
  // Copy into a fresh ArrayBuffer to satisfy the Blob type across TS DOM libs.
  const buffer = new Uint8Array(bytes).slice().buffer;
  const blob = new Blob([buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
