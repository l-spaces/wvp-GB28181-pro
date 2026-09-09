<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  cruiseStart,
  cruiseStop,
  presetCall,
  queryPresets,
  sendDragZoom,
  sendFocus,
  sendIris,
  sendPtz,
} from '../api/wvp'
import { selectedChannel } from '../stores/useDevices'
import { useToast } from '../composables/useToast'
import type { PtzCommand } from '../types/api'
import type { PresetItem } from '../api/wvp'

const { notify } = useToast()

const speed = ref(5)
const activePreset = ref<string | null>(null)
const cruiseId = ref(1)
let currentCommand: string | null = null

const channel = computed(() => selectedChannel.value)
const channelLabel = computed(() => channel.value?.name ?? '未选择通道')
const hasPtz = computed(() => (channel.value?.ptzType ?? 0) > 0)

// ---------- 预置点（按接口查询结果渲染，无数据不显示） ----------

/** 查询到的预置点列表；null=未查询/查询中 */
const presets = ref<PresetItem[] | null>(null)
const presetLoading = ref(false)
const presetError = ref<string | null>(null)
const presetEnabled = computed(() => (presets.value?.length ?? 0) > 0)

async function loadPresets(ch: { gbId: number; name: string } | null) {
  if (!ch) {
    presets.value = null
    presetError.value = null
    return
  }
  presetLoading.value = true
  presetError.value = null
  try {
    const list = await queryPresets(ch.gbId)
    presets.value = list
    activePreset.value = null
  } catch (e) {
    // 设备端不响应查询属常态（源码同款行为），不弹 toast 打扰
    presets.value = []
    presetError.value = e instanceof Error ? e.message : String(e)
  } finally {
    presetLoading.value = false
  }
}

watch(channel, (ch) => {
  void loadPresets(ch)
})

const directions = [
  { key: 'up', label: '▲', cls: 'card card-up' },
  { key: 'upright', label: '▲', cls: 'diag diag-upright', rotate: 45 },
  { key: 'right', label: '▶', cls: 'card card-right' },
  { key: 'downright', label: '▲', cls: 'diag diag-downright', rotate: 135 },
  { key: 'down', label: '▼', cls: 'card card-down' },
  { key: 'downleft', label: '▲', cls: 'diag diag-downleft', rotate: 225 },
  { key: 'left', label: '◀', cls: 'card card-left' },
  { key: 'upleft', label: '▲', cls: 'diag diag-upleft', rotate: -45 },
] as const

/** 速度 1-10 → 云台接口速度参数 */
function ptzSpeeds() {
  const v = speed.value
  return {
    horizon: Math.min(255, Math.round(v * 25)),
    vertical: Math.min(255, Math.round(v * 25)),
    zoom: Math.min(15, Math.round(v * 1.5)),
  }
}

function requireChannel() {
  if (!channel.value) {
    notify('请先在设备树或视频墙选择通道')
    return null
  }
  return channel.value
}

/** 云台方向/变倍：command 为 PtzCommand */
async function ptzMove(command: PtzCommand) {
  const ch = requireChannel()
  if (!ch) return
  currentCommand = command
  const s = ptzSpeeds()
  try {
    await sendPtz(ch.deviceDeviceId ?? '', ch.deviceId, command, s.horizon, s.vertical, s.zoom)
  } catch (e) {
    notify('云台指令失败：' + (e instanceof Error ? e.message : String(e)))
  }
}

async function ptzStop() {
  if (!currentCommand) return
  currentCommand = null
  const ch = channel.value
  if (!ch) return
  try {
    const s = ptzSpeeds()
    await sendPtz(ch.deviceDeviceId ?? '', ch.deviceId, 'stop', s.horizon, s.vertical, s.zoom)
  } catch { /* 停止失败静默 */ }
}

/** 聚焦±：fi/focus 接口（channelId 用数据库主键 gbId） */
async function focusMove(command: 'near' | 'far') {
  const ch = requireChannel()
  if (!ch) return
  try {
    await sendFocus(ch.gbId, command, speed.value * 10)
    currentCommand = 'focus'
  } catch (e) {
    notify('聚焦指令失败：' + (e instanceof Error ? e.message : String(e)))
  }
}

/** 光圈±：fi/iris 接口 */
async function irisMove(command: 'in' | 'out') {
  const ch = requireChannel()
  if (!ch) return
  try {
    await sendIris(ch.gbId, command, speed.value * 10)
    currentCommand = 'iris'
  } catch (e) {
    notify('光圈指令失败：' + (e instanceof Error ? e.message : String(e)))
  }
}

/** 松开：聚焦/光圈发 stop */
async function releaseStop() {
  const ch = channel.value
  const cmd = currentCommand
  if (!ch || !cmd) return
  currentCommand = null
  try {
    if (cmd === 'focus') await sendFocus(ch.gbId, 'stop', 0)
    else if (cmd === 'iris') await sendIris(ch.gbId, 'stop', 0)
  } catch { /* 停止失败静默 */ }
}

