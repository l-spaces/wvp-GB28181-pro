import { wvpGet } from './client'
import type {
  MediaInfo,
  PageInfo,
  ResourceInfo,
  StreamContent,
  WvpAlarm,
  WvpChannel,
  WvpDevice,
  PtzCommand,
} from '../types/api'

// ---------- 设备 / 通道 ----------

/** 分页查询国标设备 */
export function getDevices(page = 1, count = 100): Promise<PageInfo<WvpDevice>> {
  return wvpGet<PageInfo<WvpDevice>>('/api/device/query/devices', { page, count })
}

/** 分页查询设备的通道列表 */
export function getChannels(deviceId: string, page = 1, count = 100): Promise<PageInfo<WvpChannel>> {
  return wvpGet<PageInfo<WvpChannel>>(`/api/device/query/devices/${encodeURIComponent(deviceId)}/channels`, { page, count })
}

// ---------- 播放（源码"分屏监控"同款接口，channelId 为数据库主键） ----------

/** 播放通道，返回流地址 */
export function playStart(channelId: number): Promise<StreamContent> {
  return wvpGet<StreamContent>('/api/common/channel/play', { channelId })
}

/** 停止播放通道 */
export function playStop(channelId: number): Promise<unknown> {
  return wvpGet<unknown>('/api/common/channel/play/stop', { channelId })
}

// ---------- 云台（国标编号标识） ----------

/** 云台方向/变倍控制 */
export function sendPtz(
  deviceId: string,
  channelId: string,
  command: PtzCommand,
  horizonSpeed: number,
  verticalSpeed: number,
  zoomSpeed: number,
): Promise<unknown> {
  return wvpGet<unknown>(`/api/front-end/ptz/${encodeURIComponent(deviceId)}/${encodeURIComponent(channelId)}`, {
    command,
    horizonSpeed,
    verticalSpeed,
    zoomSpeed,
  })
}

/** 调用预置位 */
export function presetCall(deviceId: string, channelId: string, presetId: number): Promise<unknown> {
  return wvpGet<unknown>(`/api/front-end/preset/call/${encodeURIComponent(deviceId)}/${encodeURIComponent(channelId)}`, { presetId })
}

/** 开始巡航 */
export function cruiseStart(deviceId: string, channelId: string, cruiseId: number): Promise<unknown> {
  return wvpGet<unknown>(`/api/front-end/cruise/start/${encodeURIComponent(deviceId)}/${encodeURIComponent(channelId)}`, { cruiseId })
}

/** 停止巡航 */
export function cruiseStop(deviceId: string, channelId: string, cruiseId: number): Promise<unknown> {
  return wvpGet<unknown>(`/api/front-end/cruise/stop/${encodeURIComponent(deviceId)}/${encodeURIComponent(channelId)}`, { cruiseId })
}

// ---------- 聚焦 / 光圈 / 拉框（channelId 为数据库主键 gbId，整数） ----------

/** 聚焦控制：command = near / far / stop */
export function sendFocus(gbId: number, command: 'near' | 'far' | 'stop', speed: number): Promise<unknown> {
  return wvpGet<unknown>('/api/common/channel/front-end/fi/focus', { channelId: gbId, command, speed })
}

/** 光圈控制：command = in / out / stop */
export function sendIris(gbId: number, command: 'in' | 'out' | 'stop', speed: number): Promise<unknown> {
  return wvpGet<unknown>('/api/common/channel/front-end/fi/iris', { channelId: gbId, command, speed })
}

/** 拉框放大 / 缩小（矩形为播放窗口像素坐标） */
export function sendDragZoom(
  gbId: number,
  direction: 'in' | 'out',
  rect: { length: number; width: number; midPointX: number; midPointY: number; lengthX: number; lengthY: number },
): Promise<unknown> {
  const path = direction === 'in' ? '/api/common/channel/front-end/drag_zoom_in' : '/api/common/channel/front-end/drag_zoom_out'
  return wvpGet<unknown>(path, { channelId: gbId, ...rect })
}

// ---------- 统计 / 告警 / 媒体信息 ----------

/** 设备/通道/推流/代理资源统计 */
export function getResourceInfo(): Promise<ResourceInfo> {
  return wvpGet<ResourceInfo>('/api/server/resource/info')
}

/** 分页查询告警列表 */
export function getAlarmList(page = 1, count = 5): Promise<PageInfo<WvpAlarm>> {
  return wvpGet<PageInfo<WvpAlarm>>('/api/alarm/list', { page, count })
}

/** 查询媒体流编码信息（视频信息面板数据源） */
export function getMediaInfo(app: string, stream: string, mediaServerId: string): Promise<MediaInfo> {
  return wvpGet<MediaInfo>('/api/server/media_server/media_info', { app, stream, mediaServerId })
}
