import { DESIGN_SCALE } from "./pdf";
import { getCanvas } from "./fabricRegistry";
import { useEditorStore } from "../store/editorStore";

/** Extra resolution for exported images relative to the design canvas. */
const IMAGE_SCALE = DESIGN_SCALE * 2;

export type ImageFormat = "png" | "jpeg";

/**
 * Export every page as an image: re-render the PDF page background with pdf.js
 * at high resolution, composite the Fabric overlay on top, and download. A
 * multi-page document produces one file per page.
 */
export async function exportPagesAsImages(
  format: ImageFormat,
  baseName: string
) {
  const { pdfDoc, pages } = useEditorStore.getState();
  if (!pdfDoc) return;

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

    const mime = format === "png" ? "image/png" : "image/jpeg";
    const ext = format === "png" ? "png" : "jpg";
    const dataUrl = out.toDataURL(mime, 0.92);
    const suffix = pages.length > 1 ? `-page-${i + 1}` : "";
    downloadDataUrl(dataUrl, `${baseName}${suffix}.${ext}`);
  }
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
