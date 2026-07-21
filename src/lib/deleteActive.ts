import { useEditorStore } from "../store/editorStore";
import { getCanvas } from "./fabricRegistry";
import { createEraseFromObject, getContentKind } from "./extractContent";

/**
 * Remove the currently selected object(s). For extracted PDF text / form
 * fields, leave a white erase rect behind so the original content stays
 * covered after deletion. No-op while a text object is being edited.
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

  for (const obj of objects) {
    const kind = getContentKind(obj);
    if (kind === "pdfText" || kind === "formField" || kind === "pdfTextHit") {
      const erase = createEraseFromObject(obj);
      canvas.add(erase);
      // Move erase under remaining overlays so new drawings stay on top.
      canvas.sendObjectToBack(erase);
    }
    canvas.remove(obj);
  }

  canvas.discardActiveObject();
  canvas.requestRenderAll();
  useEditorStore.getState().setSelected(null, null);
}
