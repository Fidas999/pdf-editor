import { useCallback } from "react";
import { loadPdf } from "../lib/pdf";
import { useEditorStore } from "../store/editorStore";
import { history } from "../lib/history";

export function useLoadPdf() {
  const setLoading = useEditorStore((s) => s.setLoading);
  const setDocument = useEditorStore((s) => s.setDocument);

  return useCallback(
    async (file: File) => {
      setLoading(true);
      try {
        const buffer = new Uint8Array(await file.arrayBuffer());
        const { doc, pages } = await loadPdf(buffer);
        history.init(pages.length);
        setDocument({
          fileName: file.name,
          pdfBytes: buffer,
          pdfDoc: doc,
          pages,
        });
      } catch (err) {
        console.error("Failed to load PDF", err);
        setLoading(false);
        alert("Não foi possível abrir esse ficheiro. Escolhe um PDF válido.");
      }
    },
    [setLoading, setDocument]
  );
}
