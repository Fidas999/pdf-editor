import { Line, Rect, FabricImage, type FabricObject } from "fabric";
import type { PDFPageProxy } from "pdfjs-dist";
import { pdfjsLib, DESIGN_SCALE } from "./pdf";
import { tag } from "./createObject";

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function apply(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

function waitObj<T>(objs: { get: (n: string, cb: (v: T) => void) => void }, name: string) {
  return new Promise<T>((resolve) => {
    objs.get(name, (v) => resolve(v));
  });
}

export interface ExtractedLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWidth: number;
  stroke: string;
}

export interface ExtractedImage {
  left: number;
  top: number;
  width: number;
  height: number;
  dataUrl: string;
}

/**
 * Walk the PDF page operator list and collect stroked line segments + painted images,
 * transformed into design-canvas coordinates (same space as Fabric overlay).
 */
export async function extractLinesAndImages(
  page: PDFPageProxy
): Promise<{ lines: ExtractedLine[]; images: ExtractedImage[] }> {
  const viewport = page.getViewport({ scale: DESIGN_SCALE });
  const opList = await page.getOperatorList();
  const OPS = pdfjsLib.OPS;

  const stack: Matrix[] = [];
  let ctm: Matrix = [...IDENTITY];
  let pathCurrent: { x: number; y: number } | null = null;
  let pendingSegment: { x1: number; y1: number; x2: number; y2: number } | null =
    null;
  let lineWidth = 1;
  let strokeRgb = "#111827";

  const lines: ExtractedLine[] = [];
  const imageNames: Array<{ name: string; ctm: Matrix }> = [];

  const toViewport = (x: number, y: number) => {
    // PDF user space → viewport (design) pixels
    const [vx, vy] = viewport.convertToViewportPoint(x, y);
    return { x: vx, y: vy };
  };

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i] as unknown[];

    switch (fn) {
      case OPS.save:
        stack.push([...ctm]);
        break;
      case OPS.restore:
        ctm = stack.pop() ?? [...IDENTITY];
        break;
      case OPS.transform: {
        const t = args as unknown as Matrix;
        ctm = multiply(ctm, t);
        break;
      }
      case OPS.setLineWidth:
        lineWidth = Number(args[0]) || 1;
        break;
      case OPS.setStrokeRGBColor: {
        const [r, g, b] = args as number[];
        const R = Math.round((r ?? 0) * 255);
        const G = Math.round((g ?? 0) * 255);
        const B = Math.round((b ?? 0) * 255);
        strokeRgb = `rgb(${R},${G},${B})`;
        break;
      }
      case OPS.setStrokeGray: {
        const g = Math.round(Number(args[0] ?? 0) * 255);
        strokeRgb = `rgb(${g},${g},${g})`;
        break;
      }
      case OPS.moveTo: {
        const [x, y] = args as number[];
        const p = apply(ctm, x, y);
        pathCurrent = p;
        pendingSegment = null;
        break;
      }
      case OPS.lineTo: {
        const [x, y] = args as number[];
        const p = apply(ctm, x, y);
        if (pathCurrent) {
          pendingSegment = {
            x1: pathCurrent.x,
            y1: pathCurrent.y,
            x2: p.x,
            y2: p.y,
          };
        }
        pathCurrent = p;
        break;
      }
      case OPS.rectangle: {
        const [x, y, w, h] = args as number[];
        const p1 = apply(ctm, x, y);
        const p2 = apply(ctm, x + w, y);
        const p3 = apply(ctm, x + w, y + h);
        const p4 = apply(ctm, x, y + h);
        // Defer until stroke/close — push as four segments now via helper
        const segs = [
          [p1, p2],
          [p2, p3],
          [p3, p4],
          [p4, p1],
        ] as const;
        for (const [a, b] of segs) {
          const A = toViewport(a.x, a.y);
          const B = toViewport(b.x, b.y);
          const len = Math.hypot(B.x - A.x, B.y - A.y);
          if (len < 2 || len > Math.max(viewport.width, viewport.height) * 1.2)
            continue;
          lines.push({
            x1: A.x,
            y1: A.y,
            x2: B.x,
            y2: B.y,
            strokeWidth: Math.max(0.5, lineWidth * DESIGN_SCALE),
            stroke: strokeRgb,
          });
        }
        break;
      }
      case OPS.stroke:
      case OPS.closeStroke:
      case OPS.fillStroke:
      case OPS.closeFillStroke: {
        if (pendingSegment) {
          const A = toViewport(pendingSegment.x1, pendingSegment.y1);
          const B = toViewport(pendingSegment.x2, pendingSegment.y2);
          const len = Math.hypot(B.x - A.x, B.y - A.y);
          // Keep structural lines; drop tiny noise and huge absurd strokes
          if (len >= 8 && len < Math.max(viewport.width, viewport.height) * 1.5) {
            lines.push({
              x1: A.x,
              y1: A.y,
              x2: B.x,
              y2: B.y,
              strokeWidth: Math.max(0.5, lineWidth * DESIGN_SCALE),
              stroke: strokeRgb,
            });
          }
        }
        pendingSegment = null;
        pathCurrent = null;
        break;
      }
      case OPS.endPath:
      case OPS.closePath:
        pendingSegment = null;
        break;
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject: {
        const name = String(args[0] ?? "");
        if (name) imageNames.push({ name, ctm: [...ctm] });
        break;
      }
      default:
        break;
    }
  }

  const images: ExtractedImage[] = [];
  for (const { name, ctm: imgCtm } of imageNames) {
    try {
      // Image XObjects live on page.objs
      const imgData = await waitObj<{
        width: number;
        height: number;
        kind?: number;
        data?: Uint8ClampedArray | Uint8Array;
        bitmap?: ImageBitmap;
      }>(page.objs as never, name);

      if (!imgData?.width || !imgData?.height) continue;

      // PDF image is painted in unit square [0,1]x[0,1] then transformed by CTM.
      // Corners in user space:
      const c0 = apply(imgCtm, 0, 0);
      const c1 = apply(imgCtm, 1, 0);
      const c2 = apply(imgCtm, 1, 1);
      const c3 = apply(imgCtm, 0, 1);
      const pts = [c0, c1, c2, c3].map((p) => toViewport(p.x, p.y));
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const left = Math.min(...xs);
      const top = Math.min(...ys);
      const width = Math.max(...xs) - left;
      const height = Math.max(...ys) - top;
      if (width < 4 || height < 4) continue;
      // Skip near-full-page images (often the page backdrop)
      if (width > viewport.width * 0.98 && height > viewport.height * 0.98)
        continue;

      const dataUrl = await imageDataToDataUrl(imgData);
      if (!dataUrl) continue;
      images.push({ left, top, width, height, dataUrl });
    } catch (err) {
      console.warn("Imagem PDF ignorada:", name, err);
    }
  }

  // Deduplicate nearly identical lines
  const uniqueLines = dedupeLines(lines);
  return { lines: uniqueLines, images };
}

