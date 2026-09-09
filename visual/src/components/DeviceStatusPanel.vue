<script setup lang="ts">
import { computed } from 'vue'
import { ptzStats, useResource } from '../stores/useDevices'

const { resourceInfo, error } = useResource()

const total = computed(() => resourceInfo.value?.device.total ?? 0)
const online = computed(() => resourceInfo.value?.device.online ?? 0)
const offline = computed(() => total.value - online.value)

/** 通道在线率（环形图占比） */
const onlineRate = computed(() => {
  if (total.value === 0) return 0
  return Math.round((online.value / total.value) * 100)
})

const donutStyle = computed(() => {
  return { background: `conic-gradient(#18dca3 0 ${onlineRate.value}%, #8ea9c6 ${onlineRate.value}% 87%, #ff4d5d 87% 100%)` }
})
</script>

<template>
  <div class="panel status-panel">
    <div class="bottom-title">设备状态</div>
    <div v-if="error" class="panel-error">{{ error }}</div>
    <template v-else>
      <div class="status-layout">
        <div class="donut" :style="donutStyle"><div class="num">{{ total }}<small>设备总数</small></div></div>
        <div class="legend">
          <div><i></i>在线 <span class="val">{{ online }}</span></div>
          <div><i class="off"></i>离线 <span class="val">{{ offline }}</span></div>
          <div><i class="alarm"></i>报警 <span class="val">0</span></div>
        </div>
      </div>
      <div class="device-types">
        <div>◉ 球机<b>{{ ptzStats.ptz }}</b></div><div>◉ 枪机<b>{{ ptzStats.fixed }}</b></div><div>◎ NVR<b>0</b></div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.status-panel {
  padding: 10px 12px;
}

.status-layout {
  display: grid;
  grid-template-columns: 145px 1fr;
  gap: 5px;
  align-items: center;
}

.donut {
  width: 108px;
  height: 108px;
  border-radius: 50%;
  margin: auto;
  position: relative;
  display: grid;
  place-items: center;
}

.donut::after {
  content: '';
  position: absolute;
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: #031832;
}

.donut .num {
  z-index: 1;
  text-align: center;
  font-size: 22px;
  font-weight: 800;
}

.donut .num small {
  display: block;
  font-size: 11px;
  color: #a9c4dd;
  font-weight: 400;
}

.legend div {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  font-size: 13px;
}

.legend i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #18dca3;
}

.legend .off {
  background: #8ea9c6;
}

.legend .alarm {
  background: #ff4d5d;
}

.legend .val {
  margin-left: auto;
}

.device-types {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  margin-top: 6px;
}

.device-types div {
  background: #052653;
  border: 1px solid #0a4c87;
  border-radius: 5px;
  text-align: center;
  padding: 5px;
  font-size: 11px;
  color: #9fc0df;
}

.device-types b {
  display: block;
  color: #fff;
  font-size: 16px;
}
</style>
