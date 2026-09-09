import { wvpGet, wvpPost } from './client'
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

/** 预置点（GET /api/common/channel/front-end/preset/query） */
export interface PresetItem {
  presetId: string
  presetName: string | null
}

/** 查询通道预置点（channelId 为数据库主键；设备端可能不响应，会超时报错） */
export function queryPresets(gbId: number): Promise<PresetItem[]> {
  return wvpGet<PresetItem[]>('/api/common/channel/front-end/preset/query', { channelId: gbId })
}

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

// ---------- 用户 ----------

/** 用户信息（取 pushKey，WebRTC 推流鉴权用） */
export interface UserInfo {
  id: number
  username: string
  pushKey: string | null
}

export function getUserInfo(): Promise<UserInfo> {
  return wvpPost<UserInfo>('/api/user/userInfo')
}

// ---------- 语音对讲 ----------

/** 对讲返回：pushStream 麦克风推流地址 + playStream 设备声音回放地址 */
export interface TalkStream {
  app: string
  stream: string
  rtc?: string | null
  rtcs?: string | null
  flv?: string | null
  https_flv?: string | null
  ws_flv?: string | null
  wss_flv?: string | null
}

export interface TalkStartResult {
  pushStream: TalkStream
  playStream: TalkStream | null
}

/** 开始对讲（channelId 为通道数据库主键） */
export function talkStart(channelId: number): Promise<TalkStartResult> {
  return wvpGet<TalkStartResult>('/api/common/channel/talk/start', { channelId })
}

/** 停止对讲 */
export function talkStop(channelId: number): Promise<unknown> {
  return wvpGet<unknown>('/api/common/channel/talk/stop', { channelId })
}

// ---------- 云端录像 ----------

/** 云端录像条目（GET /api/cloud/record/list） */
export interface CloudRecordItem {
  id: number
  app: string
  stream: string
  startTime: number
  endTime: number
  /** 时长（毫秒） */
  timeLen: number
  mediaServerId: string
  fileName: string
}

export interface CloudRecordPage {
  total: number
  list: CloudRecordItem[]
}

/** 查询云端录像列表（分页） */
export function getCloudRecords(params: {
  app?: string
  stream?: string
  startTime?: string
  endTime?: string
  mediaServerId?: string
  page: number
  count: number
  ascOrder?: boolean
}): Promise<CloudRecordPage> {
  return wvpGet<CloudRecordPage>('/api/cloud/record/list', { ...params, ascOrder: params.ascOrder === undefined ? undefined : String(params.ascOrder) })
}

/** 加载录像为可播放流（返回 ws_flv 等地址） */
export function loadCloudRecord(app: string, stream: string, cloudRecordId: number): Promise<StreamContent> {
  return wvpGet<StreamContent>('/api/cloud/record/loadRecord', { app, stream, cloudRecordId })
}

/** 获取录像文件下载地址 */
export function getCloudRecordPath(recordId: number): Promise<{ httpPath: string }> {
  return wvpGet<{ httpPath: string }>('/api/cloud/record/play/path', { recordId })
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
