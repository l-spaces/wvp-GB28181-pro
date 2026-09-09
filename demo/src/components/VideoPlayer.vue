<template>
  <div class="video-player" :class="{ 'video-player--empty': !url }">
    <video
      v-if="mode === 'webrtc'"
      ref="videoElement"
      class="video-player__video"
      autoplay
      controls
      muted
      playsinline
    >
      当前浏览器不支持 HTML5 视频播放。
    </video>
    <div v-else ref="containerElement" class="video-player__video video-player__container"></div>
    <p v-if="!url" class="video-player__placeholder">开始播放后，视频画面会显示在这里</p>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { JessibucaPlayer, ZlmRtcEndpoint } from '../types/player'

const props = withDefaults(
  defineProps<{
    url: string | null
    mode?: 'webrtc' | 'jessibuca'
  }>(),
  {
    mode: 'jessibuca',
  },
)

const emit = defineEmits<{
  (event: 'playing'): void
  (event: 'error', message: string): void
}>()

const videoElement = ref<HTMLVideoElement | null>(null)
const containerElement = ref<HTMLDivElement | null>(null)
const PLAYBACK_CONNECTION_TIMEOUT_MS = 15_000
let endpoint: ZlmRtcEndpoint | null = null
let jessibucaPlayer: JessibucaPlayer | null = null
let lifecycleToken = 0
let connectionTimer: number | null = null

function clearConnectionTimer(): void {
  if (connectionTimer === null) {
    return
  }

  window.clearTimeout(connectionTimer)
  connectionTimer = null
}

function clearVideoElement(): void {
  const video = videoElement.value
  if (!video) {
    return
  }

  video.pause()
  video.srcObject = null
  video.removeAttribute('src')
  video.load()
}

function closePlayback(): void {
  clearConnectionTimer()

  if (endpoint) {
    try {
      endpoint.close()
    } catch {
      // 播放器已经关闭时，忽略重复释放异常。
    }
    endpoint = null
  }

  if (jessibucaPlayer) {
    try {
      jessibucaPlayer.destroy()
    } catch {
      // 播放器已经销毁时，忽略重复释放异常。
    }
    jessibucaPlayer = null
  }

  clearVideoElement()
}

function fail(token: number, message: string): void {
  if (token !== lifecycleToken) {
    return
  }

  lifecycleToken += 1
  closePlayback()
  emit('error', message)
}

function scheduleConnectionTimeout(token: number, message: string): void {
  connectionTimer = window.setTimeout(() => {
    if (token === lifecycleToken) {
      fail(token, message)
    }
  }, PLAYBACK_CONNECTION_TIMEOUT_MS)
}

function createWebRtcEndpoint(url: string): void {
  lifecycleToken += 1
  closePlayback()
  const token = lifecycleToken

  const video = videoElement.value
  if (!video) {
    emit('error', '视频元素尚未准备好，无法创建 WebRTC 播放器。')
    return
  }

  const client = window.ZLMRTCClient
  if (!client) {
    emit('error', '未加载 ZLMRTCClient.js，无法创建 WebRTC 播放器。')
    return
  }

  let currentEndpoint: ZlmRtcEndpoint
  try {
    currentEndpoint = new client.Endpoint({
      element: video,
      debug: true,
      zlmsdpUrl: url,
      simulecast: false,
      useCamera: false,
      audioEnable: true,
      videoEnable: true,
      recvOnly: true,
      usedatachannel: false,
    })
  } catch {
    emit('error', '创建 WebRTC 播放器失败，请检查浏览器是否支持 WebRTC。')
    return
  }

  endpoint = currentEndpoint
  const isCurrent = (): boolean => token === lifecycleToken && endpoint === currentEndpoint
  scheduleConnectionTimeout(token, 'WebRTC 连接超时，请检查媒体服务器地址、端口和返回的播放地址。')

  currentEndpoint.on(client.Events.WEBRTC_NOT_SUPPORT, () => {
    fail(token, '当前浏览器不支持 WebRTC 播放。')
  })

  currentEndpoint.on(client.Events.WEBRTC_ICE_CANDIDATE_ERROR, () => {
    fail(token, 'WebRTC ICE 协商失败，请检查媒体服务器地址和 WebRTC 端口。')
  })

  currentEndpoint.on(client.Events.WEBRTC_OFFER_ANWSER_EXCHANGE_FAILED, () => {
    fail(token, 'WebRTC Offer/Answer 协商失败，请检查播放地址和媒体流状态。')
  })

  currentEndpoint.on(client.Events.WEBRTC_ON_CONNECTION_STATE_CHANGE, (state) => {
    if (!isCurrent()) {
      return
    }

    if (state === 'failed' || state === 'disconnected' || state === 'closed') {
      fail(token, 'WebRTC 连接失败或已中断，请检查媒体服务器网络连通性。')
    }
  })

  currentEndpoint.on(client.Events.WEBRTC_ON_REMOTE_STREAMS, () => {
    if (!isCurrent()) {
      return
    }

    clearConnectionTimer()
    emit('playing')
    void video.play().catch(() => {
      // 播放按钮已经由用户触发；若浏览器仍阻止自动播放，保留控件供用户手动播放。
    })
  })
}

