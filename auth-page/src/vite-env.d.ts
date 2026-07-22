/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Stytch B2B **public** token (publishable). Set at build time on the Mac. */
  readonly VITE_STYTCH_PUBLIC_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
