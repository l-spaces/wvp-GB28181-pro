<template>
  <main class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">WVP THIRD-PARTY DEMO</p>
        <h1>ApiKey 实时播放与云台控制</h1>
        <p class="subtitle">选择设备和通道，播放一路实时视频并发送云台指令。</p>
      </div>
      <span class="config-state" :class="`config-state--${loadingConfig ? 'loading' : configError ? 'error' : 'ready'}`">
        {{ loadingConfig ? '正在加载配置' : configError ? '配置不可用' : '配置已加载' }}
      </span>
    </header>

    <section v-if="loadingConfig" class="notice notice--info" role="status">
      正在读取 public/config.json，请稍候。
    </section>

    <section v-else-if="configError" class="notice notice--error" role="alert">
      <strong>配置加载失败</strong>
      <span>{{ configError }}</span>
      <span>请修正部署目录中的 public/config.json 后重新加载页面。</span>
    </section>

    <template v-else-if="config">
      <section class="selection-card panel-card" aria-labelledby="selection-title">
        <div class="panel-heading">
          <div>
            <h2 id="selection-title">设备与通道</h2>
            <p>播放和云台控制都会作用于当前选中的通道。</p>
          </div>
        </div>

        <div class="selection-fields">
          <label>
            <span>设备</span>
            <select
              :value="selectedDeviceId"
              :disabled="selectionDisabled"
              @change="handleDeviceChange"
            >
              <option v-for="device in config.devices" :key="device.deviceId" :value="device.deviceId">
                {{ device.name }}（{{ device.deviceId }}）
              </option>
            </select>
          </label>
          <label>
            <span>通道</span>
            <select
              :value="selectedChannelId"
              :disabled="selectionDisabled || !selectedDevice"
              @change="handleChannelChange"
            >
              <option
                v-for="channel in selectedDevice?.channels ?? []"
                :key="channel.channelId"
                :value="channel.channelId"
              >
                {{ channel.name }}（{{ channel.channelId }}）
              </option>
            </select>
          </label>
        </div>

        <p v-if="selectedDevice && selectedChannel" class="selection-summary">
          当前通道：{{ selectedDevice.name }} / {{ selectedChannel.name }}
        </p>
        <p v-else class="selection-summary selection-summary--error">
          当前没有有效的设备或通道，不能发送 WVP 请求。
        </p>
      </section>

      <section class="media-card panel-card" aria-labelledby="media-title">
        <div class="panel-heading">
          <div>
            <h2 id="media-title">实时视频</h2>
            <p>{{ playerStatusText }}</p>
          </div>
          <span v-if="activeSession" class="session-label" role="status">
            {{ activeSession.deviceId }} / {{ activeSession.channelId }}
          </span>
          <span v-if="isPlaying" class="playing-label" role="status">已连接</span>
        </div>

        <VideoPlayer :url="playerUrl" :mode="playerMode" @playing="handlePlayerPlaying" @error="handlePlayerError" />

        <div class="media-actions">
          <label class="player-mode-field">
            <span>播放器</span>
            <select
              :value="playerMode"
              :disabled="isStarting || isStopping || isSwitching"
              @change="handlePlayerModeChange"
            >
              <option value="jessibuca">Jessibuca（H265 兼容）</option>
              <option value="webrtc">WebRTC（低延迟）</option>
            </select>
          </label>
          <button
            type="button"
            class="primary-button"
            :disabled="!canStartPlayback"
            @click="startPlayback"
          >
            {{ isStarting ? '正在请求播放…' : '开始播放' }}
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="!canStopPlayback"
            @click="stopPlaybackFromButton"
          >
            {{ isStopping ? '正在停止…' : '停止播放' }}
          </button>
        </div>
      </section>

      <PtzPanel
        :busy="ptzBusy"
        :available="canUsePtz"
        @command="handlePtzCommand"
      />
      <p v-if="ptzBusy && ptzCommand" class="ptz-busy-message" role="status">
        正在发送云台“{{ ptzLabels[ptzCommand] }}”指令，请勿重复提交。
      </p>
    </template>

    <p v-if="message" class="operation-message" :class="`operation-message--${messageKind}`" role="status">
      {{ message }}
    </p>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import PtzPanel from './components/PtzPanel.vue'
