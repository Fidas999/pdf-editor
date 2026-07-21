import { createWorker, type Worker } from "tesseract.js";
import {
  estimateBoldFromPixels,
  styleFromFontName,
  type TextStyle,
} from "./textStyle";

export interface OcrWord {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  style: TextStyle;
}

let sharedWorker: Worker | null = null;

async function getWorker(): Promise<Worker> {
  if (sharedWorker) return sharedWorker;
  // Portuguese + English — fits insurance / business PDFs like the user's sample.
  sharedWorker = await createWorker("por+eng", 1, {
    logger: () => undefined,
  });
  return sharedWorker;
}

/**
 * OCR a cropped region of the rendered page (used when PDF text extraction
 * is garbled — only for the box the user double-clicked).
 */
export async function ocrRegion(
  pageCanvas: HTMLCanvasElement,
  left: number,
  top: number,
  width: number,
  height: number
): Promise<string> {
  const pad = 3;
  const x = Math.max(0, Math.floor(left - pad));
  const y = Math.max(0, Math.floor(top - pad));
  const w = Math.max(
    4,
    Math.min(Math.ceil(width + pad * 2), pageCanvas.width - x)
  );
  const h = Math.max(
    4,
    Math.min(Math.ceil(height + pad * 2), pageCanvas.height - y)
  );

  const crop = document.createElement("canvas");
  crop.width = w;
  crop.height = h;
  const ctx = crop.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(pageCanvas, x, y, w, h, 0, 0, w, h);

  const worker = await getWorker();
  const result = await worker.recognize(crop);
  return (result.data.text || "").replace(/\s+/g, " ").trim();
}

/**
 * OCR a full rendered page canvas (optional / advanced use).
 */
export async function ocrPageCanvas(
  canvas: HTMLCanvasElement
): Promise<OcrWord[]> {
  const worker = await getWorker();
  const result = await worker.recognize(canvas);
  const ctx = canvas.getContext("2d");
  const words: OcrWord[] = [];

  const rawWords =
    (
      result.data as unknown as {
        words?: Array<{
          text: string;
          confidence: number;
          bbox: { x0: number; y0: number; x1: number; y1: number };
        }>;
      }
    ).words ?? [];

  for (const w of rawWords) {
    const text = (w.text || "").trim();
    if (!text || text.length === 0) continue;
    if (w.confidence < 35) continue;

    const left = w.bbox.x0;
    const top = w.bbox.y0;
    const width = Math.max(4, w.bbox.x1 - w.bbox.x0);
    const height = Math.max(4, w.bbox.y1 - w.bbox.y0);
    const fontSize = Math.max(8, height * 0.85);
    const bold =
      ctx != null
        ? estimateBoldFromPixels(ctx, left, top, width, height)
        : false;

    const base = styleFromFontName(bold ? "OCR-Bold" : "OCR", fontSize);
    words.push({
      text,
      left,
      top,
      width,
      height,
      style: {
        ...base,
        fontWeight: bold ? "bold" : "normal",
        fontSize,
      },
    });
  }

  return words;
}
