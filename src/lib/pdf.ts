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

/** Keep in sync with the installed pdfjs-dist version. */
const PDFJS_VERSION =
  (pdfjsLib as { version?: string }).version ?? "4.10.38";

export interface PageInfo {
  /** width in PDF points (scale = 1) */
  width: number;
  /** height in PDF points (scale = 1) */
  height: number;
}

export async function loadPdf(bytes: Uint8Array) {
  // pdf.js transfers/detaches the buffer, so hand it a copy.
  // cMap + standardFontData improve glyph→Unicode mapping and substitute fonts.
  // Note: many PDFs still use custom encodings without a ToUnicode map; those
  // cannot be recovered as correct text (not a UTF-8 issue).
  const doc = await pdfjsLib.getDocument({
    data: bytes.slice(),
    cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/standard_fonts/`,
  }).promise;
  const pages: PageInfo[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({ width: viewport.width, height: viewport.height });
  }
  return { doc, pages };
}
