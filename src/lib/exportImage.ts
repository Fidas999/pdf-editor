import { DESIGN_SCALE } from "./pdf";
import { getCanvas } from "./fabricRegistry";
import { useEditorStore } from "../store/editorStore";
import {
  dataUrlToBytes,
  downloadFiles,
  type NamedFile,
} from "./download";

/** Extra resolution for exported images relative to the design canvas. */
const IMAGE_SCALE = DESIGN_SCALE * 2;

export type ImageFormat = "png" | "jpeg";

/**
 * Export every page as an image: re-render the PDF page background with pdf.js
 * at high resolution, composite the Fabric overlay on top, and download.
 * One unique file per page. If total size exceeds 1MB, pages are zipped.
 */
export async function exportPagesAsImages(
  format: ImageFormat,
  baseName: string
) {
  const { pdfDoc, pages } = useEditorStore.getState();
  if (!pdfDoc) return;

  const mime = format === "png" ? "image/png" : "image/jpeg";
  const ext = format === "png" ? "png" : "jpg";
  const files: NamedFile[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = await pdfDoc.getPage(i + 1);
    const viewport = page.getViewport({ scale: IMAGE_SCALE });

    const out = document.createElement("canvas");
    out.width = Math.round(viewport.width);
    out.height = Math.round(viewport.height);
    const ctx = out.getContext("2d");
    if (!ctx) continue;

    if (format === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, out.width, out.height);
    }

    await page.render({ canvasContext: ctx, viewport }).promise;

    const canvas = getCanvas(i);
    if (canvas && canvas.getObjects().length > 0) {
      const active = canvas.getActiveObject();
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      const overlayEl = canvas.toCanvasElement(IMAGE_SCALE / DESIGN_SCALE);
      ctx.drawImage(overlayEl, 0, 0, out.width, out.height);
      if (active) {
        canvas.setActiveObject(active);
        canvas.requestRenderAll();
      }
    }

    const dataUrl = out.toDataURL(mime, 0.92);
    const suffix = pages.length > 1 ? `-page-${i + 1}` : "";
    files.push({
      name: `${baseName}${suffix}.${ext}`,
      bytes: dataUrlToBytes(dataUrl),
      mime,
    });
  }

  await downloadFiles(files, `${baseName}-pages`);
}