/** 拉框放大/缩小：使用卡片中心固定矩形 */
async function dragZoom(direction: 'in' | 'out') {
  const ch = requireChannel()
  if (!ch) return
  try {
    await sendDragZoom(ch.gbId, direction, {
      length: 1920,
      width: 1080,
      midPointX: 960,
      midPointY: 540,
      lengthX: 640,
      lengthY: 480,
    })
    notify(direction === 'in' ? '拉框放大指令已发送' : '拉框缩小指令已发送')
  } catch (e) {
    notify('拉框指令失败：' + (e instanceof Error ? e.message : String(e)))
  }
}

async function preset(item: PresetItem) {
  activePreset.value = item.presetId
  const ch = requireChannel()
  if (!ch) return
  try {
    await presetCall(ch.deviceDeviceId ?? '', ch.deviceId, Number(item.presetId))
    notify('已调用预置位 ' + (item.presetName || item.presetId))
  } catch (e) {
    notify('预置位调用失败：' + (e instanceof Error ? e.message : String(e)))
  }
}

async function cruise(action: 'start' | 'stop') {
  const ch = requireChannel()
  if (!ch) return
  try {
    if (action === 'start') await cruiseStart(ch.deviceDeviceId ?? '', ch.deviceId, cruiseId.value)
    else await cruiseStop(ch.deviceDeviceId ?? '', ch.deviceId, cruiseId.value)
    notify(action === 'start' ? '巡航已开始' : '巡航已停止')
  } catch (e) {
    notify('巡航指令失败：' + (e instanceof Error ? e.message : String(e)))
  }
}

/** mouseup 兜底：松开鼠标自动发停止指令 */
function onWindowMouseUp() {
  if (currentCommand) {
    if (currentCommand === 'focus' || currentCommand === 'iris') void releaseStop()
    else void ptzStop()
  }
}

onMounted(() => {
  window.addEventListener('mouseup', onWindowMouseUp)
})

onBeforeUnmount(() => {
  window.removeEventListener('mouseup', onWindowMouseUp)
})
</script>

<template>
  <aside class="panel right-panel">
    <div class="section-title">云台控制</div>
    <div class="select" :class="{ disabled: !hasPtz }">◉　{{ channelLabel }} <span>{{ hasPtz ? '⌄' : '' }}</span></div>

    <div class="ptz-dpad">
      <div class="dpad-ring"></div>
      <button
        v-for="d in directions"
        :key="d.key"
        class="dpad-btn"
        :class="d.cls"
        @mousedown.prevent="ptzMove(d.key)"
        @mouseup.prevent="ptzStop()"
      >
        <span v-if="'rotate' in d" class="diag-arrow" :style="{ transform: `rotate(${d.rotate}deg)` }">▲</span>
        <template v-else>{{ d.label }}</template>
      </button>
      <button class="dpad-btn dpad-center" title="停止" @click="ptzStop()">⏹</button>
    </div>

    <div class="tool-grid">
      <button class="tool" @mousedown.prevent="ptzMove('zoomin')" @mouseup.prevent="ptzStop()">⌕ <span>变倍+</span></button>
      <button class="tool" @mousedown.prevent="ptzMove('zoomout')" @mouseup.prevent="ptzStop()">◯ <span>变倍-</span></button>
      <button class="tool" @mousedown.prevent="focusMove('near')" @mouseup.prevent="releaseStop()">⌖ <span>聚焦+</span></button>
      <button class="tool" @mousedown.prevent="focusMove('far')" @mouseup.prevent="releaseStop()">⌖ <span>聚焦-</span></button>
      <button class="tool" @mousedown.prevent="irisMove('in')" @mouseup.prevent="releaseStop()">◉ <span>光圈+</span></button>
      <button class="tool" @mousedown.prevent="irisMove('out')" @mouseup.prevent="releaseStop()">◉ <span>光圈-</span></button>
      <button class="tool" @click="dragZoom('in')">⊞ <span>拉框放大</span></button>
      <button class="tool" @click="dragZoom('out')">⊟ <span>拉框缩小</span></button>
    </div>

    <div class="slider-row">
      <span>速度</span>
      <input v-model.number="speed" class="slider" type="range" min="1" max="10" />
      <span class="slider-value">{{ speed }}</span>
    </div>

    <!-- 预置位：仅接口查询到预置点时显示 -->
    <div v-if="presetEnabled" class="preset">
      <div class="section-label">预置位<span class="preset-count">{{ presets!.length }}</span></div>
      <div class="preset-row">
        <button
          v-for="p in presets"
          :key="p.presetId"
          :title="p.presetName || undefined"
          :class="{ active: activePreset === p.presetId }"
          @click="preset(p)"
        >{{ p.presetId }}</button>
      </div>
    </div>

    <div class="cruise">
      <div class="cruise-top">
        <span>巡航</span>
        <select v-model.number="cruiseId">
          <option :value="1">巡航路线1</option>
          <option :value="2">巡航路线2</option>
        </select>
      </div>
      <div class="cruise-buttons">
        <button class="cruise-btn" @click="cruise('start')">▶ 开始</button>
        <button class="cruise-btn" @click="cruise('stop')">■ 停止</button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.right-panel {
  display: flex;
  flex-direction: column;
  padding: 10px;
  gap: 9px;
  overflow-y: auto;
}

