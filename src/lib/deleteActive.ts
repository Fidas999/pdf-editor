import { useEditorStore } from "../store/editorStore";
import { getCanvas } from "./fabricRegistry";

/**
 * Remove the currently selected object(s) from whichever page holds the
 * selection. No-op while a text object is being edited so Backspace/Delete
 * still edits text rather than deleting the box.
 */
export function deleteActive() {
  const { selectedPage } = useEditorStore.getState();
  if (selectedPage == null) return;
  const canvas = getCanvas(selectedPage);
  if (!canvas) return;

  const active = canvas.getActiveObject();
  if (
    active &&
    "isEditing" in active &&
    (active as { isEditing?: boolean }).isEditing
  ) {
    return;
  }

  const objects = canvas.getActiveObjects();
  if (objects.length === 0) return;
  canvas.remove(...objects);
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  useEditorStore.getState().setSelected(null, null);
}
