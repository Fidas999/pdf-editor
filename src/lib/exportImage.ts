import { getCanvas } from "./fabricRegistry";
import { useEditorStore } from "../store/editorStore";
import {
  dataUrlToBytes,
  downloadFiles,
  type NamedFile,
} from "./download";
import { getContentKind } from "./extractContent";

export type ImageFormat = "png" | "jpeg";

/**
 * Export each editor page as PNG/JPEG from the Fabric document only
 * (flat WYSIWYG — no separate PDF background render).
 */
export async function exportPagesAsImages(
  format: ImageFormat,
  baseName: string
) {
  const { pages } = useEditorStore.getState();
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const ext = format === "png" ? "png" : "jpg";
  const files: NamedFile[] = [];

  for (let i = 0; i < pages.length; i++) {
    const canvas = getCanvas(i);
    if (!canvas) continue;

    const hits = canvas
      .getObjects()
      .filter((o) => getContentKind(o) === "pdfTextHit");
    for (const h of hits) h.set({ visible: false });

    const active = canvas.getActiveObject();
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    const dataUrl = canvas.toDataURL({
      format: format === "png" ? "png" : "jpeg",
      quality: 0.92,
      multiplier: 2,
    });

    for (const h of hits) h.set({ visible: true });
    if (active) canvas.setActiveObject(active);
    canvas.requestRenderAll();

    const suffix = pages.length > 1 ? `-page-${i + 1}` : "";
    files.push({
      name: `${baseName}${suffix}.${ext}`,
      bytes: dataUrlToBytes(dataUrl),
      mime,
    });
  }

  await downloadFiles(files, `${baseName}-pages`);
}
