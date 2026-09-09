export interface WvpResult<T> {
  code: number
  msg?: string | null
  data?: T | null
}

export interface StreamContent {
  rtc?: string | null
  rtcs?: string | null
  wsFlv?: string | null
  wssFlv?: string | null
}

export type PtzCommand =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'upleft'
  | 'upright'
  | 'downleft'
  | 'downright'
  | 'zoomin'
  | 'zoomout'
  | 'stop'

export interface PtzRequest {
  command: PtzCommand
  horizonSpeed: number
  verticalSpeed: number
  zoomSpeed: number
}

export interface PlayStartResponse {
  stream: StreamContent
  webRtcUrl: string
  flvUrl: string | null
}
