<script setup lang="ts">
import { selectedChannel, playRequestCount, treeNodes, useDevices } from '../stores/useDevices'
import { useToast } from '../composables/useToast'
import type { TreeNode } from '../stores/useDevices'
import deviceIconUrl from '../assets/icons/camera.svg'
import channelIconUrl from '../assets/icons/camera-channel.svg'

const { error, devices } = useDevices()
const { notify } = useToast()

function selectChannel(node: TreeNode) {
  if (node.kind !== 'device' || !node.channel) return
  selectedChannel.value = node.channel
  playRequestCount.value++
  notify('已选中：' + node.label)
}
</script>

<template>
  <aside class="panel left-panel">
    <div class="tree">
      <div v-if="error" class="tree-error">{{ error }}</div>
      <div v-else-if="devices.length === 0" class="tree-error">加载设备中…</div>
      <template v-else>
        <!-- 设备 → 通道（默认全展开，不可折叠） -->
        <div class="node device" v-for="dev in treeNodes" :key="dev.label">
          <div class="row dev">
            <img :src="deviceIconUrl" class="icon-img dev" alt="" @error="($event.target as HTMLImageElement).style.display = 'none'" />
            <span class="row-label">{{ dev.label }}</span>
            <em>{{ dev.count }}</em>
          </div>
          <div class="children">
            <div
              v-for="ch in dev.children"
              :key="ch.channel?.deviceId"
              class="row cam"
              :class="{ active: selectedChannel?.deviceId === ch.channel?.deviceId }"
              :title="ch.channel?.deviceId"
              @click="selectChannel(ch)"
            >
              <i class="dot" :class="{ off: !ch.online }"></i>
              <img
                :src="channelIconUrl"
                class="icon-img cam"
                :class="{ off: !ch.online }"
                alt=""
                @error="($event.target as HTMLImageElement).style.display = 'none'"
              />
              <span class="row-label">{{ ch.label }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.left-panel {
  padding: 8px 7px;
}

.tree {
  font-size: 14px;
  height: 100%;
  overflow: auto;
  padding-right: 3px;
}

.tree-error {
  color: #8fa8c0;
  font-size: 12px;
  padding: 10px;
}

.row {
  height: 35px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border-radius: 4px;
  white-space: nowrap;
  cursor: default;
}

.row em {
  font-style: normal;
  color: #8fadc9;
  margin-left: auto;
  font-size: 11px;
}

/* 图片图标（src/assets/icons/），深色 svg 经滤镜转浅蓝主题色 */
.icon-img {
  width: 16px;
  height: 16px;
  object-fit: contain;
  flex: none;
  filter: invert(1) hue-rotate(185deg) saturate(1.4) brightness(1.1);
}

.icon-img.dev {
  width: 18px;
  height: 18px;
}

/* 通道图标离线置灰（源码 RegionTree：在线彩色/离线灰色） */
.icon-img.cam.off {
  filter: grayscale(1) brightness(0.75) opacity(0.55);
}

.row-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 设备行 */
.row.dev:hover {
  background: #08376b88;
}

.node.device {
  border-left: 1px solid rgba(21, 107, 194, 0.55);
  padding-left: 4px;
}

/* 通道行（挂在设备连线右侧，再缩进） */
.children {
  margin-left: 14px;
  border-left: 1px solid rgba(21, 107, 194, 0.4);
  padding-left: 4px;
}

.row.cam {
  height: 32px;
  font-size: 13px;
  cursor: pointer;
}

.row.cam:hover {
  background: #08376b88;
}

.row.cam.active {
  background: linear-gradient(90deg, #0b69cf, #0a59ad);
  box-shadow: inset 0 0 0 1px rgba(49, 199, 255, 0.16);
}

/* 状态点 */
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #19ddb9;
  box-shadow: 0 0 7px #19ddb9;
  flex: none;
}

.dot.off {
  background: #52708e;
  box-shadow: none;
}
</style>
