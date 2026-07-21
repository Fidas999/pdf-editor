import { useEditorStore } from "../store/editorStore";
import { getCanvas } from "./fabricRegistry";
import { createEraseFromObject, getContentKind } from "./extractContent";

/**
 * Remove the currently selected object(s). Never deletes the locked page base.
 * For text/image crops, leave a white erase so content does not reappear from
 * the page base underneath.
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

  const objects = canvas
    .getActiveObjects()
    .filter((o) => getContentKind(o) !== "pageBase");
  if (objects.length === 0) return;

  for (const obj of objects) {
    const kind = getContentKind(obj);
    if (
      kind === "pdfText" ||
      kind === "formField" ||
      kind === "pdfTextHit" ||
      kind === "image" ||
      kind === "line"
    ) {
      const erase = createEraseFromObject(obj);
      canvas.add(erase);
      // Keep erase above the locked page base
      const base = canvas
        .getObjects()
        .find((o) => getContentKind(o) === "pageBase");
      if (base) {
        canvas.sendObjectToBack(base);
      }
    }
    canvas.remove(obj);
  }

  canvas.discardActiveObject();
  canvas.requestRenderAll();
  useEditorStore.getState().setSelected(null, null);
}
