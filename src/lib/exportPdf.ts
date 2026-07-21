import { PDFDocument } from "pdf-lib";
import { getCanvas } from "./fabricRegistry";
import { dataUrlToBytes, downloadFiles, type NamedFile } from "./download";
import { getContentKind } from "./extractContent";
import { useEditorStore } from "../store/editorStore";

/** Extra resolution when flattening the editor canvas into the output PDF. */
const EXPORT_MULTIPLIER = 2;

/**
 * Build a brand-new flat PDF from the editor canvases only (no original PDF
 * content underneath). Each page is the WYSIWYG raster of the editable document.
 */
export async function buildFlatPdf(): Promise<Uint8Array> {
  const { pages } = useEditorStore.getState();
  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < pages.length; i++) {
    const info = pages[i];
    const page = pdfDoc.addPage([info.width, info.height]);
    const canvas = getCanvas(i);
    if (!canvas) continue;

    const hits = canvas
      .getObjects()
      .filter((o) => getContentKind(o) === "pdfTextHit");
    for (const h of hits) h.set({ visible: false });

    const active = canvas.getActiveObject();
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    const dataUrl = canvas.toDataURL({
      format: "png",
      multiplier: EXPORT_MULTIPLIER,
    });

    for (const h of hits) h.set({ visible: true });
    if (active) {
      canvas.setActiveObject(active);
    }
    canvas.requestRenderAll();

    const png = await pdfDoc.embedPng(dataUrlToBytes(dataUrl));
    page.drawImage(png, {
      x: 0,
      y: 0,
      width: info.width,
      height: info.height,
    });
  }

  return pdfDoc.save();
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
