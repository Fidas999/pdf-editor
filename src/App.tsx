import { useEffect, useRef } from "react";
import Toolbar from "./components/Toolbar";
import PropertiesPanel from "./components/PropertiesPanel";
import PdfPage from "./components/PdfPage";
import { useEditorStore } from "./store/editorStore";
import { useLoadPdf } from "./hooks/useLoadPdf";
import { deleteActive } from "./lib/deleteActive";
import { history } from "./lib/history";

export default function App() {
  const pages = useEditorStore((s) => s.pages);
  const pdfDoc = useEditorStore((s) => s.pdfDoc);
  const loading = useEditorStore((s) => s.loading);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const loadPdf = useLoadPdf();
  const dropInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        history.redo();
        return;
      }

      if (typing) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteActive();
      } else if (e.key === "Escape") {
        setActiveTool("select");
      } else if (e.key === "v") {
        setActiveTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setActiveTool]);

  const onDropPdf = (e: React.DragEvent) => {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find(
      (f) => f.type === "application/pdf"
    );
    if (file) loadPdf(file);
  };

  return (
    <div className="flex flex-col h-full">
      <Toolbar />
      <div className="flex flex-1 min-h-0">
        <main
          className="flex-1 min-w-0 overflow-auto thin-scroll bg-[#15161b]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropPdf}
        >
          {!pdfDoc && !loading && (
            <div className="h-full grid place-items-center">
              <button
                onClick={() => dropInputRef.current?.click()}
                className="flex flex-col items-center gap-4 px-12 py-14 rounded-2xl border-2 border-dashed border-edge hover:border-accent hover:bg-panel/50 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-14 h-14 text-accent" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="text-center">
                  <div className="text-lg font-medium text-neutral-200">
                    Abrir um PDF para começar a editar
                  </div>
                  <div className="text-sm text-neutral-500 mt-1">
                    Clique para escolher ou arraste um PDF para aqui
                  </div>
                </div>
              </button>
              <input
                ref={dropInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) loadPdf(f);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {loading && (
            <div className="h-full grid place-items-center text-neutral-400">
              A carregar PDF...
            </div>
          )}

          {pdfDoc &&
            pages.map((p, i) => (
              <PdfPage key={i} pageIndex={i} width={p.width} height={p.height} />
            ))}
        </main>

        <PropertiesPanel />
      </div>
    </div>
  );
}
