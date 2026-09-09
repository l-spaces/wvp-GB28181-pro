<script setup lang="ts">
import { useToast } from '../composables/useToast'
import recordIcon from '../assets/icons/record.svg'
import screenshotIcon from '../assets/icons/screenshot.svg'
import audioIcon from '../assets/icons/audio.svg'
import ptzIcon from '../assets/icons/ptz.svg'
import settingsIcon from '../assets/icons/settings.svg'
import fullscreenIcon from '../assets/icons/fullscreen.svg'

const { notify } = useToast()

const actions = [
  { icon: recordIcon, label: '录像回放', tip: '打开录像回放' },
  { icon: screenshotIcon, label: '截图', tip: '已执行截图' },
  { icon: audioIcon, label: '语音对讲', tip: '打开语音对讲' },
  { icon: ptzIcon, label: '云台控制', tip: '打开云台控制' },
  { icon: settingsIcon, label: '设备配置', tip: '打开设备配置' },
]

function togglePageFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
  else document.exitFullscreen?.()
}
</script>

<template>
  <div class="panel quick-panel">
    <div class="bottom-title">快捷操作</div>
    <div class="shortcut-grid">
      <button v-for="a in actions" :key="a.label" @click="notify(a.tip)">
        <img :src="a.icon" class="qicon" :alt="a.label" />
        <span>{{ a.label }}</span>
      </button>
      <button @click="togglePageFullscreen">
        <img :src="fullscreenIcon" class="qicon" alt="全屏" />
        <span>全屏</span>
      </button>
    </div>
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
