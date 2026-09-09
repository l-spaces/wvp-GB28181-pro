<template>
  <section class="ptz-panel" aria-labelledby="ptz-title">
    <div class="panel-heading">
      <div>
        <h2 id="ptz-title">云台控制</h2>
        <p>控制当前选中的设备通道</p>
      </div>
      <span v-if="busy" class="busy-indicator" role="status">发送中…</span>
    </div>

    <div class="speed-fields">
      <label>
        <span>水平速度（0-255）</span>
        <input
          :value="speeds.horizonSpeed ?? ''"
          type="number"
          min="0"
          max="255"
          step="1"
          inputmode="numeric"
          :disabled="busy"
          :aria-invalid="Boolean(validationMessage)"
          @input="updateSpeed('horizonSpeed', $event)"
        />
      </label>
      <label>
        <span>垂直速度（0-255）</span>
        <input
          :value="speeds.verticalSpeed ?? ''"
          type="number"
          min="0"
          max="255"
          step="1"
          inputmode="numeric"
          :disabled="busy"
          :aria-invalid="Boolean(validationMessage)"
          @input="updateSpeed('verticalSpeed', $event)"
        />
      </label>
      <label>
        <span>变倍速度（0-15）</span>
        <input
          :value="speeds.zoomSpeed ?? ''"
          type="number"
          min="0"
          max="15"
          step="1"
          inputmode="numeric"
          :disabled="busy"
          :aria-invalid="Boolean(validationMessage)"
          @input="updateSpeed('zoomSpeed', $event)"
        />
      </label>
    </div>

    <p v-if="validationMessage" class="field-error" role="alert">{{ validationMessage }}</p>
    <p v-else-if="!available" class="field-hint">请先选择有效的设备和通道。</p>

    <div class="control-layout" :aria-busy="busy">
      <div class="direction-grid">
        <button
          v-for="control in directionControls"
          :key="control.command"
          type="button"
          class="ptz-button"
          :class="control.position"
          :disabled="!canSend"
          :aria-label="control.label"
          @click="send(control.command)"
        >
          {{ control.label }}
        </button>
      </div>

      <div class="zoom-controls">
        <button
          type="button"
          class="ptz-button ptz-button--wide"
          :disabled="!canSend"
          @click="send('zoomin')"
        >
          放大
        </button>
        <button
          type="button"
          class="ptz-button ptz-button--wide"
          :disabled="!canSend"
          @click="send('zoomout')"
        >
          缩小
        </button>
        <button
          type="button"
          class="ptz-button ptz-button--stop ptz-button--wide"
          :disabled="!canSend"
          @click="send('stop')"
        >
          停止
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { PtzCommand, PtzRequest } from '../types/wvp'

interface SpeedValues {
  horizonSpeed: number | null
  verticalSpeed: number | null
  zoomSpeed: number | null
}

type SpeedField = keyof SpeedValues

interface DirectionControl {
  command: Exclude<PtzCommand, 'zoomin' | 'zoomout' | 'stop'>
  label: string
  position: string
}

const props = defineProps<{
  busy: boolean
  available: boolean
}>()

const emit = defineEmits<{
  (event: 'command', request: PtzRequest): void
}>()

const speeds = reactive<SpeedValues>({
  horizonSpeed: 100,
  verticalSpeed: 100,
  zoomSpeed: 1,
})

const directionControls: DirectionControl[] = [
  { command: 'upleft', label: '左上', position: 'position-upleft' },
  { command: 'up', label: '上', position: 'position-up' },
  { command: 'upright', label: '右上', position: 'position-upright' },
  { command: 'left', label: '左', position: 'position-left' },
  { command: 'right', label: '右', position: 'position-right' },
  { command: 'downleft', label: '左下', position: 'position-downleft' },
  { command: 'down', label: '下', position: 'position-down' },
  { command: 'downright', label: '右下', position: 'position-downright' },
]

function isValidSpeed(value: number | null, max: number): value is number {
  return value !== null && Number.isInteger(value) && value >= 0 && value <= max
}

