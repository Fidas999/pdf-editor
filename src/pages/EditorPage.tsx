import { useEffect } from "react";
import Toolbar from "../components/Toolbar";
import TypographyRibbon from "../components/TypographyRibbon";
import PropertiesPanel from "../components/PropertiesPanel";
import PdfPage from "../components/PdfPage";
import { useEditorStore } from "../store/editorStore";
import { deleteActive } from "../lib/deleteActive";
import { history } from "../lib/history";
import { getCanvas } from "../lib/fabricRegistry";

export default function EditorPage() {
  const pages = useEditorStore((s) => s.pages);
  const pdfDoc = useEditorStore((s) => s.pdfDoc);
  const loading = useEditorStore((s) => s.loading);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
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
      if (mod && e.key.toLowerCase() === "b" && !typing) {
        e.preventDefault();
        toggleTextStyle("fontWeight", "bold", "normal");
        return;
      }
      if (mod && e.key.toLowerCase() === "i" && !typing) {
        e.preventDefault();
        toggleTextStyle("fontStyle", "italic", "normal");
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

  return (
    <div className="flex flex-col h-full">
      <Toolbar />
      <TypographyRibbon />
      <div className="flex flex-1 min-h-0">
        <main className="flex-1 min-w-0 overflow-auto thin-scroll bg-[#15161b]">
          {loading && !pdfDoc && (
            <div className="h-full grid place-items-center text-neutral-400">
              A carregar PDF…
            </div>
          )}
          {pdfDoc &&
            pages.map((p, i) => (
              <PdfPage
                key={i}
                pageIndex={i}
                width={p.width}
                height={p.height}
              />
            ))}
        </main>
        <PropertiesPanel />
      </div>
    </div>
  );
}

function toggleTextStyle(
  prop: "fontWeight" | "fontStyle",
  on: string,
  off: string
) {
  const { selected, selectedPage, bumpSelection } = useEditorStore.getState();
  if (!selected) return;
  const kind = (selected as { kind?: string }).kind;
  if (kind !== "text" && kind !== "pdfText" && kind !== "formField") return;
  const cur = selected.get(prop) as string;
  selected.set({ [prop]: cur === on ? off : on });
  selected.setCoords();
  if (selectedPage != null) getCanvas(selectedPage)?.requestRenderAll();
  bumpSelection();
}
