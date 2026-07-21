import { useCallback } from "react";
import { loadPdf } from "../lib/pdf";
import { useEditorStore } from "../store/editorStore";

export function useLoadPdf() {
  const setLoading = useEditorStore((s) => s.setLoading);
  const setDocument = useEditorStore((s) => s.setDocument);

  return useCallback(
    async (file: File) => {
      setLoading(true);
      try {
        const buffer = new Uint8Array(await file.arrayBuffer());
        const { doc, pages } = await loadPdf(buffer);
        setDocument({
          fileName: file.name,
          pdfBytes: buffer,
          pdfDoc: doc,
          pages,
        });
      } catch (err) {
        console.error("Failed to load PDF", err);
        setLoading(false);
        alert("Could not open that file. Please choose a valid PDF.");
      }
    },
    [setLoading, setDocument]
  );
}