const validationMessage = computed(() => {
  if (!isValidSpeed(speeds.horizonSpeed, 255)) {
    return '水平速度必须是 0-255 的整数。'
  }
  if (!isValidSpeed(speeds.verticalSpeed, 255)) {
    return '垂直速度必须是 0-255 的整数。'
  }
  if (!isValidSpeed(speeds.zoomSpeed, 15)) {
    return '变倍速度必须是 0-15 的整数。'
  }
  return ''
})

function getValidSpeedValues(): Omit<PtzRequest, 'command'> | null {
  if (!isValidSpeed(speeds.horizonSpeed, 255)) {
    return null
  }
  if (!isValidSpeed(speeds.verticalSpeed, 255)) {
    return null
  }
  if (!isValidSpeed(speeds.zoomSpeed, 15)) {
    return null
  }

  return {
    horizonSpeed: speeds.horizonSpeed,
    verticalSpeed: speeds.verticalSpeed,
    zoomSpeed: speeds.zoomSpeed,
  }
}

const validSpeeds = computed(() => getValidSpeedValues())

const canSend = computed(() => props.available && !props.busy && validSpeeds.value !== null)

function updateSpeed(field: SpeedField, event: Event): void {
  const input = event.currentTarget
  if (!(input instanceof HTMLInputElement)) {
    return
  }

  const value = input.value.trim()
  speeds[field] = value === '' ? null : Number(value)
}

function send(command: PtzCommand): void {
  const requestSpeeds = validSpeeds.value
  if (!canSend.value || requestSpeeds === null) {
    return
  }

  emit('command', {
    command,
    horizonSpeed: requestSpeeds.horizonSpeed,
    verticalSpeed: requestSpeeds.verticalSpeed,
    zoomSpeed: requestSpeeds.zoomSpeed,
  })
}
</script>

<style scoped>
.ptz-panel {
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

.busy-indicator {
  color: #2563eb;
  font-size: 13px;
  font-weight: 600;
}

.speed-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 20px;
}

.speed-fields label {
  display: grid;
  gap: 7px;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
}

.speed-fields input {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  color: #152238;
  font: inherit;
  font-weight: 400;
}

.speed-fields input:focus {
  outline: 2px solid #93c5fd;
  outline-offset: 1px;
  border-color: #2563eb;
}

.speed-fields input[aria-invalid='true'] {
  border-color: #dc2626;
}

.field-error,
.field-hint {
  margin: 10px 0 0;
  font-size: 13px;
}

.field-error {
  color: #b91c1c;
}

.field-hint {
  color: #64748b;
}

.control-layout {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(150px, 220px);
  align-items: center;
  gap: 28px;
  margin-top: 20px;
}

.direction-grid {
  display: grid;
  grid-template-columns: repeat(3, 72px);
  grid-template-rows: repeat(3, 48px);
  justify-content: center;
  gap: 8px;
}

.ptz-button {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid #bfdbfe;
  border-radius: 7px;
  background: #eff6ff;
  color: #1d4ed8;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.ptz-button:hover:not(:disabled) {
  border-color: #2563eb;
  background: #dbeafe;
}

.ptz-button:focus-visible {
  outline: 2px solid #1d4ed8;
  outline-offset: 2px;
}

.ptz-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.ptz-button--stop {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.ptz-button--stop:hover:not(:disabled) {
  border-color: #dc2626;
  background: #fee2e2;
}

.position-upleft { grid-column: 1; grid-row: 1; }
.position-up { grid-column: 2; grid-row: 1; }
.position-upright { grid-column: 3; grid-row: 1; }
.position-left { grid-column: 1; grid-row: 2; }
.position-right { grid-column: 3; grid-row: 2; }
.position-downleft { grid-column: 1; grid-row: 3; }
.position-down { grid-column: 2; grid-row: 3; }
.position-downright { grid-column: 3; grid-row: 3; }

.zoom-controls {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.ptz-button--wide {
  width: 100%;
}

@media (max-width: 680px) {
  .ptz-panel {
    padding: 18px;
  }

  .speed-fields {
    grid-template-columns: 1fr;
  }

  .control-layout {
    grid-template-columns: 1fr;
    gap: 20px;
  }
}
</style>
