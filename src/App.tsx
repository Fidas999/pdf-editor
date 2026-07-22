import ErrorBoundary from "./components/ErrorBoundary";
import UploadPage from "./pages/UploadPage";
import EditorPage from "./pages/EditorPage";
import { useEditorStore } from "./store/editorStore";

/**
 * View switch is state-based (not URL routing). GitHub Pages cannot serve
 * /editor as a real path; relying on navigate() caused a blank page after upload.
 */
export default function App() {
  const pdfDoc = useEditorStore((s) => s.pdfDoc);
  const loading = useEditorStore((s) => s.loading);
  const showEditor = !!pdfDoc || loading;

  return (
    <ErrorBoundary>
      {showEditor ? <EditorPage /> : <UploadPage />}
    </ErrorBoundary>
  );
}