import VideoPlayer from './components/VideoPlayer.vue'
import { getWvpErrorMessage, WvpApi } from './api/wvp'
import { ConfigLoadError, loadConfig } from './config/loader'
import type { DemoConfig } from './types/config'
import type { PtzCommand, PtzRequest } from './types/wvp'

type MessageKind = 'info' | 'success' | 'error'
type PlayerMode = 'webrtc' | 'jessibuca'

interface PlaybackSession {
  deviceId: string
  channelId: string
}

interface StopResult {
  ok: boolean
  errorMessage?: string
}

interface StopOptions {
  notify?: boolean
}

interface PendingStart {
  token: number
  client: WvpApi
  deviceId: string
  channelId: string
  canceled: boolean
}

const loadingConfig = ref(true)
const configError = ref('')
const config = ref<DemoConfig | null>(null)
const apiClient = shallowRef<WvpApi | null>(null)

const selectedDeviceId = ref('')
const selectedChannelId = ref('')
const isStarting = ref(false)
const isPlaying = ref(false)
const isStopping = ref(false)
const isSwitching = ref(false)
const playerUrl = ref<string | null>(null)
const activeSession = ref<PlaybackSession | null>(null)
const playerMode = ref<PlayerMode>('jessibuca')
const playerStatus = ref<'idle' | 'connecting' | 'playing'>('idle')
const ptzBusy = ref(false)
const ptzCommand = ref<PtzCommand | null>(null)
const message = ref('')
const messageKind = ref<MessageKind>('info')
const cleanupLock = shallowRef<PendingStart | null>(null)

let playbackToken = 0
let isUnmounted = false
let pendingStart: PendingStart | null = null
let sessionPlayOptions: { webRtcUrl: string; flvUrl: string | null } | null = null

const selectedDevice = computed(() => {
  return config.value?.devices.find((device) => device.deviceId === selectedDeviceId.value) ?? null
})

const selectedChannel = computed(() => {
  return selectedDevice.value?.channels.find((channel) => channel.channelId === selectedChannelId.value) ?? null
})

const selectionDisabled = computed(() => {
  return loadingConfig.value || isStarting.value || isStopping.value || isSwitching.value || ptzBusy.value
})

const canStartPlayback = computed(() => {
  return Boolean(
    apiClient.value &&
      selectedDevice.value &&
      selectedChannel.value &&
      !isStarting.value &&
      !isStopping.value &&
      !isSwitching.value &&
      cleanupLock.value === null &&
      pendingStart === null &&
      activeSession.value === null &&
      playerUrl.value === null,
  )
})

const canStopPlayback = computed(() => {
  return Boolean(
    (activeSession.value || playerUrl.value) &&
      !isStarting.value &&
      !isStopping.value &&
      !isSwitching.value,
  )
})

const canUsePtz = computed(() => {
  return Boolean(selectedDevice.value && selectedChannel.value && !isSwitching.value)
})

const playerStatusText = computed(() => {
  if (isStarting.value) {
    return '正在请求 WVP 点播地址…'
  }
  if (isStopping.value) {
    return '正在释放播放会话…'
  }
  if (playerStatus.value === 'connecting') {
    return '已取得地址，正在连接播放器…'
  }
  if (playerStatus.value === 'playing') {
    return `${playerMode.value === 'jessibuca' ? 'Jessibuca' : 'WebRTC'} 播放中`
  }
  return '尚未开始播放'
})

