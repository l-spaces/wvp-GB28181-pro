<script setup lang="ts">
import { computed } from 'vue'
import { ptzStats, useResource } from '../stores/useDevices'
import BaseChart from './BaseChart.vue'
import type { EChartsOption } from 'echarts'

const { resourceInfo, error } = useResource()

const total = computed(() => resourceInfo.value?.device.total ?? 0)
const online = computed(() => resourceInfo.value?.device.online ?? 0)
const offline = computed(() => total.value - online.value)

/** 设备状态环形图（ECharts 环形饼图：在线/离线/报警） */
const donutOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'item', confine: true },
  series: [
    {
      type: 'pie',
      radius: ['62%', '86%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      label: { show: false },
      labelLine: { show: false },
      itemStyle: { borderColor: '#031832', borderWidth: 2 },
      data: [
        { value: online.value, name: '在线', itemStyle: { color: '#18dca3' } },
        { value: offline.value, name: '离线', itemStyle: { color: '#8ea9c6' } },
        { value: 0, name: '报警', itemStyle: { color: '#ff4d5d' } },
      ],
    },
  ],
}))
</script>

<template>
  <div class="panel status-panel">
    <div class="bottom-title">设备状态</div>
    <div v-if="error" class="panel-error">{{ error }}</div>
    <template v-else>
      <div class="status-layout">
        <div class="donut-wrap">
          <BaseChart :option="donutOption" />
          <div class="donut-center"><b>{{ total }}</b><small>设备总数</small></div>
        </div>
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
  grid-template-columns: 120px 1fr;
  gap: 5px;
  align-items: center;
}

.donut-wrap {
  position: relative;
  width: 112px;
  height: 112px;
  margin: auto;
}

.donut-center {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  align-content: center;
  text-align: center;
  pointer-events: none;
}

.donut-center b {
  font-size: 22px;
  font-weight: 800;
  color: #fff;
}

.donut-center small {
  font-size: 11px;
  color: #a9c4dd;
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

