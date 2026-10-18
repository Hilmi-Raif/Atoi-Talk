/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_DEBUG_LOGS?: "true" | "false";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