const ptzLabels: Record<PtzCommand, string> = {
  left: '左',
  right: '右',
  up: '上',
  down: '下',
  upleft: '左上',
  upright: '右上',
  downleft: '左下',
  downright: '右下',
  zoomin: '放大',
  zoomout: '缩小',
  stop: '停止',
}

function setMessage(text: string, kind: MessageKind = 'info'): void {
  message.value = text
  messageKind.value = kind
}

function readSelectValue(event: Event): string | null {
  const target = event.currentTarget
  return target instanceof HTMLSelectElement ? target.value : null
}

async function initialize(): Promise<void> {
  try {
    const loadedConfig = await loadConfig()
    if (isUnmounted) {
      return
    }

    config.value = loadedConfig
    apiClient.value = new WvpApi(loadedConfig)
    selectedDeviceId.value = loadedConfig.devices[0].deviceId
    selectedChannelId.value = loadedConfig.devices[0].channels[0].channelId
    setMessage('配置已加载，请选择通道后开始播放。', 'success')
  } catch (error: unknown) {
    if (isUnmounted) {
      return
    }

    configError.value = error instanceof ConfigLoadError ? error.message : '配置加载失败，请检查 config.json。'
    setMessage(configError.value, 'error')
  } finally {
    if (!isUnmounted) {
      loadingConfig.value = false
    }
  }
}

async function cleanupCanceledStart(start: PendingStart): Promise<StopResult> {
  try {
    await start.client.stopPlay(start.deviceId, start.channelId)
    return { ok: true }
  } catch (error: unknown) {
    return {
      ok: false,
      errorMessage: `已取消本地播放器创建，但停止 WVP 点播失败：${getWvpErrorMessage(error)}`,
    }
  } finally {
    if (cleanupLock.value?.token === start.token) {
      cleanupLock.value = null
      isStopping.value = false
    }
  }
}

async function startPlayback(): Promise<void> {
  const client = apiClient.value
  const device = selectedDevice.value
  const channel = selectedChannel.value
  if (!client || !device || !channel || !canStartPlayback.value) {
    setMessage('请先加载有效配置并选择设备和通道。', 'error')
    return
  }

  const token = ++playbackToken
  pendingStart = {
    token,
    client,
    deviceId: device.deviceId,
    channelId: channel.channelId,
    canceled: false,
  }
  isStarting.value = true
  playerStatus.value = 'connecting'
  setMessage(`正在请求 ${device.name} / ${channel.name} 的播放地址…`)

  try {
    const result = await client.startPlay(device.deviceId, channel.channelId)
    const completedStart = pendingStart
    if (!completedStart || completedStart.token !== token || completedStart.canceled || isUnmounted) {
      if (completedStart?.token !== token) {
        return
      }

      pendingStart = null
      const cleanupResult = await cleanupCanceledStart(completedStart)
      if (!cleanupResult.ok && !isUnmounted) {
        setMessage(cleanupResult.errorMessage ?? '停止已取消的 WVP 点播失败。', 'error')
      }
      return
    }

    pendingStart = null
    activeSession.value = {
      deviceId: device.deviceId,
      channelId: channel.channelId,
    }
    sessionPlayOptions = { webRtcUrl: result.webRtcUrl, flvUrl: result.flvUrl }
    isStarting.value = false
    const sessionUrl = resolveSessionUrl(playerMode.value)
    if (sessionUrl) {
      playerUrl.value = sessionUrl
    } else {
      playerMode.value = 'webrtc'
      playerUrl.value = result.webRtcUrl
      setMessage('WVP 未返回 FLV 播放地址，已改用 WebRTC 播放器。')
    }
    isPlaying.value = false
    playerStatus.value = 'connecting'
    setMessage('WVP 点播成功，正在建立媒体连接。')
  } catch (error: unknown) {
    const abortedStart = pendingStart
    if (abortedStart?.token === token && (abortedStart.canceled || isUnmounted)) {
      pendingStart = null
      const cleanupResult = await cleanupCanceledStart(abortedStart)
      if (!cleanupResult.ok && !isUnmounted) {
        setMessage(cleanupResult.errorMessage ?? '停止已取消的 WVP 点播失败。', 'error')
      }
      return
    }

    if (pendingStart?.token === token) {
      pendingStart = null
    }

    if (token === playbackToken && !isUnmounted) {
      playerUrl.value = null
      activeSession.value = null
      sessionPlayOptions = null
      isPlaying.value = false
      playerStatus.value = 'idle'
      setMessage(getWvpErrorMessage(error), 'error')
    }
  } finally {
    if (token === playbackToken && !isUnmounted) {
      isStarting.value = false
    }
  }
}

