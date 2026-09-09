export interface ZlmRtcEndpointOptions {
  element: HTMLVideoElement
  debug: boolean
  zlmsdpUrl: string
  simulecast: boolean
  useCamera: boolean
  audioEnable: boolean
  videoEnable: boolean
  recvOnly: boolean
  usedatachannel: boolean
}

export interface ZlmRtcEndpoint {
  on(event: string, listener: (payload: unknown) => void): void
  close(): void
}

export interface ZlmRtcEvents {
  WEBRTC_NOT_SUPPORT: string
  WEBRTC_ICE_CANDIDATE_ERROR: string
  WEBRTC_OFFER_ANWSER_EXCHANGE_FAILED: string
  WEBRTC_ON_REMOTE_STREAMS: string
  WEBRTC_ON_CONNECTION_STATE_CHANGE: string
}

export interface ZlmRtcClient {
  Endpoint: new (options: ZlmRtcEndpointOptions) => ZlmRtcEndpoint
  Events: ZlmRtcEvents
}

export interface JessibucaPlayer {
  on(event: string, listener: (payload?: unknown) => void): void
  play(url: string): void
  destroy(): void
}

export interface JessibucaOptions {
  container: HTMLElement | string
  videoBuffer?: number
  isResize?: boolean
  decoder?: string
  loadingText?: string
  hasAudio?: boolean
  supportDblclickFullscreen?: boolean
  [key: string]: unknown
}

export interface JessibucaConstructor {
  new (options: JessibucaOptions): JessibucaPlayer
}

declare global {
  interface Window {
    ZLMRTCClient?: ZlmRtcClient
    Jessibuca?: JessibucaConstructor
  }
}

export {}
