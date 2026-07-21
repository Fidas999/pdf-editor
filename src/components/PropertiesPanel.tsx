import { Group, type FabricObject } from "fabric";
import { useEditorStore } from "../store/editorStore";
import { getCanvas } from "../lib/fabricRegistry";
import {
  getKind,
  getTableMeta,
  rebuildTable,
} from "../lib/createObject";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-neutral-400">{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </label>
  );
}

export default function PropertiesPanel() {
  const selected = useEditorStore((s) => s.selected);
  const selectedPage = useEditorStore((s) => s.selectedPage);
  // Re-render whenever the selection or the object's props change.
  useEditorStore((s) => s.selectionVersion);
  const bump = useEditorStore((s) => s.bumpSelection);
  const setStyle = useEditorStore((s) => s.setStyle);

  const rerender = () => {
    if (selectedPage != null) getCanvas(selectedPage)?.requestRenderAll();
    bump();
  };

  const update = (obj: FabricObject, patch: Record<string, unknown>) => {
    obj.set(patch);
    obj.setCoords();
    rerender();
  };

  if (!selected) {
    return (
      <aside className="w-64 shrink-0 bg-panel border-l border-edge p-4 text-sm text-neutral-500">
        <h2 className="text-neutral-300 font-medium mb-2">Propriedades</h2>
        Abra um PDF — texto, linhas e imagens passam a objetos editáveis
        (selecionar, mover, apagar, alterar). Duplo-clique numa imagem de texto
        para a converter em texto editável. Exporte em PDF, PNG ou JPEG.
      </aside>
    );
  }

  const kind = getKind(selected);
  const isText = kind === "text" || kind === "pdfText" || kind === "formField";
  const isPdfHit = kind === "pdfTextHit";
  const isShape =
    kind === "rect" || kind === "roundRect" || kind === "ellipse";
  const isLine = kind === "line";
  const isTable = kind === "table";
  const isErase = kind === "erase";
  const isImage = kind === "image";

  const fill = (selected.get("fill") as string) ?? "#000000";
  const stroke = (selected.get("stroke") as string) ?? "#000000";
  const strokeWidth = (selected.get("strokeWidth") as number) ?? 0;

  return (
    <aside className="w-64 shrink-0 bg-panel border-l border-edge p-4 overflow-y-auto thin-scroll">
      <h2 className="text-neutral-300 font-medium mb-4 capitalize">
        {kind ?? "Object"}
      </h2>

      <div className="flex flex-col gap-3">
        {isPdfHit && (
          <p className="text-xs text-neutral-400 leading-relaxed">
            Text region detected on the PDF. <strong className="text-neutral-300">Double-click</strong> to
            edit it (a white box appears so you can type the replacement).
            Press Delete to erase this region.
          </p>
        )}

        {isText && (
          <>
            <Row label="Font size">
              <input
                type="number"
                min={6}
                max={200}
                value={Math.round((selected.get("fontSize") as number) ?? 24)}
                onChange={(e) => {
                  const v = Number(e.target.value) || 12;
                  update(selected, { fontSize: v });
                  setStyle({ fontSize: v });
                }}
                className="w-16 bg-panelalt border border-edge rounded px-2 py-1"
              />
            </Row>
            <Row label="Bold">
              <input
                type="checkbox"
                checked={(selected.get("fontWeight") as string) === "bold"}
                onChange={(e) =>
                  update(selected, {
                    fontWeight: e.target.checked ? "bold" : "normal",
                  })
                }
              />
            </Row>
            <Row label="Italic">
              <input
                type="checkbox"
                checked={(selected.get("fontStyle") as string) === "italic"}
                onChange={(e) =>
                  update(selected, {
                    fontStyle: e.target.checked ? "italic" : "normal",
                  })
                }
              />
            </Row>
            <Row label="Color">
              <input
                type="color"
                value={toHex((selected.get("fill") as string) ?? "#111827")}
                onChange={(e) => {
                  update(selected, { fill: e.target.value });
                  setStyle({ textColor: e.target.value });
                }}
                className="h-7 w-10 bg-transparent"
              />
            </Row>
          </>
        )}

        {isLine && (
          <>
            <Row label="Cor">
              <input
                type="color"
                value={toHex((selected.get("stroke") as string) ?? "#111827")}
                onChange={(e) => update(selected, { stroke: e.target.value })}
                className="h-7 w-10 bg-transparent"
              />
            </Row>
            <Row label="Espessura">
              <input
                type="number"
                min={1}
                max={40}
                value={Math.round((selected.get("strokeWidth") as number) ?? 1)}
                onChange={(e) =>
                  update(selected, {
                    strokeWidth: Number(e.target.value) || 1,
                  })
                }
                className="w-16 bg-panelalt border border-edge rounded px-2 py-1"
              />
            </Row>
          </>
        )}

        {isImage && (
          <p className="text-xs text-neutral-400 leading-relaxed">
            Imagem editável (mover, redimensionar, apagar). Se for texto
            capturado do PDF,{" "}
            <strong className="text-neutral-300">duplo-clique</strong> para
            converter em texto editável.
          </p>
        )}

        {isShape && (
          <>
            <Row label="Fill">
              <input
                type="color"
                value={toHex(fill)}
                onChange={(e) => {
                  update(selected, { fill: e.target.value });
                  setStyle({ fill: e.target.value });
                }}
                className="h-7 w-10 bg-transparent"
              />
            </Row>
            <Row label="Border">
              <input
                type="color"
                value={toHex(stroke)}
                onChange={(e) => {
                  update(selected, { stroke: e.target.value });
                  setStyle({ stroke: e.target.value });
                }}
                className="h-7 w-10 bg-transparent"
              />
            </Row>
            <Row label="Border width">
              <input
                type="number"
                min={0}
                max={40}
                value={Math.round(strokeWidth)}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  update(selected, { strokeWidth: v });
                  setStyle({ strokeWidth: v });
                }}
                className="w-16 bg-panelalt border border-edge rounded px-2 py-1"
              />
            </Row>
            {kind === "roundRect" && (
              <Row label="Corner radius">
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={Math.round((selected.get("rx") as number) ?? 0)}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 0;
                    update(selected, { rx: v, ry: v });
                  }}
                  className="w-16 bg-panelalt border border-edge rounded px-2 py-1"
                />
              </Row>
            )}
          </>
        )}

        {isErase && (
          <p className="text-xs text-neutral-400 leading-relaxed">
            Erase region — a white cover over the original PDF. Resize or move
            it; delete it to reveal the content underneath again.
          </p>
        )}

        {isTable && (
          <TableControls
            group={selected as Group}
            onChange={rerender}
          />
        )}

        <Row label="Opacity">
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={(selected.get("opacity") as number) ?? 1}
            onChange={(e) => update(selected, { opacity: Number(e.target.value) })}
            className="w-28"
          />
        </Row>
      </div>

      <p className="mt-6 text-xs text-neutral-500 leading-relaxed">
        Drag to move. Use corner handles to resize and the top handle to rotate.
        Press Delete to remove.
      </p>
    </aside>
  );
}

