import { computed, ref } from 'vue'
import { getAlarmList, getChannels, getDevices, getResourceInfo } from '../api/wvp'
import type { ResourceInfo, WvpAlarm, WvpChannel, WvpDevice } from '../types/api'

/** 选中通道（跨组件共享：设备树 / 视频墙 / 云台面板联动） */
export const selectedChannel = ref<WvpChannel | null>(null)

/** 播放请求信号：设备树每次点击通道自增，VideoWall 监听它触发推流（引用不变也能触发） */
export const playRequestCount = ref(0)

const devices = ref<WvpDevice[]>([])
const channels = ref<WvpChannel[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const loadedAt = ref<number | null>(null)

export const deviceError = error

/** 树节点：根（folder）→ 设备（folder）→ 通道（device），嵌套结构 */
export interface TreeNode {
  kind: 'folder' | 'device'
  label: string
  count?: string
  online?: boolean
  channel?: WvpChannel
  children?: TreeNode[]
}

const POLL_INTERVAL_MS = 30_000
let pollTimer: ReturnType<typeof setInterval> | null = null

async function loadOnce() {
  loading.value = true
  error.value = null
  try {
    const devicePage = await getDevices()
    const deviceList = devicePage.list
    const channelLists = await Promise.all(
      deviceList.map((d) => getChannels(d.deviceId).catch(() => null)),
    )
    const allChannels: WvpChannel[] = []
    deviceList.forEach((d, i) => {
      const page = channelLists[i]
      if (!page) return
      for (const ch of page.list) {
        // 注意：该接口的 gbId 字段返回坏数据（恒 0），真实数据库主键在 id 字段
        allChannels.push({ ...ch, gbId: ch.id ?? ch.gbId, deviceDeviceId: d.deviceId, deviceName: d.name })
      }
    })
    devices.value = deviceList
    channels.value = allChannels
    loadedAt.value = Date.now()

    // 选中通道的数据可能在轮询后变化，按 deviceId 同步刷新
    if (selectedChannel.value) {
      const fresh = allChannels.find((c) => c.deviceId === selectedChannel.value?.deviceId)
      selectedChannel.value = fresh ?? null
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

export function startDevicePolling() {
  void loadOnce()
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(loadOnce, POLL_INTERVAL_MS)
}

export function stopDevicePolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

/** 树数据：设备 → 通道 两级（"全部设备"根由组件渲染） */
export const treeNodes = computed<TreeNode[]>(() => {
  return devices.value.map((d) => {
    const deviceChannels = channels.value.filter((c) => c.deviceDeviceId === d.deviceId)
    const onlineCount = deviceChannels.filter((c) => c.status === 'ON').length
    return {
      kind: 'folder' as const,
      label: d.name,
      count: `(${onlineCount}/${d.channelCount})`,
      online: d.onLine,
      children: deviceChannels.map<TreeNode>((ch) => ({
        kind: 'device',
        label: ch.name,
        channel: ch,
        online: ch.status === 'ON',
      })),
    }
  })
})

export function useDevices() {
  return { devices, channels, treeNodes, loading, error, reload: loadOnce }
}

// ---------- 统计 ----------

let resourceTimer: ReturnType<typeof setInterval> | null = null

const resourceInfo = ref<ResourceInfo | null>(null)
const resourceError = ref<string | null>(null)

async function loadResource() {
  try {
    resourceInfo.value = await getResourceInfo()
    resourceError.value = null
  } catch (e) {
    resourceError.value = e instanceof Error ? e.message : String(e)
  }
}

export function startResourcePolling() {
  void loadResource()
  if (resourceTimer) clearInterval(resourceTimer)
  resourceTimer = setInterval(loadResource, POLL_INTERVAL_MS)
}

export function stopResourcePolling() {
  if (resourceTimer) clearInterval(resourceTimer)
  resourceTimer = null
}

export function useResource() {
  return { resourceInfo, error: resourceError }
}

/** 球机/枪机数量（ptzType > 0 为球机） */
export const ptzStats = computed(() => {
  const ptz = channels.value.filter((c) => (c.ptzType ?? 0) > 0).length
  return { ptz, fixed: channels.value.length - ptz }
})

// ---------- 告警 ----------

const alarms = ref<WvpAlarm[]>([])
const alarmError = ref<string | null>(null)
let alarmTimer: ReturnType<typeof setInterval> | null = null

async function loadAlarms() {
  try {
    const page = await getAlarmList(1, 5)
    alarms.value = page.list
    alarmError.value = null
  } catch (e) {
    alarmError.value = e instanceof Error ? e.message : String(e)
  }
}

export function startAlarmPolling() {
  void loadAlarms()
  if (alarmTimer) clearInterval(alarmTimer)
  alarmTimer = setInterval(loadAlarms, POLL_INTERVAL_MS)
}

export function stopAlarmPolling() {
  if (alarmTimer) clearInterval(alarmTimer)
  alarmTimer = null
}

export function useAlarms() {
  return { alarms, error: alarmError }
}
