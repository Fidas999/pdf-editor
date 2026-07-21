import { Rect, Ellipse, IText, Line, Group, type FabricObject } from "fabric";
import type { StyleDefaults } from "../store/editorStore";

export type ObjectKind =
  | "text"
  | "pdfText"
  | "pdfTextHit"
  | "formField"
  | "erase"
  | "rect"
  | "roundRect"
  | "ellipse"
  | "table"
  | "image";

/** Tag an object with our own metadata (kept off fabric's serialization). */
export function tag(obj: FabricObject, kind: ObjectKind) {
  (obj as FabricObject & { kind?: ObjectKind }).kind = kind;
  return obj;
}

export function getKind(obj: FabricObject): ObjectKind | undefined {
  return (obj as FabricObject & { kind?: ObjectKind }).kind;
}

export interface TableMeta {
  rows: number;
  cols: number;
  width: number;
  height: number;
}

export function getTableMeta(obj: FabricObject): TableMeta | undefined {
  return (obj as FabricObject & { tableMeta?: TableMeta }).tableMeta;
}

function setTableMeta(obj: FabricObject, meta: TableMeta) {
  (obj as FabricObject & { tableMeta?: TableMeta }).tableMeta = meta;
}

export function createText(x: number, y: number, style: StyleDefaults) {
  const t = new IText("Text", {
    left: x,
    top: y,
    fontSize: style.fontSize,
    fill: style.textColor,
    fontFamily: style.fontFamily,
  });
  return tag(t, "text");
}

export function createRect(x: number, y: number, style: StyleDefaults) {
  const r = new Rect({
    left: x,
    top: y,
    width: 140,
    height: 100,
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
  });
  return tag(r, "rect");
}

export function createRoundRect(x: number, y: number, style: StyleDefaults) {
  const r = new Rect({
    left: x,
    top: y,
    width: 140,
    height: 100,
    rx: 18,
    ry: 18,
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
  });
  return tag(r, "roundRect");
}

export function createEllipse(x: number, y: number, style: StyleDefaults) {
  const e = new Ellipse({
    left: x,
    top: y,
    rx: 70,
    ry: 70,
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
  });
  return tag(e, "ellipse");
}

/** Build the grid lines for a table Group at local origin (0,0). */
function buildTableLines(meta: TableMeta, style: StyleDefaults): Line[] {
  const { rows, cols, width, height } = meta;
  const lines: Line[] = [];
  const opts = {
    stroke: style.stroke,
    strokeWidth: Math.max(1, style.strokeWidth),
    selectable: false,
    evented: false,
  };
  for (let i = 0; i <= rows; i++) {
    const y = (height / rows) * i;
    lines.push(new Line([0, y, width, y], opts));
  }
  for (let j = 0; j <= cols; j++) {
    const x = (width / cols) * j;
    lines.push(new Line([x, 0, x, height], opts));
  }
  return lines;
}

export function createTable(
  x: number,
  y: number,
  style: StyleDefaults,
  rows = 3,
  cols = 3
) {
  const meta: TableMeta = { rows, cols, width: 240, height: 150 };
  const group = new Group(buildTableLines(meta, style), {
    left: x,
    top: y,
  });
  setTableMeta(group, meta);
  return tag(group, "table");
}

/**
 * Rebuild a table group's grid to a new row/col count, preserving position,
 * size, scale and angle.
 */
export function rebuildTable(
  group: Group,
  rows: number,
  cols: number,
  style: StyleDefaults
): TableMeta {
  const prev = getTableMeta(group) ?? {
    rows,
    cols,
    width: group.width,
    height: group.height,
  };
  const meta: TableMeta = { ...prev, rows, cols };
  group.remove(...group.getObjects());
  const lines = buildTableLines(meta, style);
  group.add(...lines);
  setTableMeta(group, meta);
  return meta;
}
