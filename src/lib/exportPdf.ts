import { PDFDocument } from "pdf-lib";
import { getCanvas } from "./fabricRegistry";
import { dataUrlToBytes, downloadFiles, type NamedFile } from "./download";

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

/**
 * Build the edited PDF, then split it into one unique single-page PDF per page.
 * If there is more than one page and the combined size exceeds 1MB, the pages
 * are downloaded as a single ZIP; otherwise each page PDF is downloaded.
 */
export async function downloadEditedPdf(
  originalBytes: Uint8Array,
  pageCount: number,
  baseName: string
) {
  const editedBytes = await buildEditedPdf(originalBytes, pageCount);
  const edited = await PDFDocument.load(editedBytes);
  const files: NamedFile[] = [];

  for (let i = 0; i < pageCount; i++) {
    const single = await PDFDocument.create();
    const [copied] = await single.copyPages(edited, [i]);
    single.addPage(copied);
    const bytes = await single.save();
    const name =
      pageCount === 1
        ? `${baseName}.pdf`
        : `${baseName}-page-${i + 1}.pdf`;
    files.push({
      name,
      bytes,
      mime: "application/pdf",
    });
  }

  await downloadFiles(files, `${baseName}-pages`);
}
