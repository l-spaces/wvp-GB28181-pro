<script setup lang="ts">
import { useAlarms } from '../stores/useDevices'
import { WVP_WEB_URL } from '../config/env'
import { alarmTypeLabel } from '../constants/alarm'

const { alarms, error } = useAlarms()

/** WVP 源码前端为 hash 路由，告警管理页 */
const alarmPageUrl = `${WVP_WEB_URL}/#/alarm`

/** alarmTime 为毫秒时间戳，格式化为 yyyy-MM-dd HH:mm:ss */
function formatTime(value: number | string): string {
  const ts = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(ts) || ts <= 0) return String(value)
  const p = (n: number) => String(n).padStart(2, '0')
  const d = new Date(ts)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
</script>

<template>
  <div class="panel alarm-panel">
    <div class="bottom-title">
      告警信息
      <a class="more" :href="alarmPageUrl" target="_blank" rel="noopener">更多 ›</a>
    </div>
    <div v-if="error" class="panel-error">{{ error }}</div>
    <div v-else-if="alarms.length === 0" class="empty">暂无告警</div>
    <table v-else class="alarm-table">
      <thead><tr><th>通道</th><th>类型</th><th>时间</th><th>状态</th></tr></thead>
      <tbody>
        <tr v-for="a in alarms" :key="a.id">
          <td>{{ a.channelName || a.channelDeviceId || a.deviceId }}</td><td>{{ alarmTypeLabel(a.alarmType) }}</td><td>{{ formatTime(a.alarmTime) }}</td>
          <td class="done">○ 已处理</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.alarm-panel {
  padding: 10px 12px;
  min-width: 0;
  overflow: hidden;
}

.more {
  float: right;
  color: #6fa9da;
  font-size: 12px;
  text-decoration: none;
  cursor: pointer;
}

.more:hover {
  color: #16c9ff;
}

.empty {
  padding: 30px 0;
  text-align: center;
  color: #7f9cb5;
  font-size: 12px;
}

.alarm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.alarm-table th,
.alarm-table td {
  height: 28px;
  border-bottom: 1px solid #0a396b;
  text-align: left;
  white-space: nowrap;
}

.alarm-table th {
  color: #9db9d6;
  font-weight: 400;
}

.alarm-table .processing {
  color: #ff5265;
}

.alarm-table .done {
  color: #15e4a2;
}
</style>
