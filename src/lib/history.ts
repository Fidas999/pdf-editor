import type { FabricObject } from "fabric";
import { getCanvas } from "./fabricRegistry";
import { useEditorStore } from "../store/editorStore";

/** Custom properties we persist so shapes/tables round-trip through JSON. */
const EXTRA_PROPS = ["kind", "tableMeta", "formName", "extractedText", "fontSizeHint"];
const MAX_ENTRIES = 60;

type SerializedObject = Record<string, unknown>;

/**
 * Global undo/redo for the whole document. Each history entry is a snapshot of
 * every page's overlay objects (one array per page). Snapshots are captured
 * immediately after a change and de-duplicated, so mounting empty pages or
 * repeated no-op events don't create redundant steps.
 */
class HistoryManager {
  private entries: string[] = [];
  private index = -1;
  private pageCount = 0;
  private restoring = false;
  /** While > 0, record() is a no-op (used during bulk content extraction). */
  private suppressDepth = 0;

  init(pageCount: number) {
    this.entries = [];
    this.index = -1;
    this.pageCount = pageCount;
    this.restoring = false;
    this.suppressDepth = 0;
    this.updateFlags();
  }

  get isRestoring() {
    return this.restoring;
  }

  beginSuppress() {
    this.suppressDepth++;
  }

  endSuppress() {
    this.suppressDepth = Math.max(0, this.suppressDepth - 1);
  }

  private serialize(): string {
    const parts: SerializedObject[][] = [];
    for (let i = 0; i < this.pageCount; i++) {
      const canvas = getCanvas(i);
      if (canvas) {
        const json = canvas.toObject(EXTRA_PROPS) as {
          objects: SerializedObject[];
        };
        parts.push(json.objects ?? []);
      } else {
        parts.push([]);
      }
    }
    return JSON.stringify(parts);
  }

  /** Capture the current state as a new history step (no-op while restoring). */
  record() {
    if (this.restoring || this.suppressDepth > 0) return;
    const snapshot = this.serialize();
    if (this.index >= 0 && this.entries[this.index] === snapshot) return;

    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(snapshot);
    this.index = this.entries.length - 1;

    if (this.entries.length > MAX_ENTRIES) {
      const overflow = this.entries.length - MAX_ENTRIES;
      this.entries = this.entries.slice(overflow);
      this.index -= overflow;
    }
    this.updateFlags();
  }

  async undo() {
    if (this.index <= 0) return;
    this.index--;
    await this.restore(this.entries[this.index]);
    this.updateFlags();
  }

  async redo() {
    if (this.index >= this.entries.length - 1) return;
    this.index++;
    await this.restore(this.entries[this.index]);
    this.updateFlags();
  }

  private async restore(snapshot: string) {
    this.restoring = true;
    try {
      const parts: SerializedObject[][] = JSON.parse(snapshot);
      await Promise.all(
        parts.map(async (objects, i) => {
          const canvas = getCanvas(i);
          if (!canvas) return;
          await canvas.loadFromJSON({ objects }, reviveCustomProps);
          canvas.requestRenderAll();
        })
      );
    } finally {
      this.restoring = false;
    }
    const store = useEditorStore.getState();
    store.setSelected(null, null);
  }

  private updateFlags() {
    useEditorStore
      .getState()
      .setHistoryFlags(this.index > 0, this.index < this.entries.length - 1);
  }
}

function reviveCustomProps(serialized: SerializedObject, instance: object) {
  const obj = instance as FabricObject & {
    kind?: unknown;
    tableMeta?: unknown;
    formName?: unknown;
    extractedText?: unknown;
    fontSizeHint?: unknown;
  };
  if (serialized.kind !== undefined) obj.kind = serialized.kind;
  if (serialized.tableMeta !== undefined) obj.tableMeta = serialized.tableMeta;
  if (serialized.formName !== undefined) obj.formName = serialized.formName;
  if (serialized.extractedText !== undefined)
    obj.extractedText = serialized.extractedText;
  if (serialized.fontSizeHint !== undefined)
    obj.fontSizeHint = serialized.fontSizeHint;
}

export const history = new HistoryManager();
