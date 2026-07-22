/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FONT_AI_URL?: string;
  readonly VITE_FONT_AI_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
