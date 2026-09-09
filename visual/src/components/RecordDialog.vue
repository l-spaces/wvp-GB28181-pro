<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NModal, NScrollbar, NPagination } from 'naive-ui'
import { getCloudRecords, loadCloudRecord } from '../api/wvp'
import { selectedChannel } from '../stores/useDevices'
import type { CloudRecordItem } from '../api/wvp'
import type { JessibucaPlayer } from '../types/player'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [value: boolean] }>()

// ---------- 列表 ----------

const records = ref<CloudRecordItem[]>([])
const total = ref(0)
const page = ref(1)
const COUNT = 10
const loading = ref(false)
const listError = ref<string | null>(null)

const channel = computed(() => selectedChannel.value)

async function loadList() {
  loading.value = true
  listError.value = null
  try {
    // 录像列表与选中通道严格关联：未选通道直接空态，不做全量查询
    if (!channel.value?.deviceDeviceId || !channel.value.deviceId) {
      records.value = []
      total.value = 0
      return
    }
    const query: Parameters<typeof getCloudRecords>[0] = {
      page: page.value,
      count: COUNT,
      stream: `${channel.value.deviceDeviceId}_${channel.value.deviceId}`,
      ascOrder: false,
    }
    const data = await getCloudRecords(query)
    records.value = data.list
    total.value = data.total
  } catch (e) {
    listError.value = e instanceof Error ? e.message : String(e)
    records.value = []
  } finally {
    loading.value = false
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`
}

// ---------- 播放 ----------

const playingRecord = ref<CloudRecordItem | null>(null)
const playError = ref<string | null>(null)
const playEnded = ref(false)
const playLoading = ref(false)

let player: JessibucaPlayer | null = null
const containerRef = ref<HTMLElement | null>(null)

function destroyPlayer() {
  if (player) {
    try { player.destroy() } catch { /* 已销毁时忽略 */ }
    player = null
  }
}

/** 点列表项播放该段录像 */
async function playRecord(item: CloudRecordItem) {
  if (playingRecord.value?.id === item.id) return
  playingRecord.value = item
  playError.value = null
  playEnded.value = false
  playLoading.value = true
  destroyPlayer()

  try {
    const stream = await loadCloudRecord(item.app, item.stream, item.id)
    // 等容器挂载后创建播放器
    setTimeout(() => {
      playLoading.value = false
      if (!playingRecord.value || playingRecord.value.id !== item.id || !containerRef.value) return
      const Jessibuca = (window as { Jessibuca?: new (opts: Record<string, unknown>) => JessibucaPlayer }).Jessibuca
      if (!Jessibuca) {
        playError.value = '未加载 jessibuca.js'
        return
      }
      const isHttps = window.location.protocol === 'https:'
      const url = (isHttps ? stream.wss_flv : stream.ws_flv) || stream.ws_flv || stream.wss_flv
      if (!url) {
        playError.value = '返回的流地址缺少 ws_flv'
        return
      }
      player = new Jessibuca({
        container: containerRef.value,
        videoBuffer: 0.2,
        isResize: true,
        decoder: '/vendor/decoder.js',
        loadingText: '录像加载中……',
        hasAudio: true,
        supportDblclickFullscreen: false,
      })
      player.on('error', (detail) => {
        const msg = typeof detail === 'string' ? detail : '未知错误'
        // streamEnd：录像自然播完（jessibuca 以 error 事件形式上报），是正常结束而非错误
        if (msg.includes('streamEnd')) {
          playEnded.value = true
          return
        }
        playError.value = '播放失败：' + msg
      })
      player.play(url)
    }, 100)
  } catch (e) {
    playLoading.value = false
    playError.value = e instanceof Error ? e.message : String(e)
  }
}

function onPageChange(p: number) {
  page.value = p
  void loadList()
}

// 打开弹窗时加载第一页
watch(
  () => props.show,
  (visible) => {
    if (visible) {
      page.value = 1
      playingRecord.value = null
      destroyPlayer()
      void loadList()
    } else {
      destroyPlayer()
      playingRecord.value = null
    }
  },
)

// 选中通道变化时（弹窗开着切通道/点空格清空），重新加载列表
watch(channel, () => {
  if (props.show) {
    page.value = 1
    playingRecord.value = null
    destroyPlayer()
    void loadList()
  }
})

onBeforeUnmount(() => {
  destroyPlayer()
})
</script>

<template>
  <NModal
    :show="show"
    :mask-closable="false"
    preset="card"
    title="录像回放"
    :style="{ width: '1080px', marginTop: '8vh' }"
    @update:show="emit('update:show', $event)"
  >
    <div class="record-body">
      <!-- 左：录像列表 -->
      <div class="record-list">
        <div class="list-head">
          <span>开始时间</span><span>结束时间</span><span>时长</span><span>操作</span>
        </div>
        <NScrollbar class="list-scroll">
          <div v-if="listError" class="list-state">{{ listError }}</div>
          <div v-else-if="loading && records.length === 0" class="list-state">加载录像列表中…</div>
          <div v-else-if="records.length === 0" class="list-state">
            {{ channel ? '该通道暂无云端录像' : '请先在设备树选择通道' }}
          </div>
          <div
            v-for="r in records"
            :key="r.id"
            class="list-row"
            :class="{ active: playingRecord?.id === r.id }"
            @click="playRecord(r)"
          >
            <span>{{ formatTime(r.startTime) }}</span>
            <span>{{ formatTime(r.endTime) }}</span>
            <span>{{ formatDuration(r.timeLen) }}</span>
            <span class="row-op">
              <a
                class="op-btn"
                title="下载"
                @click.stop="playRecord(r)"
              >▶ 播放</a>
            </span>
          </div>
        </NScrollbar>
        <NPagination
          v-if="total > COUNT"
          :page="page"
          :item-count="total"
          :page-size="COUNT"
          size="small"
          style="margin-top: 8px; justify-content: center"
          @update:page="onPageChange"
        />
      </div>

      <!-- 右：播放器 -->
      <div class="record-player">
        <div class="player-title">
          <template v-if="playingRecord">
            {{ formatTime(playingRecord.startTime) }} ~ {{ formatTime(playingRecord.endTime) }}
          </template>
          <template v-else>选择左侧录像开始播放</template>
        </div>
        <div class="player-area">
          <div ref="containerRef" class="player-container"></div>
          <div v-if="!playingRecord" class="player-placeholder">点击左侧列表中的录像进行回放</div>
          <div v-if="playLoading && playingRecord" class="player-placeholder">录像流加载中…</div>
          <div v-if="playEnded" class="player-ended">▶ 播放已结束</div>
          <div v-if="playError" class="player-error">{{ playError }}</div>
        </div>
      </div>
    </div>
  </NModal>
</template>

<style scoped>
.record-body {
  display: grid;
  grid-template-columns: 600px 1fr;
  gap: 12px;
}

/* 左侧列表 */
.record-list {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.list-head {
  display: grid;
  grid-template-columns: 1fr 1fr 64px 1fr;
  gap: 6px;
  padding: 6px 8px;
  font-size: 12px;
  color: #9eb4c9;
  border-bottom: 1px solid rgba(23, 115, 201, 0.35);
}

.list-scroll {
  height: 400px;
}

.list-row {
  display: grid;
  grid-template-columns: 1fr 1fr 64px 1fr;
  gap: 6px;
  padding: 7px 8px;
  font-size: 12px;
  color: #c7ddf0;
  cursor: pointer;
  border-bottom: 1px solid rgba(23, 115, 201, 0.18);
  white-space: nowrap;
}

.list-row:hover {
  background: #08376b88;
}

.list-row.active {
  background: linear-gradient(90deg, #0b69cf, #0a59ad);
}

.list-row span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-state {
  padding: 30px 10px;
  text-align: center;
  color: #7f9cb5;
  font-size: 12px;
}

.row-op {
  display: flex;
  gap: 8px;
}

.op-btn {
  color: #16c9ff;
  cursor: pointer;
  text-decoration: none;
}

.op-btn:hover {
  color: #4fdcff;
}

/* 右侧播放器 */
.record-player {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.player-title {
  font-size: 12px;
  color: #9eb4c9;
  padding: 6px 8px;
  border-bottom: 1px solid rgba(23, 115, 201, 0.35);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-area {
  position: relative;
  height: 400px;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
}

.player-container {
  position: absolute;
  inset: 0;
}

.player-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #6f8299;
  font-size: 13px;
  background: linear-gradient(180deg, #06182b, #03111e);
}

.player-error {
  position: absolute;
  left: 8px;
  bottom: 8px;
  z-index: 2;
  font-size: 12px;
  color: #ff8a94;
  background: #210d12dd;
  border: 1px solid #7c2d38;
  border-radius: 4px;
  padding: 4px 8px;
  max-width: 90%;
}

.player-ended {
  position: absolute;
  right: 8px;
  top: 8px;
  z-index: 2;
  font-size: 12px;
  color: #16e0a0;
  background: #04231add;
  border: 1px solid #0c6b4c;
  border-radius: 4px;
  padding: 4px 10px;
}
</style>