async function stopPlayback(options: StopOptions = {}): Promise<StopResult> {
  const notify = options.notify ?? true
  const session = activeSession.value
  const startToStop = pendingStart
  const hasLocalPlayback = session !== null || playerUrl.value !== null || startToStop !== null

  if (!hasLocalPlayback) {
    playerUrl.value = null
    sessionPlayOptions = null
    isPlaying.value = false
    playerStatus.value = 'idle'
    return { ok: true }
  }

  playbackToken += 1
  if (startToStop) {
    pendingStart = { ...startToStop, canceled: true }
    cleanupLock.value = startToStop
  }
  isStarting.value = false
  isStopping.value = true
  activeSession.value = null
  playerUrl.value = null
  sessionPlayOptions = null
  isPlaying.value = false
  playerStatus.value = 'idle'

  // 等待 VideoPlayer 的 url watcher 释放 Endpoint，再请求 WVP 停止点播。
  await nextTick()

  if (startToStop) {
    // startPlay 尚未返回时不能提前停止，否则停止请求可能先于建立会话。
    // cleanupLock 会持续阻塞新的播放；startPlayback 收到返回后会使用
    // 原始上下文执行一次停止，并在请求完成后释放锁。
    return { ok: true }
  }

  if (!session || !apiClient.value) {
    isStopping.value = false
    return { ok: true }
  }

  try {
    await apiClient.value.stopPlay(session.deviceId, session.channelId)
    if (notify) {
      setMessage('播放已停止，本地播放器和 WVP 会话均已清理。', 'success')
    }
    return { ok: true }
  } catch (error: unknown) {
    const errorMessage = `本地播放器已释放，但停止 WVP 点播失败：${getWvpErrorMessage(error)}`
    if (notify) {
      setMessage(errorMessage, 'error')
    }
    return { ok: false, errorMessage }
  } finally {
    isStopping.value = false
  }
}

async function stopPlaybackFromButton(): Promise<void> {
  await stopPlayback({ notify: true })
}

async function switchSelection(deviceId: string, channelId: string): Promise<void> {
  if (isSwitching.value) {
    return
  }

  isSwitching.value = true
  const stopResult = await stopPlayback({ notify: false })
  selectedDeviceId.value = deviceId
  selectedChannelId.value = channelId
  isSwitching.value = false

  const device = selectedDevice.value
  const channel = selectedChannel.value
  if (!stopResult.ok) {
    setMessage(
      `已切换到 ${device?.name ?? deviceId} / ${channel?.name ?? channelId}，但旧播放会话停止失败：${stopResult.errorMessage}`,
      'error',
    )
  } else {
    setMessage(`已切换到 ${device?.name ?? deviceId} / ${channel?.name ?? channelId}，不会自动播放。`, 'success')
  }
}

function handleDeviceChange(event: Event): void {
  const deviceId = readSelectValue(event)
  if (!deviceId || deviceId === selectedDeviceId.value) {
    return
  }

  const device = config.value?.devices.find((item) => item.deviceId === deviceId)
  if (!device || device.channels.length === 0) {
    setMessage('所选设备没有有效通道，未切换选择。', 'error')
    return
  }

  void switchSelection(device.deviceId, device.channels[0].channelId)
}

