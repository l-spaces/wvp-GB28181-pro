<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
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
import { startAlarmPolling, startDevicePolling, startResourcePolling, stopAlarmPolling, stopDevicePolling, stopResourcePolling } from './stores/useDevices'
import type { StreamContent } from './types/api'

const layoutCount = ref(9)
const activeStream = ref<StreamContent | null>(null)

onMounted(() => {
  startDevicePolling()
  startResourcePolling()
  startAlarmPolling()
})

onBeforeUnmount(() => {
  stopDevicePolling()
  stopResourcePolling()
  stopAlarmPolling()
})
</script>

<template>
  <div class="dashboard">
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
