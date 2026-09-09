import type { ChannelConfig, DemoConfig, DeviceConfig } from '../types/config'

export class ConfigLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigLoadError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigLoadError(`配置项 ${field} 必须是非空字符串。`)
  }

  return value.trim()
}

function normalizeBaseUrl(value: unknown): string {
  const baseUrl = readNonEmptyString(value, 'wvpBaseUrl').replace(/\/+$/, '')

  let parsedUrl: URL
  try {
    parsedUrl = new URL(baseUrl)
  } catch {
    throw new ConfigLoadError('配置项 wvpBaseUrl 必须是完整有效的 HTTP 或 HTTPS 地址。')
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new ConfigLoadError('配置项 wvpBaseUrl 仅支持 http:// 或 https:// 地址。')
  }

  if (parsedUrl.search !== '' || parsedUrl.hash !== '') {
    throw new ConfigLoadError('配置项 wvpBaseUrl 不能包含查询参数或锚点。')
  }

  return baseUrl
}

function parseChannel(value: unknown, deviceIndex: number, channelIndex: number): ChannelConfig {
  const fieldPrefix = `devices[${deviceIndex}].channels[${channelIndex}]`
  if (!isRecord(value)) {
    throw new ConfigLoadError(`配置项 ${fieldPrefix} 必须是对象。`)
  }

  return {
    channelId: readNonEmptyString(value.channelId, `${fieldPrefix}.channelId`),
    name: readNonEmptyString(value.name, `${fieldPrefix}.name`),
  }
}

function parseDevice(value: unknown, deviceIndex: number): DeviceConfig {
  const fieldPrefix = `devices[${deviceIndex}]`
  if (!isRecord(value)) {
    throw new ConfigLoadError(`配置项 ${fieldPrefix} 必须是对象。`)
  }

  if (!Array.isArray(value.channels)) {
    throw new ConfigLoadError(`配置项 ${fieldPrefix}.channels 必须是数组。`)
  }

  if (value.channels.length === 0) {
    throw new ConfigLoadError(`配置项 ${fieldPrefix}.channels 不能为空。`)
  }

  const channelIds = new Set<string>()
  const channels = value.channels.map((channel, channelIndex) => {
    const parsedChannel = parseChannel(channel, deviceIndex, channelIndex)
    if (channelIds.has(parsedChannel.channelId)) {
      throw new ConfigLoadError(
        `配置项 ${fieldPrefix}.channels 存在重复的 channelId：${parsedChannel.channelId}。`,
      )
    }
    channelIds.add(parsedChannel.channelId)
    return parsedChannel
  })

  return {
    deviceId: readNonEmptyString(value.deviceId, `${fieldPrefix}.deviceId`),
    name: readNonEmptyString(value.name, `${fieldPrefix}.name`),
    channels,
  }
}

export function parseConfig(value: unknown): DemoConfig {
  if (!isRecord(value)) {
    throw new ConfigLoadError('config.json 顶层必须是 JSON 对象。')
  }

  if (!Array.isArray(value.devices)) {
    throw new ConfigLoadError('配置项 devices 必须是数组。')
  }

  if (value.devices.length === 0) {
    throw new ConfigLoadError('配置项 devices 不能为空。')
  }

  const deviceIds = new Set<string>()
  const devices = value.devices.map((device, deviceIndex) => {
    const parsedDevice = parseDevice(device, deviceIndex)
    if (deviceIds.has(parsedDevice.deviceId)) {
      throw new ConfigLoadError(`配置项 devices 存在重复的 deviceId：${parsedDevice.deviceId}。`)
    }
    deviceIds.add(parsedDevice.deviceId)
    return parsedDevice
  })

  return {
    wvpBaseUrl: normalizeBaseUrl(value.wvpBaseUrl),
    apiKey: readNonEmptyString(value.apiKey, 'apiKey'),
    devices,
  }
}

export async function loadConfig(configUrl = '/config.json'): Promise<DemoConfig> {
  let response: Response
  try {
    response = await fetch(configUrl, { cache: 'no-store' })
  } catch {
    throw new ConfigLoadError('无法加载 config.json，请检查文件是否存在以及页面网络连接。')
  }

  if (!response.ok) {
    throw new ConfigLoadError(`无法加载 config.json（HTTP ${response.status}）。`)
  }

  let rawConfig: unknown
  try {
    rawConfig = await response.json()
  } catch {
    throw new ConfigLoadError('config.json 不是合法的 JSON。')
  }

  return parseConfig(rawConfig)
}
