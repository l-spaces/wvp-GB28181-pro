/** 后端服务地址与认证 key，来自 visual/.env */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
export const API_KEY = import.meta.env.VITE_API_KEY

/** 拼接后端接口完整地址 */
export function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${API_BASE_URL}${path.startsWith('/') ? path : '/' + path}`
}