function dedupeLines(lines: ExtractedLine[]): ExtractedLine[] {
  const out: ExtractedLine[] = [];
  for (const L of lines) {
    const dup = out.some(
      (O) =>
        Math.hypot(O.x1 - L.x1, O.y1 - L.y1) < 2 &&
        Math.hypot(O.x2 - L.x2, O.y2 - L.y2) < 2
    );
    if (!dup) out.push(L);
  }
  return out;
}

async function imageDataToDataUrl(imgData: {
  width: number;
  height: number;
  data?: Uint8ClampedArray | Uint8Array;
  bitmap?: ImageBitmap;
}): Promise<string | null> {
  const c = document.createElement("canvas");
  c.width = imgData.width;
  c.height = imgData.height;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  if (imgData.bitmap) {
    ctx.drawImage(imgData.bitmap, 0, 0);
  } else if (imgData.data) {
    const clamp =
      imgData.data instanceof Uint8ClampedArray
        ? imgData.data
        : new Uint8ClampedArray(imgData.data.buffer);
    // pdf.js often gives RGBA; if length mismatches, skip
    if (clamp.length >= imgData.width * imgData.height * 4) {
      const imageData = new ImageData(
        clamp.slice(0, imgData.width * imgData.height * 4),
        imgData.width,
        imgData.height
      );
      ctx.putImageData(imageData, 0, 0);
    } else {
      return null;
    }
  } else {
    return null;
  }
  return c.toDataURL("image/png");
}

/** Build Fabric objects (selectable/movable) for extracted lines and images. */
export async function buildLineAndImageObjects(
  page: PDFPageProxy,
  options?: { addCovers?: boolean; thinLineCoversOnly?: boolean }
): Promise<FabricObject[]> {
  const addCovers = options?.addCovers !== false;
  const thinLineCoversOnly = options?.thinLineCoversOnly === true;
  const { lines, images } = await extractLinesAndImages(page);
  const objects: FabricObject[] = [];

  for (const L of lines) {
    const line = new Line([L.x1, L.y1, L.x2, L.y2], {
      stroke: L.stroke,
      strokeWidth: Math.max(1, L.strokeWidth),
      selectable: true,
      evented: true,
    });
    tag(line, "line");

    const pad = Math.max(1.5, L.strokeWidth);
    const left = Math.min(L.x1, L.x2) - pad;
    const top = Math.min(L.y1, L.y2) - pad;
    const width = Math.abs(L.x2 - L.x1) + pad * 2;
    const height = Math.abs(L.y2 - L.y1) + pad * 2;
    const isH = Math.abs(L.y1 - L.y2) < 1.5;
    const isV = Math.abs(L.x1 - L.x2) < 1.5;

    if (addCovers && (isH || isV) && Math.hypot(L.x2 - L.x1, L.y2 - L.y1) > 12) {
      const cover = new Rect({
        left,
        top,
        width: Math.max(width, pad * 2),
        height: Math.max(height, pad * 2),
        fill: "#ffffff",
        strokeWidth: 0,
        selectable: false,
        evented: false,
      });
      tag(cover, "erase");
      objects.push(cover);
    }

    objects.push(line);
    void thinLineCoversOnly;
  }

  for (const img of images) {
    try {
      const fabricImg = await FabricImage.fromURL(img.dataUrl);
      if (addCovers) {
        const cover = new Rect({
          left: img.left,
          top: img.top,
          width: img.width,
          height: img.height,
          fill: "#ffffff",
          strokeWidth: 0,
          selectable: false,
          evented: false,
        });
        tag(cover, "erase");
        objects.push(cover);
      }
      fabricImg.set({
        left: img.left,
        top: img.top,
        scaleX: img.width / (fabricImg.width || img.width),
        scaleY: img.height / (fabricImg.height || img.height),
      });
      tag(fabricImg, "image");
      objects.push(fabricImg);
    } catch (err) {
      console.warn("Falha ao criar imagem editável", err);
    }
  }

  return objects;
}
