<script setup lang="ts">
import { ref } from 'vue'
import { useToast } from '../composables/useToast'
import { takeScreenshot } from '../stores/usePlayerBridge'
import { selectedChannel } from '../stores/useDevices'
import TalkDialog from './TalkDialog.vue'
import RecordDialog from './RecordDialog.vue'
import recordIcon from '../assets/icons/record.svg'
import screenshotIcon from '../assets/icons/screenshot.svg'
import audioIcon from '../assets/icons/audio.svg'
import ptzIcon from '../assets/icons/ptz.svg'
import settingsIcon from '../assets/icons/settings.svg'
import fullscreenIcon from '../assets/icons/fullscreen.svg'

const { notify } = useToast()

const actions = [
  { icon: ptzIcon, label: '云台控制', tip: '打开云台控制' },
  { icon: settingsIcon, label: '设备配置', tip: '打开设备配置' },
]

const talkVisible = ref(false)
const recordVisible = ref(false)

/** 语音对讲/录像回放：未选中通道时不允许打开 */
function requireChannel(action: () => void) {
  if (!selectedChannel.value) {
    notify('请先在设备树或视频墙选择通道')
    return
  }
  action()
}

/** 截图：源码"视频播放"同款 jessibuca.screenshot()，仅选中格在播（FLV 模式）时可用 */
function onScreenshot() {
  if (!takeScreenshot()) {
    notify('请先在视频墙选中并播放视频，再截图')
    return
  }
  notify('截图已保存')
}

function togglePageFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
  else document.exitFullscreen?.()
}
</script>

<template>
  <div class="panel quick-panel">
    <div class="bottom-title">快捷操作</div>
    <div class="shortcut-grid">
      <button @click="requireChannel(() => { recordVisible = true })">
        <img :src="recordIcon" class="qicon" alt="录像回放" />
        <span>录像回放</span>
      </button>
      <button v-for="a in actions" :key="a.label" @click="notify(a.tip)">
        <img :src="a.icon" class="qicon" :alt="a.label" />
        <span>{{ a.label }}</span>
      </button>
      <button @click="requireChannel(() => { talkVisible = true })">
        <img :src="audioIcon" class="qicon" alt="语音对讲" />
        <span>语音对讲</span>
      </button>
      <button @click="onScreenshot">
        <img :src="screenshotIcon" class="qicon" alt="截图" />
        <span>截图</span>
      </button>
      <button @click="togglePageFullscreen">
        <img :src="fullscreenIcon" class="qicon" alt="全屏" />
        <span>全屏</span>
      </button>
    </div>
    <TalkDialog v-model:show="talkVisible" />
    <RecordDialog v-model:show="recordVisible" />
  </div>
</template>

<style scoped>
.quick-panel {
  padding: 10px 12px;
}

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.shortcut-grid button {
  height: 78px;
  border: 1px solid #0a4e91;
  background: #052650;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 7px;
  font-size: 12px;
}

.shortcut-grid button:hover {
  border-color: #20d3ff;
  box-shadow: 0 0 14px rgba(12, 196, 255, 0.2);
}

.qicon {
  width: 26px;
  height: 26px;
  object-fit: contain;
  /* 深色 svg 转浅蓝主题色 */
  filter: invert(1) hue-rotate(185deg) saturate(1.4) brightness(1.1);
}

.shortcut-grid button:hover .qicon {
  filter: invert(1) hue-rotate(185deg) saturate(1.8) brightness(1.35) drop-shadow(0 0 6px rgba(12, 196, 255, 0.6));
}
</style>