function handleChannelChange(event: Event): void {
  const channelId = readSelectValue(event)
  if (!channelId || channelId === selectedChannelId.value || !selectedDevice.value) {
    return
  }

  const channel = selectedDevice.value.channels.find((item) => item.channelId === channelId)
  if (!channel) {
    setMessage('所选通道无效，未切换选择。', 'error')
    return
  }

  void switchSelection(selectedDevice.value.deviceId, channel.channelId)
}

function resolveSessionUrl(mode: PlayerMode): string | null {
  if (!sessionPlayOptions) {
    return null
  }

  return mode === 'jessibuca' ? sessionPlayOptions.flvUrl : sessionPlayOptions.webRtcUrl
}

function handlePlayerModeChange(event: Event): void {
  const value = readSelectValue(event)
  if ((value !== 'webrtc' && value !== 'jessibuca') || value === playerMode.value) {
    return
  }

  if (!activeSession.value) {
    playerMode.value = value
    return
  }

  const sessionUrl = resolveSessionUrl(value)
  if (!sessionUrl) {
    setMessage('当前点播会话没有 FLV 播放地址，无法切换到 Jessibuca。', 'error')
    return
  }

  playerMode.value = value
  isPlaying.value = false
  playerStatus.value = 'connecting'
  playerUrl.value = sessionUrl
  setMessage(`已切换到${value === 'jessibuca' ? 'Jessibuca' : 'WebRTC'}播放器，正在重新连接…`)
}

function handlePlayerPlaying(): void {
  if (!activeSession.value || !playerUrl.value || isStopping.value) {
    return
  }

  isPlaying.value = true
  playerStatus.value = 'playing'
  setMessage(`${playerMode.value === 'jessibuca' ? 'Jessibuca' : 'WebRTC'} 播放成功。`, 'success')
}

function handlePlayerError(errorMessage: string): void {
  if (isStopping.value || !playerUrl.value) {
    return
  }

  const session = activeSession.value
  const mediaMessage = `媒体播放失败：${errorMessage}`
  setMessage(mediaMessage, 'error')

  if (!session) {
    return
  }

  void stopPlayback({ notify: false }).then((stopResult) => {
    if (!stopResult.ok) {
      setMessage(`${mediaMessage}；${stopResult.errorMessage ?? '停止 WVP 点播失败。'}`, 'error')
    }
  })
}

async function handlePtzCommand(request: PtzRequest): Promise<void> {
  const client = apiClient.value
  const device = selectedDevice.value
  const channel = selectedChannel.value
  if (!client || !device || !channel || ptzBusy.value || !canUsePtz.value) {
    setMessage('请先选择有效的设备和通道，且等待当前云台请求完成。', 'error')
    return
  }

  ptzBusy.value = true
  ptzCommand.value = request.command
  setMessage(`正在发送云台“${ptzLabels[request.command]}”指令…`)

  try {
    await client.sendPtz(device.deviceId, channel.channelId, request)
    setMessage(`云台“${ptzLabels[request.command]}”指令已发送。`, 'success')
  } catch (error: unknown) {
    setMessage(getWvpErrorMessage(error), 'error')
  } finally {
    ptzBusy.value = false
    ptzCommand.value = null
  }
}

onMounted(() => {
  void initialize()
})

onBeforeUnmount(() => {
  isUnmounted = true
  void stopPlayback({ notify: false })
})
</script>

<style>
:root {
  color: #152238;
  background: #f4f7fb;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* {
  box-sizing: border-box;
}

body {
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
}

button,
input,
select {
  font: inherit;
}

.app-shell {
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
  padding: 36px 0 56px;
}

.app-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}

