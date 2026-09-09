/** 后端服务地址，来自 visual/.env */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

/** WVP 源码前端（管理页）地址，可选，默认与后端同源 */
export const WVP_WEB_URL = import.meta.env.VITE_WVP_WEB_URL || API_BASE_URL
