<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { playStart, playStop } from '../api/wvp'
import { playRequestCount, selectedChannel } from '../stores/useDevices'
import { useToast } from '../composables/useToast'
import type { StreamContent, WvpChannel } from '../types/api'
import type { JessibucaPlayer, ZlmRtcEndpoint, ZlmRtcClient } from '../types/player'

const props = defineProps<{ count: number }>()

const { notify } = useToast()

/** 播放模式：默认 jessibuca，可切 webrtc */
type PlayerMode = 'jessibuca' | 'webrtc'
const playerMode = ref<PlayerMode>('jessibuca')

/** 当前播放的流（供视频信息面板，取选中格） */
const activeStream = defineModel<StreamContent | null>('stream', { default: null })


/** 每格的播放状态（源码 live/index.vue 的 streamInfo 数组模型） */
interface Slot {
  channel: WvpChannel | null
  stream: StreamContent | null
  tip: string
}
const slots = ref<Slot[]>([])

/** 选中格子索引（点击卡片选中，点通道推流到选中格） */
const activeSlotIndex = ref(0)
const fullscreenIndex = ref<number | null>(null)

const gridStyle = computed(() => {
  const cols = { 1: '1fr', 4: 'repeat(2,1fr)', 9: 'repeat(3,1fr)', 16: 'repeat(4,1fr)' } as Record<number, string>
  const g = cols[props.count] ?? 'repeat(3,1fr)'
  return { gridTemplateColumns: g, gridTemplateRows: g }
})

// ---------- 播放器实例管理（每格独立） ----------

interface PlayerEntry {
  jessibuca: JessibucaPlayer | null
  rtc: ZlmRtcEndpoint | null
  video: HTMLVideoElement | null
  container: HTMLElement | null
}
const players = new Map<number, PlayerEntry>()

function getPlayer(index: number): PlayerEntry {
  let p = players.get(index)
  if (!p) {
    p = { jessibuca: null, rtc: null, video: null, container: null }
    players.set(index, p)
  }
  return p
}

function destroyPlayer(index: number) {
  const p = players.get(index)
  if (!p) return
  if (p.jessibuca) {
    try { p.jessibuca.destroy() } catch { /* 已销毁时忽略 */ }
    p.jessibuca = null
  }
  if (p.rtc) {
    try { p.rtc.close() } catch { /* 已关闭时忽略 */ }
    p.rtc = null
  }
  if (p.video) {
    p.video.pause()
    p.video.srcObject = null
    p.video = null
  }
  p.container = null
}

function destroyAllPlayers() {
  for (const index of [...players.keys()]) destroyPlayer(index)
}

async function stopSlot(index: number) {
  const slot = slots.value[index]
  if (!slot?.channel || !slot.stream) return
  slots.value[index] = { channel: null, stream: null, tip: '' }
  destroyPlayer(index)
  syncActiveStream()
  try {
    await playStop(slot.channel.gbId)
  } catch { /* 停止失败不阻塞 */ }
}

/** 停止某通道已存在的播放（同一通道只允许在一格播放） */
async function stopChannelEverywhere(channel: WvpChannel) {
  for (let i = 0; i < slots.value.length; i++) {
    if (slots.value[i].channel?.deviceId === channel.deviceId) {
      await stopSlot(i)
    }
  }
}

function syncActiveStream() {
  const slot = slots.value[activeSlotIndex.value]
  activeStream.value = slot?.stream ?? null
}

// ---------- 地址选择 ----------

function selectWsFlvUrl(stream: StreamContent): string | null {
  const isHttps = window.location.protocol === 'https:'
  return (isHttps ? stream.wss_flv : stream.ws_flv) || stream.ws_flv || stream.wss_flv || null
}

function selectRtcUrl(stream: StreamContent): string | null {
  const isHttps = window.location.protocol === 'https:'
  return (isHttps ? stream.rtcs : stream.rtc) || stream.rtc || stream.rtcs || null
}

// ---------- 播放器创建 ----------

function createJessibuca(index: number, url: string): boolean {
  const Jessibuca = (window as { Jessibuca?: new (opts: Record<string, unknown>) => JessibucaPlayer }).Jessibuca
  const p = getPlayer(index)
  if (!Jessibuca || !p.container) return false
  p.jessibuca = new Jessibuca({
    container: p.container,
    videoBuffer: 0,
    isResize: true,
    decoder: '/vendor/decoder.js',
    loadingText: '视频加载中……',
    hasAudio: true,
    supportDblclickFullscreen: false,
  })
  p.jessibuca.on('error', (detail) => {
    const slot = slots.value[index]
    if (slot) slot.tip = '播放失败：' + (typeof detail === 'string' ? detail : '未知错误')
  })
  p.jessibuca.play(url)
  return true
}

