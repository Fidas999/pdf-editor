import { useRef } from "react";
import { useLoadPdf } from "../hooks/useLoadPdf";
import { useEditorStore } from "../store/editorStore";

export default function UploadPage() {
  const loadPdf = useLoadPdf();
  const loading = useEditorStore((s) => s.loading);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find(
      (f) => f.type === "application/pdf"
    );
    if (file) loadPdf(file);
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-2 px-4 h-14 bg-panel border-b border-edge">
        <div className="w-7 h-7 rounded-md bg-accent grid place-items-center text-white font-bold">
          P
        </div>
        <span className="font-semibold text-sm tracking-wide">PDF Editor</span>
      </header>

      <main
        className="flex-1 min-h-0 overflow-auto thin-scroll bg-[#15161b] grid place-items-center p-6"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {loading ? (
          <div className="text-neutral-400">A carregar PDF…</div>
        ) : (
          <div className="flex flex-col items-center gap-6 max-w-lg w-full">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center gap-4 w-full px-12 py-14 rounded-2xl border-2 border-dashed border-edge hover:border-accent hover:bg-panel/50 transition-colors"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-14 h-14 text-accent"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  d="M12 16V4m0 0l-4 4m4-4l4 4M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="text-center">
                <div className="text-lg font-medium text-neutral-200">
                  Carregar um PDF para editar
                </div>
                <div className="text-sm text-neutral-500 mt-1">
                  Clique para escolher ou arraste um PDF para aqui
                </div>
              </div>
            </button>
            <p className="text-sm text-neutral-500 text-center leading-relaxed">
              O layout das páginas mantém-se (posições fixas). Edita texto,
              tipografia e objetos numa página de edição dedicada — não é uma
              conversão para Word.
            </p>
            <input
              ref={inputRef}
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
      </main>
    </div>
  );
}