function createJessibucaPlayer(url: string): void {
  lifecycleToken += 1
  closePlayback()
  const token = lifecycleToken

  const container = containerElement.value
  if (!container) {
    emit('error', '播放器容器尚未准备好，无法创建 Jessibuca 播放器。')
    return
  }

  const jessibucaConstructor = window.Jessibuca
  if (!jessibucaConstructor) {
    emit('error', '未加载 jessibuca.js，无法创建 Jessibuca 播放器。')
    return
  }

  const player = new jessibucaConstructor({
    container,
    videoBuffer: 0,
    isResize: true,
    decoder: '/vendor/decoder.js',
    loadingText: '请稍等, 视频加载中……',
    hasAudio: true,
    supportDblclickFullscreen: false,
  })
  jessibucaPlayer = player

  scheduleConnectionTimeout(token, 'Jessibuca 连接超时，请检查媒体服务器地址、端口和返回的播放地址。')

  player.on('play', () => {
    if (token !== lifecycleToken) {
      return
    }

    clearConnectionTimer()
    emit('playing')
  })

  player.on('error', (detail) => {
    fail(token, `Jessibuca 播放失败${typeof detail === 'string' && detail ? `：${detail}` : ''}，请检查播放地址与流编码格式。`)
  })

  player.on('loadingTimeout', () => {
    fail(token, 'Jessibuca 加载超时，请检查播放地址和媒体流状态。')
  })

  player.on('delayTimeout', () => {
    fail(token, 'Jessibuca 接收数据超时，播放已停止。')
  })

  player.play(url)
}

watch(
  () => [props.url, props.mode] as const,
  ([url]) => {
    if (!url) {
      lifecycleToken += 1
      closePlayback()
      return
    }

    // mode 变化会切换模板里的 v-if 分支，等新容器挂载后再创建播放器。
    void nextTick(() => {
      if (url !== props.url) {
        return
      }

      if (props.mode === 'webrtc') {
        createWebRtcEndpoint(url)
      } else {
        createJessibucaPlayer(url)
      }
    })
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  lifecycleToken += 1
  closePlayback()
})
</script>

<style scoped>
.video-player {
  position: relative;
  min-height: 360px;
  overflow: hidden;
  border-radius: 10px;
  background: #07111f;
}

.video-player__video {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 360px;
  background: #000;
  object-fit: contain;
}

.video-player__container {
  position: relative;
}

.video-player__placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  margin: 0;
  color: #9fb1c8;
  transform: translate(-50%, -50%);
  white-space: nowrap;
}

@media (max-width: 640px) {
  .video-player,
  .video-player__video {
    min-height: 240px;
  }

  .video-player__placeholder {
    font-size: 13px;
  }
}
</style>
