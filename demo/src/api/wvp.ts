import type { DemoConfig } from '../types/config'
import type {
  PlayStartResponse,
  PtzCommand,
  PtzRequest,
  StreamContent,
  WvpResult,
} from '../types/wvp'

type WvpApiErrorKind = 'authentication' | 'business' | 'http' | 'network' | 'response'
type ResponseMode = 'required-json' | 'optional-json'

interface RequestOptions {
  query?: URLSearchParams
  responseMode: ResponseMode
}

const PTZ_COMMANDS: readonly PtzCommand[] = [
  'left',
  'right',
  'up',
  'down',
  'upleft',
  'upright',
  'downleft',
  'downright',
  'zoomin',
  'zoomout',
  'stop',
]

export class WvpApiError extends Error {
  readonly kind: WvpApiErrorKind
  readonly status?: number
  readonly businessCode?: number

  constructor(
    kind: WvpApiErrorKind,
    message: string,
    details: { status?: number; businessCode?: number } = {},
  ) {
    super(message)
    this.name = 'WvpApiError'
    this.kind = kind
    this.status = details.status
    this.businessCode = details.businessCode
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPtzCommand(value: unknown): value is PtzCommand {
  return typeof value === 'string' && PTZ_COMMANDS.some((command) => command === value)
}

function isIntegerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max
}

function readOptionalUrlField(
  value: Record<string, unknown>,
  field: string,
): string | null | undefined {
  const fieldValue = value[field]
  if (fieldValue === undefined || fieldValue === null) {
    return fieldValue
  }

  if (typeof fieldValue !== 'string') {
    throw new WvpApiError('response', `WVP 响应中的 data.${field} 格式错误。`)
  }

  const normalizedValue = fieldValue.trim()
  return normalizedValue === '' ? undefined : normalizedValue
}

function parseStreamContent(value: unknown): StreamContent {
  if (!isRecord(value)) {
    throw new WvpApiError('response', 'WVP 点播响应缺少有效的 data 对象。')
  }

  return {
    rtc: readOptionalUrlField(value, 'rtc'),
    rtcs: readOptionalUrlField(value, 'rtcs'),
    wsFlv: readOptionalUrlField(value, 'ws_flv'),
    wssFlv: readOptionalUrlField(value, 'wss_flv'),
  }
}

function selectWebRtcUrl(stream: StreamContent): string {
  const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const preferredUrl = isHttpsPage ? stream.rtcs : stream.rtc
  const fallbackUrl = isHttpsPage ? stream.rtc : stream.rtcs
  const selectedUrl = preferredUrl || fallbackUrl

  if (!selectedUrl) {
    throw new WvpApiError('response', 'WVP 点播响应未提供可用的 rtc 或 rtcs 播放地址。')
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(selectedUrl)
  } catch {
    throw new WvpApiError('response', 'WVP 点播响应中的 WebRTC 播放地址无效。')
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new WvpApiError('response', 'WVP 点播响应中的 WebRTC 播放地址协议无效。')
  }

  return selectedUrl
}

function selectFlvUrl(stream: StreamContent): string | null {
  const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const preferredUrl = isHttpsPage ? stream.wssFlv : stream.wsFlv
  const fallbackUrl = isHttpsPage ? stream.wsFlv : stream.wssFlv
  const selectedUrl = preferredUrl || fallbackUrl

  if (!selectedUrl) {
    return null
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(selectedUrl)
  } catch {
    throw new WvpApiError('response', 'WVP 点播响应中的 FLV 播放地址无效。')
  }

  if (parsedUrl.protocol !== 'ws:' && parsedUrl.protocol !== 'wss:') {
    throw new WvpApiError('response', 'WVP 点播响应中的 FLV 播放地址协议无效。')
  }

  return selectedUrl
}

function readBusinessMessage(payload: Record<string, unknown>): string | null {
  const message = payload.msg
  return typeof message === 'string' && message.trim() !== '' ? message.trim() : null
}

function parseWvpResult(value: unknown): WvpResult<unknown> {
  if (!isRecord(value) || typeof value.code !== 'number') {
    throw new WvpApiError('response', 'WVP 响应格式错误：缺少数字类型的 code。')
  }

  return {
    code: value.code,
    msg: typeof value.msg === 'string' ? value.msg : null,
    data: value.data,
  }
}

export class WvpApi {
  private readonly baseUrl: string
  private readonly apiKey: string

