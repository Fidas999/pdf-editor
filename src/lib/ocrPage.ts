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
    // Keep logs quiet in the UI console.
    logger: () => undefined,
  });
  return sharedWorker;
}

/**
 * OCR a rendered page canvas to recover real text when PDF extraction is garbled.
 * Also estimates bold from ink density in each word box.
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