function createWebRtc(index: number, url: string): boolean {
  const client = (window as { ZLMRTCClient?: ZlmRtcClient }).ZLMRTCClient
  const p = getPlayer(index)
  if (!client || !p.video) return false
  try {
    p.rtc = new client.Endpoint({
      element: p.video,
      debug: false,
      zlmsdpUrl: url,
      simulecast: false,
      useCamera: false,
      audioEnable: true,
      videoEnable: true,
      recvOnly: true,
      usedatachannel: false,
    })
  } catch {
    const slot = slots.value[index]
    if (slot) slot.tip = '创建 WebRTC 播放器失败。'
    return false
  }
  p.rtc.on(client.Events.WEBRTC_ON_REMOTE_STREAMS, () => {
    void p.video?.play().catch(() => {})
    const slot = slots.value[index]
    if (slot) slot.tip = ''
  })
  p.rtc.on(client.Events.WEBRTC_OFFER_ANWSER_EXCHANGE_FAILED, () => {
    const slot = slots.value[index]
    if (slot) slot.tip = 'WebRTC 协商失败，请检查播放地址。'
  })
  return true
}

// ---------- 播放动作 ----------

/** 播放通道到指定格子（源码 sendDevicePush 模型） */
async function playChannelTo(channel: WvpChannel, index: number) {
  if (index < 0 || index >= slots.value.length) return
  selectedChannel.value = channel
  activeSlotIndex.value = index

  // 同一通道重复推流：已在播则忽略
  const existing = slots.value[index]
  if (existing.channel?.deviceId === channel.deviceId && existing.stream) return

  // 清掉目标格 + 同通道其他格的旧播放
  await stopSlot(index)
  await stopChannelEverywhere(channel)

  slots.value[index] = { channel, stream: null, tip: '正在拉流...' }
  syncActiveStream()

  try {
    const stream = await playStart(channel.gbId)
    const slot = slots.value[index]
    if (!slot || slot.channel?.deviceId !== channel.deviceId) {
      // 期间格子被清掉，释放刚拉的流
      void playStop(channel.gbId).catch(() => {})
      return
    }
    slot.stream = stream
    slot.tip = ''
    syncActiveStream()
    // 等容器挂载（Vue 渲染周期）
    setTimeout(() => {
      const s = slots.value[index]
      if (!s?.stream) return
      if (playerMode.value === 'jessibuca') {
        const url = selectWsFlvUrl(s.stream)
        if (url) createJessibuca(index, url)
        else s.tip = '返回的流地址缺少 ws_flv。'
      } else {
        const url = selectRtcUrl(s.stream)
        if (url) createWebRtc(index, url)
        else s.tip = '返回的流地址缺少 rtc。'
      }
    }, 100)
  } catch (e) {
    const slot = slots.value[index]
    const msg = e instanceof Error ? e.message : String(e)
    if (slot) {
      slot.tip = '播放失败: ' + msg
      slot.channel = null
    }
    notify(msg)
  }
}

/** 点击卡片：选中格子；已在播的通道不重复拉流 */
function clickCard(index: number) {
  activeSlotIndex.value = index
  const slot = slots.value[index]
  if (slot?.channel) selectedChannel.value = slot.channel
  syncActiveStream()
}

/** 点击设备树通道（playRequestCount 自增信号）→ 推流到当前选中格 */
watch(playRequestCount, () => {
  const ch = selectedChannel.value
  if (!ch) return
  void playChannelTo(ch, activeSlotIndex.value)
})

/** 播放模式切换：重建所有在播的流 */
function toggleMode() {
  playerMode.value = playerMode.value === 'jessibuca' ? 'webrtc' : 'jessibuca'
  for (let i = 0; i < slots.value.length; i++) {
    const slot = slots.value[i]
    if (slot?.channel && slot.stream) {
      void playChannelTo(slot.channel, i)
    }
  }
}

/** 分屏数变化：扩容格子数组；缩减时释放多余格的流（保留前 N 格） */
watch(
  () => props.count,
  async (newCount) => {
    const current = slots.value
    if (newCount > current.length) {
      const next = [...current]
      while (next.length < newCount) next.push({ channel: null, stream: null, tip: '' })
      slots.value = next
    } else if (newCount < current.length) {
      for (let i = newCount; i < current.length; i++) {
        if (current[i]?.channel) await stopSlot(i)
      }
      slots.value = current.slice(0, newCount)
      if (activeSlotIndex.value >= newCount) {
        activeSlotIndex.value = newCount - 1
        syncActiveStream()
      }
    }
  },
  { immediate: true },
)

function toggleCardFullscreen(e: MouseEvent) {
  fullscreenIndex.value = fullscreenIndex.value === null ? 0 : null
  e.stopPropagation()
}