  constructor(config: Pick<DemoConfig, 'wvpBaseUrl' | 'apiKey'>) {
    this.baseUrl = config.wvpBaseUrl.replace(/\/+$/, '')
    this.apiKey = config.apiKey
  }

  async startPlay(deviceId: string, channelId: string): Promise<PlayStartResponse> {
    const payload = await this.request(
      `/api/play/start/${encodeURIComponent(deviceId)}/${encodeURIComponent(channelId)}`,
      { responseMode: 'required-json' },
    )
    const result = parseWvpResult(payload)
    const stream = parseStreamContent(result.data)

    return {
      stream,
      webRtcUrl: selectWebRtcUrl(stream),
      flvUrl: selectFlvUrl(stream),
    }
  }

  async stopPlay(deviceId: string, channelId: string): Promise<void> {
    await this.request(
      `/api/play/stop/${encodeURIComponent(deviceId)}/${encodeURIComponent(channelId)}`,
      { responseMode: 'optional-json' },
    )
  }

  async sendPtz(deviceId: string, channelId: string, request: PtzRequest): Promise<void> {
    if (!isPtzCommand(request.command)) {
      throw new WvpApiError('response', '云台命令无效，未发送请求。')
    }

    if (!isIntegerInRange(request.horizonSpeed, 0, 255)) {
      throw new WvpApiError('response', '水平速度必须是 0-255 的整数，未发送请求。')
    }

    if (!isIntegerInRange(request.verticalSpeed, 0, 255)) {
      throw new WvpApiError('response', '垂直速度必须是 0-255 的整数，未发送请求。')
    }

    if (!isIntegerInRange(request.zoomSpeed, 0, 15)) {
      throw new WvpApiError('response', '变倍速度必须是 0-15 的整数，未发送请求。')
    }

    const query = new URLSearchParams({
      command: request.command,
      horizonSpeed: String(request.horizonSpeed),
      verticalSpeed: String(request.verticalSpeed),
      zoomSpeed: String(request.zoomSpeed),
    })

    await this.request(
      `/api/front-end/ptz/${encodeURIComponent(deviceId)}/${encodeURIComponent(channelId)}`,
      { query, responseMode: 'optional-json' },
    )
  }

  private buildUrl(path: string, query?: URLSearchParams): string {
    const url = new URL(`${this.baseUrl}${path}`)
    if (query) {
      url.search = query.toString()
    }
    return url.toString()
  }

  private async request(path: string, options: RequestOptions): Promise<unknown> {
    let response: Response
    try {
      response = await fetch(this.buildUrl(path, options.query), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'api-key': this.apiKey,
        },
      })
    } catch {
      throw new WvpApiError('network', '无法连接 WVP API，请检查地址、网络和 CORS 配置。')
    }

    if (response.status === 401 || response.status === 403) {
      throw new WvpApiError(
        'authentication',
        'WVP 拒绝了请求，请检查 ApiKey 是否有效、已启用并具有访问权限。',
        { status: response.status },
      )
    }

    if (!response.ok) {
      throw new WvpApiError('http', `WVP API 请求失败（HTTP ${response.status}）。`, {
        status: response.status,
      })
    }

    let responseText: string
    try {
      responseText = await response.text()
    } catch {
      throw new WvpApiError('response', '无法读取 WVP API 响应。')
    }

    if (responseText.trim() === '') {
      if (options.responseMode === 'required-json') {
        throw new WvpApiError('response', 'WVP API 返回了空响应。')
      }
      return undefined
    }

    let payload: unknown
    try {
      payload = JSON.parse(responseText)
    } catch {
      throw new WvpApiError('response', 'WVP API 返回的内容不是合法 JSON。')
    }

    if (!isRecord(payload)) {
      throw new WvpApiError('response', 'WVP API 返回的 JSON 格式错误。')
    }

    if ('code' in payload) {
      if (typeof payload.code !== 'number') {
        throw new WvpApiError('response', 'WVP 响应中的 code 格式错误。')
      }
      if (payload.code !== 0) {
        const serverMessage = readBusinessMessage(payload)
        const safeServerMessage =
          serverMessage && !serverMessage.includes(this.apiKey) ? `：${serverMessage}` : ''
        throw new WvpApiError(
          'business',
          `WVP 业务请求失败（code ${payload.code}）${safeServerMessage}`,
          { businessCode: payload.code },
        )
      }
    }

    return payload
  }
}

export function getWvpErrorMessage(error: unknown): string {
  if (error instanceof WvpApiError) {
    return error.message
  }

  return '请求失败，请检查浏览器网络面板和 WVP 服务状态。'
}
