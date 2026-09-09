import { API_BASE_URL } from '../config/env'
import { token, expireSession } from '../stores/useAuth'

export interface WvpResult<T> {
  code: number
  msg: string
  data: T
}

/** 认证请求头：access-token（账号密码登录获取的 JWT） */
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token.value) headers['access-token'] = token.value
  return headers
}

/** 401 时清凭证回登录页 */
function handleUnauthorized() {
  expireSession()
}

/** GET 请求：access-token 认证 + WVPResult{code=0} 解析 */
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
    response = await fetch(url, { headers: authHeaders() })
  } catch {
    throw new Error('无法连接 WVP 后端，请检查网络与 VITE_API_BASE_URL 配置。')
  }

  if (response.status === 401) {
    handleUnauthorized()
    throw new Error('登录已过期，请重新登录')
  }
  if (!response.ok) {
    throw new Error(`WVP 接口请求失败（HTTP ${response.status}）。`)
  }

  const payload = (await response.json()) as WvpResult<T>
  if (payload.code === 401) {
    handleUnauthorized()
    throw new Error('登录已过期，请重新登录')
  }
  if (payload.code !== 0) {
    throw new Error(payload.msg || 'WVP 接口返回业务错误。')
  }
  return payload.data
}

/** POST 请求（JSON）：access-token 认证 + WVPResult{code=0} 解析 */
export async function wvpPost<T>(path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(API_BASE_URL + path, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Error('无法连接 WVP 后端，请检查网络与 VITE_API_BASE_URL 配置。')
  }

  if (response.status === 401) {
    handleUnauthorized()
    throw new Error('登录已过期，请重新登录')
  }
  if (!response.ok) {
    throw new Error(`WVP 接口请求失败（HTTP ${response.status}）。`)
  }

  const payload = (await response.json()) as WvpResult<T>
  if (payload.code === 401) {
    handleUnauthorized()
    throw new Error('登录已过期，请重新登录')
  }
  if (payload.code !== 0) {
    throw new Error(payload.msg || 'WVP 接口返回业务错误。')
  }
  return payload.data
}
