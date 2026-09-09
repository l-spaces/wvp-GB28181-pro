<script setup lang="ts">
import { computed } from 'vue'
import { useToast } from '../composables/useToast'

const props = defineProps<{ count: number }>()
const emit = defineEmits<{ 'update:count': [count: number] }>()

const { notify } = useToast()

const layouts = [
  { count: 1, label: '1分屏', cells: 1 },
  { count: 4, label: '4分屏', cells: 2 },
  { count: 9, label: '9分屏', cells: 3 },
  { count: 16, label: '16分屏', cells: 4 },
]

const currentLabel = computed(() => `当前：${props.count}分屏`)

function setGrid(n: number) {
  emit('update:count', n)
  notify('已切换为 ' + n + ' 分屏')
}
</script>

<template>
  <div class="panel bottom-panel">
    <div class="bottom-title">分屏模式 <span class="current">{{ currentLabel }}</span></div>
    <div class="split-buttons">
      <button
        v-for="l in layouts"
        :key="l.count"
        class="split-btn"
        :class="{ active: l.count === count }"
        @click="setGrid(l.count)"
      >
        <span class="grid-icon" :style="{ gridTemplateColumns: `repeat(${l.cells}, 1fr)` }">
          <span
            v-for="c in l.cells * l.cells"
            :key="c"
            class="cell"
          ></span>
        </span><span>{{ l.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.bottom-panel {
  padding: 10px 12px;
}

.current {
  float: right;
  color: #6fa9da;
  font-size: 12px;
}

.split-buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.split-btn {
  height: 74px;
  border: 1px solid #084f91;
  border-radius: 6px;
  background: #06244a;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

/* 迷你分屏示意：1格 / 2x2 / 3x3 / 4x4 小方格 */
.grid-icon {
  display: grid;
  gap: 2px;
  width: 30px;
  height: 30px;
}

.grid-icon .cell {
  background: #9fd0ff88;
  border-radius: 1px;
}

.split-btn.active .grid-icon .cell {
  background: #ffffffcc;
}

.split-btn.active {
  border-color: #05adff;
  box-shadow: 0 0 14px #009dff66;
  background: linear-gradient(#074a8b, #06264e);
}
</style>
