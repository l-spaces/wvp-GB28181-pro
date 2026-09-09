import { API_BASE_URL, API_KEY } from '../config/env'

export interface WvpResult<T> {
  code: number
  msg: string
  data: T
}

/** GET 请求：api-key 认证 + WVPResult{code=0} 解析 */
export async function wvpGet<T>(
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(API_BASE_URL + path)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
  }

  let response: Response
  try {
    response = await fetch(url, {
      headers: { 'api-key': API_KEY, Accept: 'application/json' },
    })
  } catch {
    throw new Error('无法连接 WVP 后端，请检查网络与 VITE_API_BASE_URL 配置。')
  }

  if (!response.ok) {
    throw new Error(`WVP 接口请求失败（HTTP ${response.status}）。`)
  }

  const payload = (await response.json()) as WvpResult<T>
  if (payload.code !== 0) {
    throw new Error(payload.msg || 'WVP 接口返回业务错误。')
  }
  return payload.data
}