function TableControls({
  group,
  onChange,
}: {
  group: Group;
  onChange: () => void;
}) {
  const style = useEditorStore((s) => s.style);
  const meta = getTableMeta(group) ?? { rows: 3, cols: 3, width: 240, height: 150 };

  const setDim = (rows: number, cols: number) => {
    rebuildTable(group, Math.max(1, rows), Math.max(1, cols), style);
    group.setCoords();
    onChange();
  };

  return (
    <>
      <Row label="Rows">
        <input
          type="number"
          min={1}
          max={40}
          value={meta.rows}
          onChange={(e) => setDim(Number(e.target.value) || 1, meta.cols)}
          className="w-16 bg-panelalt border border-edge rounded px-2 py-1"
        />
      </Row>
      <Row label="Columns">
        <input
          type="number"
          min={1}
          max={40}
          value={meta.cols}
          onChange={(e) => setDim(meta.rows, Number(e.target.value) || 1)}
          className="w-16 bg-panelalt border border-edge rounded px-2 py-1"
        />
      </Row>
    </>
  );
}

/** Normalise color strings to a hex value the <input type=color> accepts. */
function toHex(color: string): string {
  if (color.startsWith("#")) return color.slice(0, 7);
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return "#000000";
  ctx.fillStyle = color;
  return ctx.fillStyle.startsWith("#") ? ctx.fillStyle : "#000000";
}
