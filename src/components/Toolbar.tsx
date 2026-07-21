import { useRef, useState } from "react";
import { FabricImage } from "fabric";
import { useEditorStore, type Tool } from "../store/editorStore";
import { getCanvas } from "../lib/fabricRegistry";
import { tag } from "../lib/createObject";
import { downloadEditedPdf } from "../lib/exportPdf";
import { useLoadPdf } from "../hooks/useLoadPdf";
import { deleteActive } from "../lib/deleteActive";

interface ToolDef {
  id: Tool;
  label: string;
  icon: JSX.Element;
}

const icon = (d: string, extra?: JSX.Element) => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
    {extra}
  </svg>
);

const TOOLS: ToolDef[] = [
  { id: "select", label: "Select", icon: icon("M4 3l7 17 2-7 7-2z") },
  { id: "text", label: "Text", icon: icon("M5 5h14M12 5v14M9 19h6") },
  { id: "rect", label: "Square", icon: icon("M4 5h16v14H4z") },
  {
    id: "roundRect",
    label: "Rounded",
    icon: icon("M7 5h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z"),
  },
  { id: "ellipse", label: "Circle", icon: icon("M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z") },
  {
    id: "table",
    label: "Table",
    icon: icon("M4 5h16v14H4zM4 10h16M4 15h16M9 5v14M15 5v14"),
  },
  {
    id: "image",
    label: "Image",
    icon: icon("M4 5h16v14H4zM8 11l3 3 3-4 4 5", <circle cx="8.5" cy="8.5" r="1.4" />),
  },
];

export default function Toolbar() {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const pdfBytes = useEditorStore((s) => s.pdfBytes);
  const fileName = useEditorStore((s) => s.fileName);
  const pages = useEditorStore((s) => s.pages);

  const openInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const loadPdf = useLoadPdf();
  const [exporting, setExporting] = useState(false);

  const hasDoc = !!pdfBytes;

  const onSelectTool = (id: Tool) => {
    if (id === "image") {
      imageInputRef.current?.click();
      return;
    }
    setActiveTool(id);
  };

  const addImage = async (file: File) => {
    const pageIndex = useEditorStore.getState().activePage;
    const canvas = getCanvas(pageIndex);
    if (!canvas) return;
    const url = URL.createObjectURL(file);
    const img = await FabricImage.fromURL(url);
    const maxW = canvas.getWidth() * 0.6;
    if (img.width && img.width > maxW) img.scaleToWidth(maxW);
    img.set({
      left: canvas.getWidth() / 2,
      top: canvas.getHeight() / 2,
      originX: "center",
      originY: "center",
    });
    tag(img, "image");
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
    useEditorStore.getState().setSelected(img, pageIndex);
    setActiveTool("select");
  };

  const onExport = async () => {
    if (!pdfBytes) return;
    setExporting(true);
    try {
      const base = (fileName ?? "document.pdf").replace(/\.pdf$/i, "");
      await downloadEditedPdf(pdfBytes, pages.length, `${base}-edited.pdf`);
    } catch (err) {
      console.error(err);
      alert("Export failed. See console for details.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 h-14 bg-panel border-b border-edge">
      <div className="flex items-center gap-2 pr-3 mr-1 border-r border-edge">
        <div className="w-7 h-7 rounded-md bg-accent grid place-items-center text-white font-bold">
          P
        </div>
        <span className="font-semibold text-sm tracking-wide">PDF Editor</span>
      </div>

      <button
        className="px-3 py-1.5 rounded-md text-sm bg-panelalt hover:bg-edge border border-edge"
        onClick={() => openInputRef.current?.click()}
      >
        Open PDF
      </button>
      <input
        ref={openInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) loadPdf(f);
          e.target.value = "";
        }}
      />

      <div className="w-px h-7 bg-edge mx-1" />

      <div className={`flex items-center gap-1 ${hasDoc ? "" : "opacity-40 pointer-events-none"}`}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            title={t.label}
            onClick={() => onSelectTool(t.id)}
            className={`flex flex-col items-center justify-center w-14 h-11 rounded-md border text-[10px] gap-0.5 transition-colors ${
              activeTool === t.id
                ? "bg-accent border-accent text-white"
                : "bg-panelalt border-edge hover:bg-edge text-neutral-200"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
        <button
          title="Delete selected"
          onClick={() => deleteActive()}
          className="flex flex-col items-center justify-center w-14 h-11 rounded-md border border-edge bg-panelalt hover:bg-red-600/80 text-[10px] gap-0.5 text-neutral-200"
        >
          {icon("M5 7h14M9 7V5h6v2M6 7l1 13h10l1-13")}
          Delete
        </button>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) addImage(f);
          e.target.value = "";
        }}
      />

      <div className="flex-1" />

      <div className={`flex items-center gap-1 ${hasDoc ? "" : "opacity-40 pointer-events-none"}`}>
        <button
          className="w-8 h-8 rounded-md bg-panelalt border border-edge hover:bg-edge"
          onClick={() => setZoom(zoom - 0.1)}
          title="Zoom out"
        >
          -
        </button>
        <span className="w-12 text-center text-sm tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <button
          className="w-8 h-8 rounded-md bg-panelalt border border-edge hover:bg-edge"
          onClick={() => setZoom(zoom + 0.1)}
          title="Zoom in"
        >
          +
        </button>
      </div>

      <div className="w-px h-7 bg-edge mx-1" />

      <button
        disabled={!hasDoc || exporting}
        onClick={onExport}
        className="px-4 py-1.5 rounded-md text-sm font-medium bg-accent hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-white"
      >
        {exporting ? "Exporting..." : "Export PDF"}
      </button>
    </div>
  );
}