function onContainerRef(index: number, el: unknown, isVideo: boolean) {
  const p = getPlayer(index)
  if (isVideo) p.video = el as HTMLVideoElement
  else p.container = el as HTMLElement
}

onBeforeUnmount(() => {
  for (let i = 0; i < slots.value.length; i++) {
    if (slots.value[i]?.channel) void playStop(slots.value[i].channel!.gbId).catch(() => {})
  }
  destroyAllPlayers()
})
</script>

<template>
  <section class="video-wall" :style="gridStyle">
    <div
      v-for="(slot, i) in slots"
      :key="i"
      class="video-card"
      :class="[
        { selected: i === activeSlotIndex },
        { 'card-fullscreen': fullscreenIndex === i },
      ]"
      @click="clickCard(i)"
    >
      <template v-if="slot.channel">
        <video v-if="slot.stream && playerMode === 'webrtc'" :ref="(el) => onContainerRef(i, el, true)" class="v-video" autoplay muted playsinline></video>
        <div v-else-if="slot.stream" :ref="(el) => onContainerRef(i, el, false)" class="v-container"></div>
        <div v-if="!slot.stream" class="v-placeholder">
          <span class="play-text">{{ slot.tip || slot.channel.name }}</span>
        </div>
        <div class="v-top">
          <span class="status-dot" :class="{ off: slot.channel.status !== 'ON' }"></span>
          <b>{{ slot.channel.name }}</b>
          <button class="mini-btn" title="全屏" @click="toggleCardFullscreen">⛶</button>
          <button v-if="slot.stream" class="mini-btn stop" title="停止" @click="stopSlot(i)">⏹</button>
        </div>
        <div class="quality" :class="{ 'ptz-tag': (slot.channel.ptzType ?? 0) > 0 }">{{ (slot.channel.ptzType ?? 0) > 0 ? 'PTZ' : 'HD' }}</div>
      </template>
      <template v-else>
        <div class="v-empty" :class="{ active: i === activeSlotIndex }"><span>＋</span></div>
      </template>
    </div>
    <div class="mode-switch">
      <button :class="{ active: playerMode === 'jessibuca' }" @click.stop="playerMode !== 'jessibuca' && toggleMode()">FLV</button>
      <button :class="{ active: playerMode === 'webrtc' }" @click.stop="playerMode !== 'webrtc' && toggleMode()">RTC</button>
    </div>
  </section>
</template>

<style scoped>
.video-wall {
  min-width: 0;
  min-height: 0;
  display: grid;
  gap: 4px;
  position: relative;
}

.video-card {
  position: relative;
  min-width: 0;
  min-height: 0;
  border: 1px solid #0865bd;
  border-radius: 4px;
  overflow: hidden;
  background: #020d1f;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px #001b36;
}

.video-card.selected {
  border-color: #16caff;
  box-shadow: 0 0 14px #00baff66, inset 0 0 18px #007dff22;
}

.v-video,
.v-container {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #000;
}

.v-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, #06182b, #03111e);
}

.play-text {
  font-size: 12px;
  color: #6f98b6;
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}

.v-empty span {
  font-size: 30px;
  color: #2a4a66;
}

.v-empty.active span {
  color: #4a7a9e;
}

.v-top {
  position: absolute;
  top: 7px;
  left: 10px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  z-index: 2;
}

.status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #11e1b0;
  box-shadow: 0 0 9px #11e1b0;
  flex: none;
}

.status-dot.off {
  background: #6f8299;
  box-shadow: none;
}

.mini-btn {
  margin-left: auto;
  border: 0;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  color: #dff7ff;
}

.mini-btn.stop {
  margin-left: 0;
  font-size: 16px;
  color: #ff8a94;
}

.quality {
  position: absolute;
  left: 9px;
  bottom: 8px;
  z-index: 2;
  background: #082956dd;
  border: 1px solid #2b76bb;
  border-radius: 4px;
  padding: 3px 7px;
  font-size: 12px;
}

.ptz-tag {
  background: #006cb4dd;
}

.card-fullscreen {
  position: fixed !important;
  inset: 15px !important;
  width: auto !important;
  height: auto !important;
  z-index: 90;
  background: #000;
}

.mode-switch {
  position: absolute;
  right: 10px;
  top: -1px;
  transform: translateY(-100%);
  display: flex;
  gap: 4px;
  z-index: 5;
}

.mode-switch button {
  height: 24px;
  padding: 0 12px;
  font-size: 12px;
  border: 1px solid #0a5eae;
  border-radius: 4px 4px 0 0;
  background: #052956;
  color: #9fc0df;
  cursor: pointer;
}

.mode-switch button.active {
  background: #07589c;
  color: #fff;
}
</style>
