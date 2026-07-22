import { FONT_CATALOG } from "../lib/fontCatalog";
import { useEditorStore } from "../store/editorStore";
import { getCanvas } from "../lib/fabricRegistry";
import { getKind } from "../lib/createObject";
import type { FabricObject } from "fabric";
import { matchFont, isFontAiConfigured } from "../lib/matchFont";
import { useState } from "react";

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];

function isTextObj(obj: FabricObject | null): boolean {
  if (!obj) return false;
  const kind = getKind(obj);
  return kind === "text" || kind === "pdfText" || kind === "formField";
}

export default function TypographyRibbon() {
  const selected = useEditorStore((s) => s.selected);
  const selectedPage = useEditorStore((s) => s.selectedPage);
  useEditorStore((s) => s.selectionVersion);
  const bump = useEditorStore((s) => s.bumpSelection);
  const style = useEditorStore((s) => s.style);
  const setStyle = useEditorStore((s) => s.setStyle);
  const [suggesting, setSuggesting] = useState(false);

  const textSelected = isTextObj(selected);
  const activeFamily = textSelected
    ? ((selected!.get("fontFamily") as string) ?? style.fontFamily)
    : style.fontFamily;
  const activeSize = textSelected
    ? Math.round((selected!.get("fontSize") as number) ?? style.fontSize)
    : style.fontSize;
  const isBold = textSelected
    ? (selected!.get("fontWeight") as string) === "bold"
    : false;
  const isItalic = textSelected
    ? (selected!.get("fontStyle") as string) === "italic"
    : false;
  const textColor = textSelected
    ? toHex((selected!.get("fill") as string) ?? style.textColor)
    : toHex(style.textColor);
  const align = textSelected
    ? ((selected!.get("textAlign") as string) ?? "left")
    : "left";

  const rerender = () => {
    if (selectedPage != null) getCanvas(selectedPage)?.requestRenderAll();
    bump();
  };

  const updateText = (patch: Record<string, unknown>) => {
    if (textSelected && selected) {
      selected.set(patch);
      selected.setCoords();
      rerender();
    }
    if (patch.fontFamily != null)
      setStyle({ fontFamily: patch.fontFamily as string });
    if (patch.fontSize != null)
      setStyle({ fontSize: patch.fontSize as number });
    if (patch.fill != null) setStyle({ textColor: patch.fill as string });
  };

  const onSuggestFont = async () => {
    if (!textSelected || !selected) return;
    setSuggesting(true);
    try {
      const tagged = selected as FabricObject & {
        sourceFontName?: string;
        fontFamilyHint?: string;
      };
      const result = await matchFont({
        fontName: tagged.sourceFontName,
        forceAi: true,
      });
      updateText({ fontFamily: result.primary.font.cssFamily });
      (selected as FabricObject & { fontId?: string; fontConfidence?: number }).fontId =
        result.primary.font.id;
      (selected as FabricObject & { fontConfidence?: number }).fontConfidence =
        result.primary.confidence;
      bump();
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div
      className={`flex items-center gap-2 px-3 h-11 bg-panelalt border-b border-edge text-sm ${
        textSelected ? "" : "opacity-70"
      }`}
    >
      <span className="text-[10px] uppercase tracking-wider text-neutral-500 mr-1 shrink-0">
        Tipografia
      </span>

      <select
        title="Tipo de letra"
        value={matchSelectValue(activeFamily)}
        onChange={(e) => {
          const font = FONT_CATALOG.find((f) => f.id === e.target.value);
          if (font) {
            updateText({ fontFamily: font.cssFamily });
            if (textSelected && selected) {
              (selected as FabricObject & { fontId?: string }).fontId = font.id;
            }
          }
        }}
        className="max-w-[160px] bg-panel border border-edge rounded px-2 py-1 text-neutral-200"
        style={{ fontFamily: activeFamily }}
      >
        {FONT_CATALOG.map((f) => (
          <option key={f.id} value={f.id} style={{ fontFamily: f.cssFamily }}>
            {f.label}
          </option>
        ))}
      </select>

      <select
        title="Tamanho"
        value={activeSize}
        onChange={(e) => updateText({ fontSize: Number(e.target.value) })}
        className="w-[72px] bg-panel border border-edge rounded px-2 py-1 text-neutral-200"
      >
        {!FONT_SIZES.includes(activeSize) && (
          <option value={activeSize}>{activeSize}</option>
        )}
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-0.5">
        <RibbonBtn
          title="Negrito (Ctrl+B)"
          active={isBold}
          disabled={!textSelected}
          onClick={() =>
            updateText({ fontWeight: isBold ? "normal" : "bold" })
          }
        >
          <span className="font-bold">B</span>
        </RibbonBtn>
        <RibbonBtn
          title="Itálico (Ctrl+I)"
          active={isItalic}
          disabled={!textSelected}
          onClick={() =>
            updateText({ fontStyle: isItalic ? "normal" : "italic" })
          }
        >
          <span className="italic">I</span>
        </RibbonBtn>
      </div>

      <input
        type="color"
        title="Cor do texto"
        value={textColor}
        disabled={!textSelected}
        onChange={(e) => updateText({ fill: e.target.value })}
        className="h-7 w-9 bg-transparent cursor-pointer disabled:opacity-40"
      />

      <div className="flex items-center gap-0.5 border-l border-edge pl-2 ml-1">
        {(["left", "center", "right"] as const).map((a) => (
          <RibbonBtn
            key={a}
            title={`Alinhar ${a}`}
            active={align === a}
            disabled={!textSelected}
            onClick={() => updateText({ textAlign: a })}
          >
            <AlignIcon align={a} />
          </RibbonBtn>
        ))}
      </div>

      <div className="flex-1" />

      <button
        type="button"
        disabled={!textSelected || suggesting}
        onClick={onSuggestFont}
        title={
          isFontAiConfigured()
            ? "Identificar fonte (local + AI)"
            : "Sugerir fonte aproximada (matching local)"
        }
        className="px-2.5 py-1 rounded border border-edge bg-panel hover:bg-edge text-xs text-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {suggesting ? "A sugerir…" : "Sugerir fonte"}
      </button>
    </div>
  );
}

function matchSelectValue(cssFamily: string): string {
  const lower = cssFamily.toLowerCase();
  const found = FONT_CATALOG.find(
    (f) =>
      f.cssFamily.toLowerCase() === lower ||
      lower.includes(f.label.toLowerCase()) ||
      (f.googleFamily && lower.includes(f.googleFamily.toLowerCase()))
  );
  return found?.id ?? FONT_CATALOG[0].id;
}

function RibbonBtn({
  children,
  active,
  disabled,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`w-8 h-7 grid place-items-center rounded border text-sm disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? "bg-accent border-accent text-white"
          : "bg-panel border-edge hover:bg-edge text-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}

function AlignIcon({ align }: { align: "left" | "center" | "right" }) {
  if (align === "center") {
    return (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
        <rect x="3" y="2" width="10" height="2" rx="0.5" />
        <rect x="1" y="7" width="14" height="2" rx="0.5" />
        <rect x="3" y="12" width="10" height="2" rx="0.5" />
      </svg>
    );
  }
  if (align === "right") {
    return (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
        <rect x="4" y="2" width="11" height="2" rx="0.5" />
        <rect x="1" y="7" width="14" height="2" rx="0.5" />
        <rect x="6" y="12" width="9" height="2" rx="0.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
      <rect x="1" y="2" width="11" height="2" rx="0.5" />
      <rect x="1" y="7" width="14" height="2" rx="0.5" />
      <rect x="1" y="12" width="9" height="2" rx="0.5" />
    </svg>
  );
}

function toHex(color: string): string {
  if (color.startsWith("#")) return color.slice(0, 7);
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return "#000000";
  ctx.fillStyle = color;
  return ctx.fillStyle.startsWith("#") ? ctx.fillStyle : "#000000";
}
