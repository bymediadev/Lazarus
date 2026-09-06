/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_LAZARUS_API_KEY?: string;
  readonly VITE_CWS_LISTING_URL?: string;
  readonly VITE_ZOOM_MARKETPLACE_URL?: string;
  readonly VITE_TEAMS_STORE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
