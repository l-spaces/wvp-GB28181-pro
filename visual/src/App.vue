<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { NConfigProvider, NMessageProvider, NDialogProvider, darkTheme, type GlobalThemeOverrides } from 'naive-ui'
import AppHeader from './components/AppHeader.vue'
import DeviceTree from './components/DeviceTree.vue'
import VideoWall from './components/VideoWall.vue'
import PtzPanel from './components/PtzPanel.vue'
import LayoutPanel from './components/LayoutPanel.vue'
import DeviceStatusPanel from './components/DeviceStatusPanel.vue'
import VideoInfoPanel from './components/VideoInfoPanel.vue'
import AlarmPanel from './components/AlarmPanel.vue'
import QuickPanel from './components/QuickPanel.vue'
import AppToast from './components/AppToast.vue'
import LoginPage from './components/LoginPage.vue'
import { startAlarmPolling, startDevicePolling, startResourcePolling, stopAlarmPolling, stopDevicePolling, stopResourcePolling } from './stores/useDevices'
import { loggedIn } from './stores/useAuth'
import type { StreamContent } from './types/api'

/** Naive UI 暗色主题，主色对齐大屏青蓝配色 */
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#08aaff',
    primaryColorHover: '#28b8ff',
    primaryColorPressed: '#0088dd',
    primaryColorSuppl: '#08aaff',
  },
}

const layoutCount = ref(9)
const activeStream = ref<StreamContent | null>(null)

function startPolling() {
  startDevicePolling()
  startResourcePolling()
  startAlarmPolling()
}

function stopPolling() {
  stopDevicePolling()
  stopResourcePolling()
  stopAlarmPolling()
}

onBeforeUnmount(stopPolling)

/** 登录态变化：false→true（登录成功）启动轮询；true→false（401 过期）停止轮询；immediate 覆盖刷新恢复登录态的场景 */
watch(
  loggedIn,
  (now, before) => {
    if (now && !before) startPolling()
    else if (!now && before) stopPolling()
  },
  { immediate: true },
)
</script>

<template>
  <NConfigProvider :theme="darkTheme" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <NDialogProvider>
        <LoginPage v-if="!loggedIn" />
        <div v-else class="dashboard">
          <AppHeader />
          <main class="main">
            <DeviceTree />
            <VideoWall v-model:stream="activeStream" :count="layoutCount" />
            <PtzPanel />
          </main>
          <section class="bottom">
            <LayoutPanel v-model:count="layoutCount" />
            <DeviceStatusPanel />
            <VideoInfoPanel :stream="activeStream" />
            <AlarmPanel />
            <QuickPanel />
          </section>
          <AppToast />
        </div>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped>
.dashboard {
  width: 100vw;
  height: 100vh;
  min-width: 1180px;
  min-height: 760px;
  background:
    radial-gradient(circle at 50% 0%, #06366c22, transparent 35%),
    linear-gradient(135deg, #020a18, #031631 45%, #020b1a);
  display: grid;
  grid-template-rows: 82px 1fr 250px;
  gap: 12px;
  padding: 10px 14px;
}

.main {
  min-height: 0;
  display: grid;
  grid-template-columns: 254px minmax(500px, 1fr) 250px;
  gap: 10px;
}

.bottom {
  display: grid;
  grid-template-columns: 300px 300px 280px minmax(420px, 1fr) 330px;
  gap: 10px;
  min-height: 0;
}

@media (max-width: 1250px) {
  .main {
    grid-template-columns: 1fr;
  }
}
</style>
