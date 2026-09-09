/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端服务地址 */
  readonly VITE_API_BASE_URL: string
  /** 后端 API 认证 key */
  readonly VITE_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
