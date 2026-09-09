<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NModal, NRadioButton, NRadioGroup } from 'naive-ui'
import { getUserInfo, talkStart, talkStop } from '../api/wvp'
import { selectedChannel } from '../stores/useDevices'
import { useToast } from '../composables/useToast'
import type { TalkStartResult } from '../api/wvp'
import type { ZlmRtcClient, ZlmRtcEndpoint } from '../types/player'
import micIcon from '../assets/icons/Microphone-2.svg'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [value: boolean] }>()

const { notify } = useToast()

/** 对讲模式：false=喊话（单向），true=对讲（双向） */
const talkMode = ref(true)
/** -2 释放中 / -1 未开始 / 0 接通中 / 1 进行中 */
const talkStatus = ref(-1)
const statusText = computed(() => {
  if (talkStatus.value === -2) return '正在释放资源'
  if (talkStatus.value === -1) return talkMode.value ? '点击开始对讲' : '点击开始喊话'
  if (talkStatus.value === 0) return '等待接通中...'
  return talkMode.value ? '对讲中' : '喊话中'
})

const channel = computed(() => selectedChannel.value)
const channelName = computed(() => channel.value?.name ?? '未选择通道')

let rtcEndpoint: ZlmRtcEndpoint | null = null
let micStream: MediaStream | null = null
let audioEl: HTMLAudioElement | null = null
let talkResult: TalkStartResult | null = null

/** 麦克风检测（源码 audioTalk checkMicrophoneAvailability 同款逻辑） */
async function checkMicrophone(): Promise<void> {
  if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    throw new Error('当前页面不是安全上下文，浏览器无法采集麦克风音频')
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('当前浏览器不支持麦克风采集')
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  try {
    const tracks = stream.getAudioTracks()
    if (!tracks.length) throw new Error('未检测到有效的麦克风音轨')
    if (tracks.every((t) => t.readyState === 'ended')) throw new Error('麦克风已断开或不可用')
  } finally {
    stream.getTracks().forEach((t) => t.stop())
  }
}

/** 播放设备端声音（对讲模式） */
function startPlayAudio(url: string) {
  audioEl = new Audio(url)
  audioEl.autoplay = true
  void audioEl.play().catch(() => {})
}

function selectRtcUrl(url: string | null | undefined, rtcs: string | null | undefined): string | null {
  const isHttps = window.location.protocol === 'https:'
  return (isHttps ? rtcs : url) || url || rtcs || null
}

async function startTalk() {
  if (!channel.value) {
    notify('请先在设备树选择通道')
    return
  }
  try {
    await checkMicrophone()
  } catch (e) {
    notify(e instanceof Error ? e.message : '麦克风检测失败')
    return
  }

  talkStatus.value = 0
  try {
    // 1. 请求后端开启对讲，拿推流地址
    talkResult = await talkStart(channel.value.gbId)

    // 2. 对讲模式：同时播放设备端声音（ws_flv 低延迟）
    if (talkMode.value && talkResult.playStream) {
      const playUrl = selectRtcUrl(talkResult.playStream.ws_flv, talkResult.playStream.wss_flv)
      if (playUrl) startPlayAudio(playUrl)
    }

    // 3. 打开麦克风并用 WebRTC 推给 zlm（talk app）
    const pushRtc = selectRtcUrl(talkResult.pushStream.rtc, talkResult.pushStream.rtcs)
    if (!pushRtc) {
      throw new Error('未找到 RTC 推流地址')
    }

    const user = await getUserInfo().catch(() => null)
    let pushUrl = pushRtc
    if (user?.pushKey) pushUrl += '&sign=' + user.pushKey

    const client = (window as { ZLMRTCClient?: ZlmRtcClient }).ZLMRTCClient
    if (!client) throw new Error('未加载 ZLMRTCClient.js')
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    rtcEndpoint = new client.Endpoint({
      element: null as unknown as HTMLVideoElement,
      debug: false,
      zlmsdpUrl: pushUrl,
      simulecast: false,
      useCamera: false,
      audioEnable: true,
      videoEnable: false,
      recvOnly: false,
      usedatachannel: false,
    })
    // 注入本地麦克风轨（ZLMRTCClient element 为 null 时用 stream 参数）
    ;(rtcEndpoint as unknown as { stream?: MediaStream }).stream = micStream
    talkStatus.value = 1
  } catch (e) {
    talkStatus.value = -1
    notify('对讲开启失败：' + (e instanceof Error ? e.message : String(e)))
    await releaseResources()
  }
}