.select {
  height: 35px;
  border: 1px solid #0862b5;
  border-radius: 5px;
  background: #062c5add;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #d8ebff;
  font-size: 13px;
  flex: none;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.select.disabled {
  color: #7f9cb5;
}

/* 8 方向云台圆盘（布局取自 web/src/views/common/ptzControls.vue） */
.ptz-dpad {
  position: relative;
  width: 180px;
  height: 180px;
  flex: none;
  margin: 2px auto;
}

.dpad-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 130px;
  height: 130px;
  border-radius: 50%;
  background: radial-gradient(circle, #0a65b8 0 18%, #032e5b 19% 46%, #031b38 47%);
  border: 1px solid #0871ca;
  box-shadow: 0 0 20px #008dff33;
  pointer-events: none;
}

.dpad-btn {
  position: absolute;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: transparent;
  border: none;
  outline: none;
  padding: 0;
  user-select: none;
  transition: all 0.15s;
  -webkit-tap-highlight-color: transparent;
  color: #c9e6ff;
}

.card {
  width: 46px;
  height: 46px;
  font-size: 18px;
}

.card:hover {
  background: #079ff0;
  color: #fff;
  box-shadow: 0 3px 10px rgba(0, 165, 255, 0.4);
  transform: scale(1.1);
}

.card:active {
  background: #0570b5;
  transform: scale(0.92);
}

.card-up { top: 18px; left: 67px; }
.card-right { top: 67px; left: 116px; }
.card-down { top: 116px; left: 67px; }
.card-left { top: 67px; left: 18px; }

.diag {
  width: 36px;
  height: 36px;
  font-size: 14px;
  color: #7fa8c9;
}

.diag:hover {
  background: #079ff0;
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 165, 255, 0.35);
  transform: scale(1.1);
}

.diag:active {
  background: #0570b5;
  transform: scale(0.9);
}

.diag-upright { top: 40px; left: 110px; }
.diag-downright { top: 110px; left: 110px; }
.diag-downleft { top: 110px; left: 34px; }
.diag-upleft { top: 40px; left: 34px; }

.diag-arrow {
  display: inline-block;
}

.dpad-center {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  background: #079ff0;
  border: 1px solid #8ce7ff;
  font-size: 20px;
  color: #fff;
  line-height: 1;
}

.dpad-center:hover {
  box-shadow: 0 3px 10px rgba(0, 165, 255, 0.4);
  transform: translate(-50%, -50%) scale(1.1);
}

.dpad-center:active {
  background: #0570b5;
  transform: translate(-50%, -50%) scale(0.92);
}

/* 变倍/聚焦/光圈/拉框（取自 bigscreen-mockup.html .tool-grid） */
.tool-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.tool {
  height: 37px;
  background: linear-gradient(180deg, #073e79, #052c59);
  border: 1px solid rgba(14, 136, 243, 0.62);
  border-radius: 5px;
  color: #e7f7ff;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 12px;
  cursor: pointer;
}

.tool:hover {
  border-color: #18d5ff;
  box-shadow: 0 0 12px rgba(10, 200, 255, 0.22);
}

/* 速度滑块 */
.slider-row {
  display: grid;
  grid-template-columns: 38px 1fr 27px;
  gap: 7px;
  align-items: center;
  font-size: 13px;
  margin-top: 1px;
}

.slider {
  width: 100%;
  accent-color: #0bbefe;
  min-width: 0;
}

.slider-value {
  height: 27px;
  border: 1px solid rgba(28, 133, 226, 0.58);
  border-radius: 4px;
  display: grid;
  place-items: center;
  background: #05274d;
}

/* 预置位/巡航 */
.section-label {
  font-size: 13px;
  font-weight: 700;
  margin: 0 1px;
  color: #e6f5ff;
}

.preset {
  border-top: 1px solid rgba(20, 120, 205, 0.38);
  padding-top: 7px;
}

.preset-count {
  float: right;
  color: #6599bf;
  font-size: 11px;
  font-weight: 400;
}

.preset-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.preset-row button,
.cruise-btn {
  height: 34px;
  background: #063664;
  border: 1px solid rgba(18, 129, 234, 0.58);
  border-radius: 5px;
  color: #effaff;
  cursor: pointer;
}

.preset-row button:hover,
.cruise-btn:hover {
  border-color: #18d5ff;
  box-shadow: 0 0 12px rgba(10, 200, 255, 0.22);
}

.preset-row button.active {
  background: #0c73d9;
  border-color: #20d1ff;
  box-shadow: 0 0 13px rgba(12, 189, 255, 0.22);
}

.cruise {
  border-top: 1px solid rgba(20, 120, 205, 0.38);
  padding-top: 7px;
}

.cruise-top {
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: 7px;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
}

.cruise select {
  height: 31px;
  background: #05294f;
  border: 1px solid rgba(18, 128, 228, 0.55);
  color: #e4f6ff;
  border-radius: 5px;
  padding: 0 8px;
}

.cruise-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
  margin-top: 6px;
}

.cruise-btn {
  height: 31px;
}
</style>
