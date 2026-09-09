<script setup lang="ts">
import { useAlarms } from '../stores/useDevices'

const { alarms, error } = useAlarms()
</script>

<template>
  <div class="panel alarm-panel">
    <div class="bottom-title">告警信息 <span class="more">更多 ›</span></div>
    <div v-if="error" class="panel-error">{{ error }}</div>
    <div v-else-if="alarms.length === 0" class="empty">暂无告警</div>
    <table v-else class="alarm-table">
      <thead><tr><th>时间</th><th>类型</th><th>设备</th><th>状态</th></tr></thead>
      <tbody>
        <tr v-for="a in alarms" :key="a.id">
          <td>{{ a.alarmTime }}</td><td>{{ a.alarmType }}</td><td>{{ a.channelName || a.channelDeviceId || a.deviceId }}</td>
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
