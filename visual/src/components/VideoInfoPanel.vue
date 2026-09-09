<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getMediaInfo } from '../api/wvp'
import type { MediaInfo, StreamContent } from '../types/api'

const props = defineProps<{ stream: StreamContent | null }>()

const info = ref<MediaInfo | null>(null)
const error = ref<string | null>(null)
let timer: ReturnType<typeof setInterval> | null = null
let inflight = false

async function refresh() {
  const s = props.stream
  if (!s || inflight) return
  inflight = true
  try {
    info.value = await getMediaInfo(s.app, s.stream, s.mediaServerId)
    error.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    inflight = false
  }
}

watch(
  () => props.stream,
  (s) => {
    info.value = null
    error.value = null
    if (timer) clearInterval(timer)
    timer = null
    if (s) {
      void refresh()
      timer = setInterval(refresh, 1000)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const byteSpeed = computed(() => {
  const bps = info.value?.bytesSpeed ?? 0
  if (bps < 1024) return `${bps} B/S`
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(2)} KB/S`
  if (bps < 1024 ** 3) return `${(bps / 1024 ** 2).toFixed(2)} MB/S`
  return `${(bps / 1024 ** 3).toFixed(2)} GB/S`
})

const aliveSecond = computed(() => {
  const s = info.value?.aliveSecond ?? 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}小时${p(m)}分${p(sec)}秒` : `${p(m)}分${p(sec)}秒`
})
</script>

<template>
  <div class="panel video-info">
    <div class="bottom-title">视频信息</div>
    <div class="info-body">
      <template v-if="info">
        <div class="metric-col">
          <div class="metric-row"><span class="label">观看人数</span><span class="value">{{ info.readerCount }}</span></div>
          <div class="metric-row"><span class="label">网络</span><span class="value">{{ byteSpeed }}</span></div>
          <div class="metric-row"><span class="label">持续时间</span><span class="value">{{ aliveSecond }}</span></div>
        </div>
        <div class="kv-grid">
          <div class="label">编码：</div><div class="value">{{ info.videoCodec ?? '-' }}</div>
          <div class="label">分辨率：</div><div class="value">{{ info.width }}×{{ info.height }}</div>
          <div class="label">FPS：</div><div class="value">{{ info.fps }}</div>
          <div class="label">丢包率：</div><div class="value">{{ info.loss }}</div>
        </div>
      </template>
      <div v-else-if="error" class="info-error">{{ error }}</div>
      <div v-else class="info-error">点击视频卡片开始播放后显示流信息</div>
    </div>
  </div>
</template>

<style scoped>
.video-info {
  padding: 10px 12px;
}

.info-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metric-col {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  padding-top: 2px;
}

.metric-row {
  display: flex;
  align-items: center;
  gap: 7px;
  line-height: 1.6;
}

.metric-row .value {
  margin-left: auto;
}

.metric-col .label,
.kv-grid .label {
  color: #9eb4c9;
}

.metric-col .value,
.kv-grid .value {
  color: #eefaff;
  font-weight: 500;
}

.kv-grid {
  display: grid;
  grid-template-columns: auto 1fr auto 1fr;
  gap: 6px 12px;
  font-size: 12px;
  border-top: 1px solid rgba(23, 115, 201, 0.35);
  padding-top: 5px;
}

.info-error {
  font-size: 12px;
  color: #7f9cb5;
  display: grid;
  place-items: center;
  flex: 1;
  text-align: center;
  min-height: 80px;
}
</style>
