import { create } from "zustand";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { FabricObject } from "fabric";
import type { PageInfo } from "../lib/pdf";

export type Tool =
  | "select"
  | "text"
  | "rect"
  | "roundRect"
  | "ellipse"
  | "table"
  | "image";

export interface StyleDefaults {
  fill: string;
  stroke: string;
  strokeWidth: number;
  fontSize: number;
  fontFamily: string;
  textColor: string;
}

interface EditorState {
  fileName: string | null;
  pdfBytes: Uint8Array | null;
  pdfDoc: PDFDocumentProxy | null;
  pages: PageInfo[];
  loading: boolean;

  zoom: number;
  activeTool: Tool;
  /** Page the user last interacted with; target for toolbar insertions. */
  activePage: number;

  /** Currently selected fabric object (for the properties panel). */
  selected: FabricObject | null;
  /** Page index of the current selection. */
  selectedPage: number | null;
  /** Bumped whenever selection or a selected object's props change. */
  selectionVersion: number;

  style: StyleDefaults;

  setDocument: (data: {
    fileName: string;
    pdfBytes: Uint8Array;
    pdfDoc: PDFDocumentProxy;
    pages: PageInfo[];
  }) => void;
  reset: () => void;
  setLoading: (loading: boolean) => void;
  setZoom: (zoom: number) => void;
  setActiveTool: (tool: Tool) => void;
  setActivePage: (pageIndex: number) => void;
  setSelected: (obj: FabricObject | null, pageIndex: number | null) => void;
  bumpSelection: () => void;
  setStyle: (patch: Partial<StyleDefaults>) => void;
}

const defaultStyle: StyleDefaults = {
  fill: "#3b82f6",
  stroke: "#1e3a8a",
  strokeWidth: 2,
  fontSize: 24,
  fontFamily: "Helvetica",
  textColor: "#111827",
};

export const useEditorStore = create<EditorState>((set) => ({
  fileName: null,
  pdfBytes: null,
  pdfDoc: null,
  pages: [],
  loading: false,

  zoom: 1,
  activeTool: "select",
  activePage: 0,

  selected: null,
  selectedPage: null,
  selectionVersion: 0,

  style: defaultStyle,

  setDocument: ({ fileName, pdfBytes, pdfDoc, pages }) =>
    set({
      fileName,
      pdfBytes,
      pdfDoc,
      pages,
      loading: false,
      selected: null,
      selectedPage: null,
    }),
  reset: () =>
    set({
      fileName: null,
      pdfBytes: null,
      pdfDoc: null,
      pages: [],
      selected: null,
      selectedPage: null,
      activeTool: "select",
      zoom: 1,
    }),
  setLoading: (loading) => set({ loading }),
  setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.25, zoom)) }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setActivePage: (activePage) => set({ activePage }),
  setSelected: (selected, selectedPage) =>
    set((s) => ({
      selected,
      selectedPage,
      selectionVersion: s.selectionVersion + 1,
    })),
  bumpSelection: () =>
    set((s) => ({ selectionVersion: s.selectionVersion + 1 })),
  setStyle: (patch) => set((s) => ({ style: { ...s.style, ...patch } })),
}));
