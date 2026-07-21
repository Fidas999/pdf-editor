import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The app is deployed to GitHub Pages at https://fidas999.github.io/pdf-editor/
// so assets must resolve under the "/pdf-editor/" base in production.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/pdf-editor/" : "/",
  plugins: [react()],
  // pdfjs-dist ships a worker we load via ?url; keep it out of pre-bundling.
  optimizeDeps: {
    exclude: ["pdfjs-dist"],
  },
}));
