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
  setHitBoxesVisible,
} from "../lib/extractContent";
import { ocrRegion } from "../lib/ocrPage";
import type { RenderTask } from "pdfjs-dist";

interface Props {
  pageIndex: number;
  width: number;
  height: number;
}

export default function PdfPage({ pageIndex, width, height }: Props) {
  const bgRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const eraseDraft = useRef<Rect | null>(null);
  const eraseOrigin = useRef<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState<string | null>("A preparar página…");

  const zoom = useEditorStore((s) => s.zoom);
  const pdfDoc = useEditorStore((s) => s.pdfDoc);
  const textDetectToken = useEditorStore((s) => s.textDetectToken);

  const designW = Math.round(width * DESIGN_SCALE);
  const designH = Math.round(height * DESIGN_SCALE);

  useEffect(() => {
    if (!pdfDoc || !bgRef.current || !overlayRef.current) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    let canvas: Canvas | null = null;

    (async () => {
      const page = await pdfDoc.getPage(pageIndex + 1);
      if (cancelled || !bgRef.current || !overlayRef.current) return;

      const viewport = page.getViewport({ scale: DESIGN_SCALE });
      const bg = bgRef.current;
      bg.width = viewport.width;
      bg.height = viewport.height;
      const ctx = bg.getContext("2d");
      if (!ctx) return;

      setStatus("A renderizar PDF…");
      task = page.render({ canvasContext: ctx, viewport });
      try {
        await task.promise;
      } catch {
        return;
      }
      if (cancelled) return;

      // Snapshot for crops / OCR before we blank leftovers
      const snap = document.createElement("canvas");
      snap.width = bg.width;
      snap.height = bg.height;
      snap.getContext("2d")?.drawImage(bg, 0, 0);

      canvas = new Canvas(overlayRef.current, {
        width: designW,
        height: designH,
        preserveObjectStacking: true,
        selection: true,
      });
      fabricRef.current = canvas;
      registerCanvas(pageIndex, canvas);

      const syncSelection = () => {
        const obj = canvas!.getActiveObject() ?? null;
        useEditorStore.getState().setSelected(obj, obj ? pageIndex : null);
      };

      const handleDblClick = async (opt: TPointerEventInfo<TPointerEvent>) => {
        if (useEditorStore.getState().activeTool === "erase") return;
        const target = opt.target;
        // Image crops from bad-encoding text: convert to real editable text via OCR
        if (target && getContentKind(target) === "image") {
          const bound = target.getBoundingRect();
          const isTextCrop = !!(
            target as FabricObject & { textCrop?: boolean }
          ).textCrop;
          history.beginSuppress();
          try {
            setStatus(
              isTextCrop
                ? "A converter texto para editável…"
                : "A ler texto da imagem…"
            );
            const value = await ocrRegion(
              snap,
              bound.left,
              bound.top,
              bound.width,
              bound.height
            );
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
            (
              text as unknown as {
                enterEditing: () => void;
                selectAll: () => void;
              }
            ).enterEditing();
            if (value) {
              (text as unknown as { selectAll: () => void }).selectAll();
            }
            useEditorStore.getState().setSelected(text, pageIndex);
            setStatus("Texto editável — altere à vontade.");
          } finally {
            history.endSuppress();
            history.record();
            window.setTimeout(() => setStatus(null), 3000);
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
          setStatus("A editar texto — altere e clique fora para concluir.");
          window.setTimeout(() => setStatus(null), 4000);
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
        const w = Math.abs(p.x - origin.x);
        const h = Math.abs(p.y - origin.y);
        draft.set({ left, top, width: Math.max(1, w), height: Math.max(1, h) });
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
          canvas!.sendObjectToBack(draft);
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
        const { objects: editable, usedCrops } = await convertPageToEditable(
          page,
          snap,
          (msg) => {
            if (!cancelled) setStatus(msg);
          }
        );
        if (cancelled) return;

        // Keep the rendered PDF underneath. Editable objects sit on top with
        // matching covers/crops so the page looks like the original.

        const covers = editable.filter((o) => getContentKind(o) === "erase");
        const rest = editable.filter((o) => getContentKind(o) !== "erase");
        for (const o of covers) canvas.add(o);
        for (const o of rest) canvas.add(o);
        canvas.requestRenderAll();

        setStatus(
          usedCrops
            ? "Aspeto do PDF preservado. Clique para selecionar; duplo-clique num texto para o editar."
            : "Página editável: selecione, arraste, apague ou altere texto/imagens/linhas."
        );
        window.setTimeout(() => {
          if (!cancelled) setStatus(null);
        }, 6000);
      } catch (err) {
        console.warn("Conversão falhou", err);
        setStatus("Conversão incompleta — use Apagar / ferramentas manuais.");
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
    };
  }, [pdfDoc, pageIndex, designW, designH]);

  useEffect(() => {
    if (!textDetectToken) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    setHitBoxesVisible(canvas, true);
    setStatus("Zonas assinaladas (se existirem hit-boxes).");
    const t = window.setTimeout(() => setStatus(null), 4000);
    return () => window.clearTimeout(t);
  }, [textDetectToken]);

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
