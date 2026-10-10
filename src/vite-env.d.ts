/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 백엔드 주소. 로컬 개발에서는 비워 두고 Vite 프록시를 쓴다. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