.eyebrow {
  margin: 0 0 8px;
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

h1 {
  margin: 0;
  color: #0f172a;
  font-size: clamp(26px, 4vw, 36px);
  line-height: 1.2;
}

.subtitle {
  margin: 10px 0 0;
  color: #64748b;
  font-size: 15px;
}

.config-state,
.session-label {
  flex: none;
  padding: 7px 11px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.config-state--loading {
  background: #e0e7ff;
  color: #4338ca;
}

.config-state--ready {
  background: #dcfce7;
  color: #166534;
}

.config-state--error {
  background: #fee2e2;
  color: #b91c1c;
}

.panel-card,
.ptz-panel {
  margin-bottom: 20px;
}

.selection-card,
.media-card {
  padding: 24px;
  border: 1px solid #dbe4ef;
  border-radius: 12px;
  background: #fff;
}

.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.panel-heading h2 {
  margin: 0;
  color: #152238;
  font-size: 20px;
}

.panel-heading p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
}

.session-label {
  max-width: 50%;
  overflow: hidden;
  background: #f1f5f9;
  color: #475569;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playing-label {
  flex: none;
  padding: 7px 11px;
  border-radius: 999px;
  background: #dcfce7;
  color: #166534;
  font-size: 12px;
  font-weight: 600;
}

.selection-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 20px;
}

.selection-fields label {
  display: grid;
  gap: 7px;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
}

.selection-fields select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  background: #fff;
  color: #152238;
}

.selection-fields select:focus {
  outline: 2px solid #93c5fd;
  outline-offset: 1px;
  border-color: #2563eb;
}

.selection-fields select:disabled {
  cursor: not-allowed;
  background: #f8fafc;
  color: #94a3b8;
}

.selection-summary {
  margin: 14px 0 0;
  color: #475569;
  font-size: 13px;
}

.selection-summary--error {
  color: #b91c1c;
}

.media-card .video-player {
  margin-top: 20px;
}

.media-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  margin-top: 16px;
}

.player-mode-field {
  display: grid;
  gap: 6px;
  min-width: 200px;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
}

.player-mode-field select {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  background: #fff;
  color: #152238;
}

.player-mode-field select:focus {
  outline: 2px solid #93c5fd;
  outline-offset: 1px;
  border-color: #2563eb;
}

.player-mode-field select:disabled {
  cursor: not-allowed;
  background: #f8fafc;
  color: #94a3b8;
}

.primary-button,
.secondary-button {
  min-width: 120px;
  padding: 10px 16px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}

.primary-button {
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #fff;
}

.primary-button:hover:not(:disabled) {
  background: #1d4ed8;
}

.secondary-button {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
}

.secondary-button:hover:not(:disabled) {
  border-color: #64748b;
  background: #f8fafc;
}

.primary-button:focus-visible,
.secondary-button:focus-visible {
  outline: 2px solid #1d4ed8;
  outline-offset: 2px;
}

.primary-button:disabled,
.secondary-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.notice,
.operation-message {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 13px 16px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
}

.notice {
  margin-bottom: 20px;
}

.notice--info {
  background: #eff6ff;
  color: #1d4ed8;
}

.notice--error,
.operation-message--error {
  background: #fef2f2;
  color: #b91c1c;
}

.operation-message {
  margin: 4px 0 0;
}

.ptz-busy-message {
  margin: -8px 0 20px;
  color: #2563eb;
  font-size: 13px;
}

.operation-message--info {
  background: #eff6ff;
  color: #1d4ed8;
}

.operation-message--success {
  background: #f0fdf4;
  color: #166534;
}

@media (max-width: 680px) {
  .app-shell {
    width: min(100% - 24px, 1120px);
    padding-top: 24px;
  }

  .app-header {
    display: block;
  }

  .config-state {
    display: inline-block;
    margin-top: 14px;
  }

  .selection-card,
  .media-card {
    padding: 18px;
  }

  .selection-fields {
    grid-template-columns: 1fr;
  }

  .session-label {
    max-width: 44%;
    font-size: 11px;
  }
}
</style>
