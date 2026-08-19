/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REMY_PROXY_DEVICE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