async function stopTalk() {
  talkStatus.value = -2
  await releaseResources()
  if (channel.value) {
    try {
      await talkStop(channel.value.gbId)
    } catch { /* 停止失败不阻塞 */ }
  }
  talkStatus.value = -1
  notify('对讲已结束')
}

async function releaseResources() {
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop())
    micStream = null
  }
  if (rtcEndpoint) {
    try { rtcEndpoint.close() } catch { /* 已关闭时忽略 */ }
    rtcEndpoint = null
  }
  if (audioEl) {
    audioEl.pause()
    audioEl = null
  }
  talkResult = null
}

function onModeChange() {
  if (talkStatus.value >= 0) void stopTalk()
}

watch(
  () => props.show,
  (visible) => {
    if (!visible && talkStatus.value >= 0) void stopTalk()
  },
)

onBeforeUnmount(() => {
  void releaseResources()
})
</script>

<template>
  <NModal
    :show="show"
    :mask-closable="false"
    preset="card"
    title="语音对讲"
    :style="{ width: '340px', marginTop: '52vh' }"
    @update:show="emit('update:show', $event)"
  >
    <div class="talk-body">
      <div class="talk-channel">
        <span class="label">当前通道</span>
        <span class="value">{{ channelName }}</span>
      </div>

      <div class="talk-mode">
        <NRadioGroup v-model:value="talkMode" size="small" @update:value="onModeChange">
          <NRadioButton :value="false" :disabled="talkStatus >= 0">喊话</NRadioButton>
          <NRadioButton :value="true" :disabled="talkStatus >= 0">对讲</NRadioButton>
        </NRadioGroup>
        <p class="mode-tip">{{ talkMode ? '双向语音交互，可听到设备声音' : '单向喊话，仅向设备发送语音' }}</p>
      </div>

      <div class="talk-action">
        <button
          class="talk-btn"
          :class="{ talking: talkStatus >= 0 }"
          :disabled="talkStatus === -2"
          @click="talkStatus >= 0 ? stopTalk() : startTalk()"
        >
          <span v-if="talkStatus >= 0" class="talk-stop"></span>
          <img v-else :src="micIcon" class="talk-mic" alt="开始对讲" />
        </button>
        <p class="status-text">{{ statusText }}</p>
      </div>
    </div>
  </NModal>
</template>

<style scoped>
.talk-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.talk-channel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: rgba(8, 42, 86, 0.6);
  border: 1px solid rgba(18, 128, 228, 0.4);
  border-radius: 5px;
}

.talk-channel .label {
  color: #9eb4c9;
  font-size: 12px;
}

.talk-channel .value {
  color: #eefaff;
  font-weight: 500;
  font-size: 13px;
}

.talk-mode {
  text-align: center;
}

.mode-tip {
  margin: 6px 0 0;
  color: #86a7c9;
  font-size: 12px;
}

.talk-action {
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 4px 0 2px;
}

/* 圆形开始/停止大按钮 */
.talk-btn {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  border: 1px solid #08aaff;
  background: linear-gradient(180deg, #073e79, #052c59);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: all 0.15s;
}

.talk-btn:hover:not(:disabled) {
  border-color: #18d5ff;
  box-shadow: 0 0 18px rgba(10, 200, 255, 0.35);
}

.talk-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.talk-btn.talking {
  border-color: #ff5265;
  background: linear-gradient(180deg, #6d1622, #45101a);
}

.talk-btn.talking:hover {
  border-color: #ff7080;
  box-shadow: 0 0 18px rgba(255, 82, 101, 0.35);
}

/* 麦克风图标（深色 svg 滤镜转浅蓝） */
.talk-mic {
  width: 36px;
  height: 36px;
  object-fit: contain;
  filter: invert(1) hue-rotate(185deg) saturate(1.4) brightness(1.1);
}

/* 停止方块 */
.talk-stop {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: #ff5265;
}

.status-text {
  margin: 0;
  color: #d8ebff;
  font-size: 14px;
}
</style>
