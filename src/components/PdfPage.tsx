import { useEffect, useRef } from "react";
import {
  Canvas,
  FabricImage,
  Rect,
  type TPointerEventInfo,
  type TPointerEvent,
} from "fabric";
import { DESIGN_SCALE } from "../lib/pdf";
import { registerCanvas, unregisterCanvas } from "../lib/fabricRegistry";
import { history } from "../lib/history";
import { useEditorStore } from "../store/editorStore";
import {
  createEllipse,
  createRect,
  createRoundRect,
  createTable,
  createText,
  tag,
} from "../lib/createObject";
import {
  createEraseDraft,
  extractFormFields,
  extractPageText,
  tagContent,
} from "../lib/extractContent";
import type { RenderTask } from "pdfjs-dist";

interface Props {
  pageIndex: number;
  width: number; // PDF points
  height: number; // PDF points
}

export default function PdfPage({ pageIndex, width, height }: Props) {
  const bgRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const eraseDraft = useRef<Rect | null>(null);
  const eraseOrigin = useRef<{ x: number; y: number } | null>(null);

  const zoom = useEditorStore((s) => s.zoom);
  const pdfDoc = useEditorStore((s) => s.pdfDoc);

  const designW = Math.round(width * DESIGN_SCALE);
  const designH = Math.round(height * DESIGN_SCALE);

  // Render the PDF page into the background canvas.
  useEffect(() => {
    if (!pdfDoc || !bgRef.current) return;
    let task: RenderTask | null = null;
    let cancelled = false;

    (async () => {
      const page = await pdfDoc.getPage(pageIndex + 1);
      if (cancelled || !bgRef.current) return;
      const viewport = page.getViewport({ scale: DESIGN_SCALE });
      const canvas = bgRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      task = page.render({ canvasContext: ctx, viewport });
      try {
        await task.promise;
      } catch {
        /* render cancelled */
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdfDoc, pageIndex]);

  // Initialise the Fabric overlay once and wire up interaction.
  useEffect(() => {
    if (!overlayRef.current) return;
    const canvas = new Canvas(overlayRef.current, {
      width: designW,
      height: designH,
      preserveObjectStacking: true,
      selection: true,
    });
    fabricRef.current = canvas;
    registerCanvas(pageIndex, canvas);

    const syncSelection = () => {
      const obj = canvas.getActiveObject() ?? null;
      useEditorStore.getState().setSelected(obj, obj ? pageIndex : null);
    };

    const handleMouseDown = (opt: TPointerEventInfo<TPointerEvent>) => {
      useEditorStore.getState().setActivePage(pageIndex);
      const tool = useEditorStore.getState().activeTool;

      if (tool === "erase") {
        const p = canvas.getScenePoint(opt.e);
        eraseOrigin.current = { x: p.x, y: p.y };
        const draft = createEraseDraft(p.x, p.y);
        eraseDraft.current = draft;
        history.beginSuppress();
        canvas.add(draft);
        canvas.selection = false;
        canvas.discardActiveObject();
        return;
      }

      if (tool === "select" || tool === "image") return;

      const p = canvas.getScenePoint(opt.e);
      const style = useEditorStore.getState().style;
      let obj;
      switch (tool) {
        case "text":
          obj = createText(p.x, p.y, style);
          break;
        case "rect":
          obj = createRect(p.x - 70, p.y - 50, style);
          break;
        case "roundRect":
          obj = createRoundRect(p.x - 70, p.y - 50, style);
          break;
        case "ellipse":
          obj = createEllipse(p.x - 70, p.y - 70, style);
          break;
        case "table":
          obj = createTable(p.x - 120, p.y - 75, style);
          break;
        default:
          return;
      }
      canvas.add(obj);
      canvas.setActiveObject(obj);
      canvas.requestRenderAll();
      useEditorStore.getState().setActiveTool("select");
      if (tool === "text" && "enterEditing" in obj) {
        const it = obj as unknown as {
          enterEditing: () => void;
          selectAll: () => void;
        };
        it.enterEditing();
        it.selectAll();
      }
      useEditorStore.getState().setSelected(obj, pageIndex);
    };

    const handleMouseMove = (opt: TPointerEventInfo<TPointerEvent>) => {
      const draft = eraseDraft.current;
      const origin = eraseOrigin.current;
      if (!draft || !origin) return;
      const p = canvas.getScenePoint(opt.e);
      const left = Math.min(origin.x, p.x);
      const top = Math.min(origin.y, p.y);
      const w = Math.abs(p.x - origin.x);
      const h = Math.abs(p.y - origin.y);
      draft.set({ left, top, width: Math.max(1, w), height: Math.max(1, h) });
      draft.setCoords();
      canvas.requestRenderAll();
    };

    const finishErase = () => {
      const draft = eraseDraft.current;
      if (!draft) return;
      history.endSuppress();
      const w = draft.width ?? 0;
      const h = draft.height ?? 0;
      if (w < 4 && h < 4) {
        canvas.remove(draft);
      } else {
        draft.set({
          stroke: "#e5e7eb",
          strokeDashArray: undefined,
          opacity: 1,
          selectable: true,
          evented: true,
        });
        tagContent(draft, "erase");
        canvas.sendObjectToBack(draft);
        history.record();
      }
      eraseDraft.current = null;
      eraseOrigin.current = null;
      canvas.selection = true;
      canvas.requestRenderAll();
    };

    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:up", finishErase);
    canvas.on("selection:created", syncSelection);
    canvas.on("selection:updated", syncSelection);
    canvas.on("selection:cleared", () => {
      const s = useEditorStore.getState();
      if (s.selectedPage === pageIndex) s.setSelected(null, null);
    });
    canvas.on("object:modified", () => {
      useEditorStore.getState().bumpSelection();
      history.record();
    });
    canvas.on("object:added", () => history.record());
    canvas.on("object:removed", () => history.record());

    // Load extracted PDF text + form fields as editable objects.
    let cancelled = false;
    (async () => {
      const doc = useEditorStore.getState().pdfDoc;
      const bytes = useEditorStore.getState().pdfBytes;
      if (!doc) return;
      history.beginSuppress();
      try {
        const page = await doc.getPage(pageIndex + 1);
        if (cancelled) return;
        const texts = await extractPageText(page);
        if (cancelled) return;
        for (const obj of texts) canvas.add(obj);

        if (bytes) {
          const forms = await extractFormFields(
            bytes,
            pageIndex,
            width,
            height
          );
          if (cancelled) return;
          for (const obj of forms) canvas.add(obj);
        }
        canvas.requestRenderAll();
      } catch (err) {
        console.warn("Content extraction failed", err);
      } finally {
        history.endSuppress();
        if (!cancelled) history.record();
      }
    })();

    return () => {
      cancelled = true;
      unregisterCanvas(pageIndex);
      canvas.dispose();
      fabricRef.current = null;
    };
  }, [pageIndex, designW, designH, width, height]);

  // Accept image files dropped directly onto the page.
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const canvas = fabricRef.current;
    if (!canvas) return;
    const file = Array.from(e.dataTransfer.files).find((f) =>
      f.type.startsWith("image/")
    );
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = await FabricImage.fromURL(url);
    const p = canvas.getScenePoint(e.nativeEvent);
    const maxW = designW * 0.6;
    if (img.width && img.width > maxW) img.scaleToWidth(maxW);
    img.set({ left: p.x, top: p.y, originX: "center", originY: "center" });
    tag(img, "image");
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
    useEditorStore.getState().setActivePage(pageIndex);
    useEditorStore.getState().setSelected(img, pageIndex);
  };

  return (
    <div
      className="relative mx-auto my-6 shadow-2xl"
      style={{ width: designW * zoom, height: designH * zoom }}
    >
      <div className="absolute left-1 -top-5 text-xs text-neutral-500 select-none">
        Page {pageIndex + 1}
      </div>
      <div
        style={{
          width: designW,
          height: designH,
          transform: `scale(${zoom})`,
          transformOrigin: "top left",
        }}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <canvas
          ref={bgRef}
          className="absolute top-0 left-0 bg-white"
          style={{ width: designW, height: designH }}
        />
        <canvas ref={overlayRef} className="absolute top-0 left-0" />
      </div>
    </div>
  );
}
