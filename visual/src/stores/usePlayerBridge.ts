import { ref } from 'vue'
import type { JessibucaPlayer } from '../types/player'

/**
 * 播放器能力桥：VideoWall 把"当前选中格"的 jessibuca 实例与截图函数暴露给全局，
 * 快捷操作等外部组件通过它调用播放器能力（截图等）。
 * WebRTC 模式的播放器无 canvas，不支持截图。
 */

/** 当前选中格的 jessibuca 播放器实例（无或 RTC 模式时为 null） */
export const activeJessibuca = ref<JessibucaPlayer | null>(null)

/** 选中通道名（截图文件名用） */
export const activeChannelName = ref('')

/** 截图执行函数（返回 false 表示当前选中格无可截取的画面），由 VideoWall 注册 */
export const screenshotHandler = ref<(() => boolean) | null>(null)

/** 执行截图：返回是否成功（未播放/RTC 模式返回 false） */
export function takeScreenshot(): boolean {
  return screenshotHandler.value?.() ?? false
}
