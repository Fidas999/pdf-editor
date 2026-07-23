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
import {
  setPageBitmap,
  unregisterPageBitmap,
} from "../lib/pageBitmap";
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
 * PDF preview = HTML <img> (always visible).
 * Editing = Fabric canvas created on a plain DOM node React does NOT own,
 * so Fabric's wrapper DOM mutations cannot crash React (insertBefore).
 */
export default function PdfPage({ pageIndex, width, height }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const snapRef = useRef<HTMLCanvasElement | null>(null);
  const eraseDraft = useRef<Rect | null>(null);
  const eraseOrigin = useRef<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState<string | null>("A importar página…");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const zoom = useEditorStore((s) => s.zoom);
  const pdfDoc = useEditorStore((s) => s.pdfDoc);

  const designW = Math.round(width * DESIGN_SCALE);
  const designH = Math.round(height * DESIGN_SCALE);

  useEffect(() => {
    if (!pdfDoc || !containerRef.current) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    let canvas: Canvas | null = null;
    const container = containerRef.current;

    (async () => {
      try {
        const page = await pdfDoc.getPage(pageIndex + 1);
        if (cancelled || containerRef.current !== container) return;

        const viewport = page.getViewport({ scale: DESIGN_SCALE });
        const off = document.createElement("canvas");
        off.width = Math.max(1, Math.round(viewport.width));
        off.height = Math.max(1, Math.round(viewport.height));
        const offCtx = off.getContext("2d", { willReadFrequently: true });
        if (!offCtx) {
          setStatus("Não foi possível criar o canvas de renderização.");
          return;
        }

        setStatus("A ler o PDF…");
        offCtx.fillStyle = "#ffffff";
        offCtx.fillRect(0, 0, off.width, off.height);

        task = page.render({
          canvasContext: offCtx,
          viewport,
          intent: "display",
        });
        try {
          await task.promise;
        } catch (err) {
          if (cancelled) return;
          console.error("PDF page render failed", err);
          setStatus("Falha ao desenhar a página do PDF.");
          return;
        }
        if (cancelled || containerRef.current !== container) return;

        let url: string;
        try {
          url = off.toDataURL("image/png");
        } catch (err) {
          console.error("toDataURL failed", err);
          setStatus("Não foi possível capturar a página renderizada.");
          return;
        }

        snapRef.current = off;
        setPageBitmap(pageIndex, off);
        setPreviewUrl(url);

        // Dispose previous Fabric instance if any.
        if (fabricRef.current) {
          try {
            fabricRef.current.dispose();
          } catch {
            /* ignore */
          }
          fabricRef.current = null;
        }

        // Fabric must own this <canvas> — never let React reconcile it.
        container.innerHTML = "";
        const el = document.createElement("canvas");
        container.appendChild(el);

        canvas = new Canvas(el, {
          width: designW,
          height: designH,
          backgroundColor: "transparent",
          preserveObjectStacking: true,
          selection: true,
        });
        const wrapper = canvas.wrapperEl;
        if (wrapper) {
          wrapper.style.position = "absolute";
          wrapper.style.left = "0";
          wrapper.style.top = "0";
          wrapper.style.width = `${designW}px`;
          wrapper.style.height = `${designH}px`;
          wrapper.style.background = "transparent";
        }
        fabricRef.current = canvas;
        registerCanvas(pageIndex, canvas);

        const syncSelection = () => {
          const obj = canvas!.getActiveObject() ?? null;
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
              const tagged = target as FabricObject & {
                fontSizeHint?: number;
                fontFamilyHint?: string;
                fontWeightHint?: "normal" | "bold";
                fontStyleHint?: "normal" | "italic";
                fontId?: string;
                fontConfidence?: number;
                sourceFontName?: string;
              };
              const fontHint =
                tagged.fontSizeHint ?? Math.max(10, bound.height * 0.75);
              const text = new IText(value || "", {
                left: bound.left,
                top: bound.top,
                fontSize: fontHint,
                fill: "#111827",
                fontFamily:
                  tagged.fontFamilyHint ??
                  useEditorStore.getState().style.fontFamily,
                fontWeight: tagged.fontWeightHint ?? "normal",
                fontStyle: tagged.fontStyleHint ?? "normal",
                backgroundColor: "#ffffff",
              });
              tag(text, "pdfText");
              const textMeta = text as FabricObject & {
                fontId?: string;
                fontConfidence?: number;
                sourceFontName?: string;
              };
              textMeta.fontId = tagged.fontId;
              textMeta.fontConfidence = tagged.fontConfidence;
              textMeta.sourceFontName = tagged.sourceFontName;
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
          draft.set({
            left: Math.min(origin.x, p.x),
            top: Math.min(origin.y, p.y),
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
          setStatus("Página visível. A preparar edição…");
          const { objects } = await convertPageToEditable(page, off, (msg) => {
            if (!cancelled) setStatus(msg);
          });
          if (cancelled || containerRef.current !== container) return;

          for (const o of objects) canvas.add(o);
          canvas.requestRenderAll();

          setStatus("Documento carregado. Duplo-clique no texto para editar.");
          window.setTimeout(() => {
            if (!cancelled) setStatus(null);
          }, 5000);
        } catch (err) {
          console.warn(err);
          setStatus("Página visível. Preparação de texto falhou — usa Texto/Apagar.");
          window.setTimeout(() => {
            if (!cancelled) setStatus(null);
          }, 5000);
        } finally {
          history.endSuppress();
          if (!cancelled) history.record();
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setStatus(
            err instanceof Error
              ? err.message
              : "Erro ao abrir esta página do PDF."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        task?.cancel();
      } catch {
        /* ignore */
      }
      unregisterCanvas(pageIndex);
      unregisterPageBitmap(pageIndex);
      if (fabricRef.current) {
        try {
          fabricRef.current.dispose();
        } catch {
          /* ignore */
        }
        fabricRef.current = null;
      } else if (canvas) {
        try {
          canvas.dispose();
        } catch {
          /* ignore */
        }
      }
      if (container) container.innerHTML = "";
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
        className="relative bg-white overflow-hidden"
        style={{
          width: designW,
          height: designH,
          transform: `scale(${zoom})`,
          transformOrigin: "top left",
        }}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={`Página ${pageIndex + 1}`}
            className="absolute inset-0 block pointer-events-none select-none"
            width={designW}
            height={designH}
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-neutral-400 text-sm bg-white">
            A renderizar…
          </div>
        )}
        {/* Fabric mounts its own canvas inside — React must not own those nodes */}
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ width: designW, height: designH }}
        />
      </div>
    </div>
  );
}
