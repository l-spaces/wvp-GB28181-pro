/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端服务地址 */
  readonly VITE_API_BASE_URL: string
  /** WVP 源码前端（管理页）地址，可选，默认与后端同源 */
  readonly VITE_WVP_WEB_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
