export interface DemoConfig {
  wvpBaseUrl: string
  apiKey: string
  devices: DeviceConfig[]
}

export interface DeviceConfig {
  deviceId: string
  name: string
  channels: ChannelConfig[]
}

export interface ChannelConfig {
  channelId: string
  name: string
}
