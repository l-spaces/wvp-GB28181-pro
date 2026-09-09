/**
 * 告警类型映射：value → 中文 label。
 * 取自源码 web/src/views/alarm/index.vue 的 ALARM_TYPE_OPTIONS（29 种）。
 */
export const ALARM_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'VideoLoss', label: '视频丢失报警' },
  { value: 'DeviceTamper', label: '设备防拆报警' },
  { value: 'StorageFull', label: '存储设备磁盘满报警' },
  { value: 'DeviceHighTemperature', label: '设备高温报警' },
  { value: 'DeviceLowTemperature', label: '设备低温报警' },
  { value: 'ManualVideo', label: '人工视频报警' },
  { value: 'MotionDetection', label: '运动目标检测报警' },
  { value: 'LeftObjectDetection', label: '遗留物检测报警' },
  { value: 'ObjectRemovalDetection', label: '物体移除检测报警' },
  { value: 'TripwireDetection', label: '绊线检测报警' },
  { value: 'IntrusionDetection', label: '入侵检测报警' },
  { value: 'MobileDetection', label: '移动侦测报警' },
  { value: 'VideoOcclusion', label: '视频遮挡报警' },
  { value: 'ReverseDetection', label: '逆行检测报警' },
  { value: 'LoiteringDetection', label: '徘徊检测报警' },
  { value: 'FlowStatistics', label: '流量统计报警' },
  { value: 'DensityDetection', label: '密度检测报警' },
  { value: 'VideoAbnormal', label: '视频异常检测报警' },
  { value: 'RapidMovement', label: '快速移动报警' },
  { value: 'StorageFault', label: '存储设备磁盘故障报警' },
  { value: 'StorageFanFault', label: '存储设备风扇故障报警' },
  { value: 'SoundAbnormal', label: '声音异常报警' },
  { value: 'SignalAbnormal', label: '信号量异常报警' },
  { value: 'IllegalAccess', label: '非法访问报警' },
  { value: 'Defocus', label: '虚焦报警' },
  { value: 'SceneChange', label: '场景变更报警' },
  { value: 'CrowdGathering', label: '人员聚集报警' },
  { value: 'ParkingDetection', label: '停车侦测报警' },
  { value: 'Other', label: '其他报警' },
]

/** 告警类型 value 转中文 label，未知类型返回原值 */
export function alarmTypeLabel(value: string): string {
  return ALARM_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value
}
