/** WVP 后端接口类型定义 */

/** 国标设备（GET /api/device/query/devices） */
export interface WvpDevice {
  deviceId: string
  name: string
  onLine: boolean
  channelCount: number
  ip?: string
  manufacturer?: string
}

/** 国标通道（GET /api/device/query/devices/{deviceId}/channels） */
export interface WvpChannel {
  /** 通道国标编号（字符串），用于 /api/play/* 与 /api/front-end/* */
  deviceId: string
  /** 通道数据库主键（整数，注意该接口的 gbId 字段是坏数据恒 0，取 id 字段），用于 /api/common/channel/* */
  gbId: number
  /** 通道数据库主键（接口原始返回字段） */
  id?: number
  name: string
  /** ON / OFF */
  status: string
  /** 云台类型，>0 表示支持云台 */
  ptzType: number
  /** 所属设备国标编号（前端补齐） */
  deviceDeviceId?: string
  deviceName?: string
}

export interface PageInfo<T> {
  total: number
  list: T[]
}

/** 告警（GET /api/alarm/list） */
export interface WvpAlarm {
  id: number
  alarmTime: string
  alarmType: string
  channelDeviceId?: string
  deviceId?: string
  channelName?: string
  /** 处理状态 */
  status?: number
}

/** 资源统计（GET /api/server/resource/info） */
export interface ResourceInfo {
  device: { total: number; online: number }
  channel: { total: number; online: number }
  push: { total: number; online: number }
  proxy: { total: number; online: number }
}

/** 媒体流信息（GET /api/server/media_server/media_info，源码"编码信息"tab 同源） */
export interface MediaInfo {
  app: string
  stream: string
  schema?: string
  readerCount: number
  videoCodec: string | null
  width: number
  height: number
  fps: number
  loss: number
  audioCodec?: string | null
  audioSampleRate?: number | null
  aliveSecond: number
  bytesSpeed: number
}

/** 点播返回的流地址集合（GET /api/play/start/{deviceId}/{channelId}） */
export interface StreamContent {
  app: string
  stream: string
  mediaServerId: string
  flv?: string | null
  https_flv?: string | null
  ws_flv?: string | null
  wss_flv?: string | null
  fmp4?: string | null
  https_fmp4?: string | null
  ws_fmp4?: string | null
  wss_fmp4?: string | null
  hls?: string | null
  https_hls?: string | null
  ts?: string | null
  https_ts?: string | null
  rtmp?: string | null
  rtsp?: string | null
  rtc?: string | null
  rtcs?: string | null
}

/** 云台方向指令（/api/front-end/ptz command 参数） */
export type PtzCommand =
  | 'up' | 'down' | 'left' | 'right'
  | 'upleft' | 'upright' | 'downleft' | 'downright'
  | 'zoomin' | 'zoomout' | 'stop'
