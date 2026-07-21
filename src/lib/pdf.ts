import * as pdfjsLib from "pdfjs-dist";
// Vite resolves this to a hashed URL for the worker bundle.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };

/**
 * Render scale used for the on-screen canvases. Object coordinates live in this
 * pixel space; user zoom is applied purely as a CSS transform so coordinates
 * never change. Export divides by this factor to convert back to PDF points.
 */
export const DESIGN_SCALE = 1.5;

export interface PageInfo {
  /** width in PDF points (scale = 1) */
  width: number;
  /** height in PDF points (scale = 1) */
  height: number;
}

export async function loadPdf(bytes: Uint8Array) {
  // pdf.js transfers/detaches the buffer, so hand it a copy.
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const pages: PageInfo[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({ width: viewport.width, height: viewport.height });
  }
  return { doc, pages };
}
