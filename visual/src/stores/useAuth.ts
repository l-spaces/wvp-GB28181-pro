import { ref } from 'vue'
import SparkMD5 from 'spark-md5'
import { API_BASE_URL } from '../config/env'

/** 登录凭证（JWT access-token），存 sessionStorage，关闭浏览器失效 */
const TOKEN_KEY = 'wvp_visual_token'

const token = ref<string | null>(sessionStorage.getItem(TOKEN_KEY))
/** 登录用户名 */
const username = ref<string | null>(sessionStorage.getItem('wvp_visual_username'))
/** 已登录标记（App 据此显示登录页或大屏） */
export const loggedIn = ref(token.value !== null)
export { token, username }

export function useAuth() {
  return { token, username, loggedIn }
}

/** md5 加密密码（WVP 登录接口要求 32 位 md5） */
function md5(text: string): string {
  return SparkMD5.hash(text)
}

/** 执行登录：成功返回用户名，失败抛错（消息来自后端） */
export async function login(user: string, password: string): Promise<string> {
  // 源码同款：GET 请求、query 参数、密码 md5 32 位
  const res = await fetch(`${API_BASE_URL}/api/user/login?username=${encodeURIComponent(user.trim())}&password=${md5(password)}`)
  if (!res.ok) {
    throw new Error(`登录请求失败（HTTP ${res.status}）`)
  }
  const payload = (await res.json()) as { code: number; msg: string; data: { accessToken: string; username: string } }
  if (payload.code !== 0 || !payload.data?.accessToken) {
    throw new Error(payload.msg || '用户名或密码错误')
  }
  token.value = payload.data.accessToken
  username.value = payload.data.username
  loggedIn.value = true
  sessionStorage.setItem(TOKEN_KEY, token.value)
  sessionStorage.setItem('wvp_visual_username', payload.data.username)
  return payload.data.username
}

/** 退出登录：清空本地凭证（后端 JWT 无状态，无需通知） */
export function logout() {
  token.value = null
  username.value = null
  loggedIn.value = false
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem('wvp_visual_username')
}

/** 登录过期（401）时由 client 调用：清凭证回登录页 */
export function expireSession() {
  if (token.value !== null) {
    logout()
  }
}
