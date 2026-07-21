import { useEffect, useRef, useState } from "react";
import {
  Canvas,
  FabricImage,
  IText,
  Rect,
  type FabricObject,
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
  convertPageToEditable,
  activatePdfTextHit,
  tagContent,
  getContentKind,
  findPdfTextHitAt,
} from "../lib/extractContent";
import { ocrRegion } from "../lib/ocrPage";
import type { RenderTask } from "pdfjs-dist";

interface Props {
  pageIndex: number;
  width: number;
  height: number;
}

/**
 * Single-surface page editor: the document IS the Fabric canvas.
 * pdf.js is only used off-screen to import content — there is no PDF layer
 * under the editor while you work. Export writes a new flat PDF from this canvas.
 */
export default function PdfPage({ pageIndex, width, height }: Props) {
  const hostRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const snapRef = useRef<HTMLCanvasElement | null>(null);
  const eraseDraft = useRef<Rect | null>(null);
  const eraseOrigin = useRef<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState<string | null>("A importar página…");

  const zoom = useEditorStore((s) => s.zoom);
  const pdfDoc = useEditorStore((s) => s.pdfDoc);

  const designW = Math.round(width * DESIGN_SCALE);
  const designH = Math.round(height * DESIGN_SCALE);

  useEffect(() => {
    if (!pdfDoc || !hostRef.current) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    let canvas: Canvas | null = null;

    (async () => {
      const page = await pdfDoc.getPage(pageIndex + 1);
      if (cancelled || !hostRef.current) return;

      // Off-screen render — import only, never shown as a live PDF layer.
      const viewport = page.getViewport({ scale: DESIGN_SCALE });
      const off = document.createElement("canvas");
      off.width = Math.round(viewport.width);
      off.height = Math.round(viewport.height);
      const offCtx = off.getContext("2d");
      if (!offCtx) return;

      setStatus("A ler o PDF…");
      task = page.render({ canvasContext: offCtx, viewport });
      try {
        await task.promise;
      } catch {
        return;
      }
      if (cancelled) return;

      snapRef.current = off;

      canvas = new Canvas(hostRef.current, {
        width: designW,
        height: designH,
        backgroundColor: "#ffffff",
        preserveObjectStacking: true,
        selection: true,
      });
      fabricRef.current = canvas;
      registerCanvas(pageIndex, canvas);

      // The page content lives in the document (one surface), not under a PDF.
      const pageBase = await FabricImage.fromURL(off.toDataURL("image/png"));
      pageBase.set({
        left: 0,
        top: 0,
        selectable: false,
        evented: false,
        hoverCursor: "default",
      });
      tag(pageBase, "pageBase");

      const syncSelection = () => {
        const obj = canvas!.getActiveObject() ?? null;
        if (obj && getContentKind(obj) === "pageBase") {
          canvas!.discardActiveObject();
          useEditorStore.getState().setSelected(null, null);
          return;
        }
        useEditorStore.getState().setSelected(obj, obj ? pageIndex : null);
      };

      const handleDblClick = async (opt: TPointerEventInfo<TPointerEvent>) => {
        if (useEditorStore.getState().activeTool === "erase") return;
        const target = opt.target;
        const snap = snapRef.current;

        if (target && getContentKind(target) === "image") {
          const bound = target.getBoundingRect();
          history.beginSuppress();
          try {
            setStatus("A converter para texto editável…");
            const value = snap
              ? await ocrRegion(
                  snap,
                  bound.left,
                  bound.top,
                  bound.width,
                  bound.height
                )
              : "";
            const fontHint =
              (target as FabricObject & { fontSizeHint?: number })
                .fontSizeHint ?? Math.max(10, bound.height * 0.75);
            const text = new IText(value || "", {
              left: bound.left,
              top: bound.top,
              fontSize: fontHint,
              fill: "#111827",
              fontFamily: "Helvetica, Arial, sans-serif",
              backgroundColor: "#ffffff",
            });
            tag(text, "pdfText");
            canvas!.remove(target);
            canvas!.add(text);
            canvas!.setActiveObject(text);
            const ed = text as unknown as {
              enterEditing: () => void;
              selectAll: () => void;
            };
            ed.enterEditing();
            if (value) ed.selectAll();
            useEditorStore.getState().setSelected(text, pageIndex);
            setStatus("Texto editável.");
          } finally {
            history.endSuppress();
            history.record();
            window.setTimeout(() => setStatus(null), 2500);
          }
          return;
        }

        const p = canvas!.getScenePoint(opt.e);
        const hit =
          (target && getContentKind(target) === "pdfTextHit"
            ? target
            : null) || findPdfTextHitAt(canvas!, p.x, p.y);
        if (!hit) return;

        history.beginSuppress();
        try {
          const text = await activatePdfTextHit(
            canvas!,
            hit,
            snap,
            setStatus
          );
          useEditorStore.getState().setSelected(text, pageIndex);
          setStatus("A editar texto.");
          window.setTimeout(() => setStatus(null), 3000);
        } finally {
          history.endSuppress();
          history.record();
        }
      };

      const handleMouseDown = (opt: TPointerEventInfo<TPointerEvent>) => {
        useEditorStore.getState().setActivePage(pageIndex);
        const tool = useEditorStore.getState().activeTool;

        if (tool === "erase") {
          const p = canvas!.getScenePoint(opt.e);
          eraseOrigin.current = { x: p.x, y: p.y };
          const draft = createEraseDraft(p.x, p.y);
          eraseDraft.current = draft;
          history.beginSuppress();
          canvas!.add(draft);
          canvas!.selection = false;
          canvas!.discardActiveObject();
          return;
        }

        if (tool === "select" || tool === "image") return;

        const p = canvas!.getScenePoint(opt.e);
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
        canvas!.add(obj);
        canvas!.setActiveObject(obj);
        canvas!.requestRenderAll();
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
        const p = canvas!.getScenePoint(opt.e);
        const left = Math.min(origin.x, p.x);
        const top = Math.min(origin.y, p.y);
        draft.set({
          left,
          top,
          width: Math.max(1, Math.abs(p.x - origin.x)),
          height: Math.max(1, Math.abs(p.y - origin.y)),
        });
        draft.setCoords();
        canvas!.requestRenderAll();
      };

      const finishErase = () => {
        const draft = eraseDraft.current;
        if (!draft) return;
        history.endSuppress();
        const w = draft.width ?? 0;
        const h = draft.height ?? 0;
        if (w < 4 && h < 4) {
          canvas!.remove(draft);
        } else {
          draft.set({
            stroke: "#e5e7eb",
            strokeDashArray: undefined,
            opacity: 1,
            selectable: true,
            evented: true,
          });
          tagContent(draft, "erase");
          history.record();
        }
        eraseDraft.current = null;
        eraseOrigin.current = null;
        canvas!.selection = true;
        canvas!.requestRenderAll();
      };

      canvas.on("mouse:down", handleMouseDown);
      canvas.on("mouse:move", handleMouseMove);
      canvas.on("mouse:up", finishErase);
      canvas.on("mouse:dblclick", handleDblClick);
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

      history.beginSuppress();
      try {
        canvas.add(pageBase);
        canvas.sendObjectToBack(pageBase);

        const { objects, usedCrops } = await convertPageToEditable(
          page,
          off,
          (msg) => {
            if (!cancelled) setStatus(msg);
          }
        );
        if (cancelled) return;

        const covers = objects.filter((o) => getContentKind(o) === "erase");
        const rest = objects.filter((o) => getContentKind(o) !== "erase");
        for (const o of covers) {
          canvas.add(o);
          // Keep covers above pageBase but under content
        }
        for (const o of rest) canvas.add(o);
        canvas.sendObjectToBack(pageBase);
        canvas.requestRenderAll();

        setStatus(
          usedCrops
            ? "Documento carregado. Duplo-clique no texto para o editar; Exportar gera um PDF novo e plano."
            : "Documento editável. Exportar gera um PDF novo (sem layers)."
        );
        window.setTimeout(() => {
          if (!cancelled) setStatus(null);
        }, 6000);
      } catch (err) {
        console.warn(err);
        setStatus("Falha ao importar — pode editar a página base com Apagar/Texto.");
      } finally {
        history.endSuppress();
        if (!cancelled) history.record();
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
      if (canvas) {
        unregisterCanvas(pageIndex);
        canvas.dispose();
      }
      fabricRef.current = null;
      snapRef.current = null;
    };
  }, [pdfDoc, pageIndex, designW, designH]);

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
        Página {pageIndex + 1}
      </div>
      {status && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-5 z-10 px-3 py-1 rounded-full bg-panelalt border border-edge text-[11px] text-accent whitespace-nowrap shadow max-w-[90vw] overflow-hidden text-ellipsis">
          {status}
        </div>
      )}
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
        <canvas ref={hostRef} className="block bg-white" />
      </div>
    </div>
  );
}
