<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import type { EChartsOption } from 'echarts'
import { echarts } from '../charts'

const props = defineProps<{ option: EChartsOption }>()

const el = useTemplateRef<HTMLElement>('el')
const chart = shallowRef<ReturnType<typeof echarts.init> | null>(null)

function onResize() {
  chart.value?.resize()
}

onMounted(() => {
  if (!el.value) return
  chart.value = echarts.init(el.value)
  chart.value.setOption(props.option)
  window.addEventListener('resize', onResize)
})

watch(
  () => props.option,
  (opt) => chart.value?.setOption(opt, true),
  { deep: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  chart.value?.dispose()
})
</script>

<template>
  <div ref="el" class="base-chart"></div>
</template>

<style scoped>
.base-chart {
  width: 100%;
  height: 100%;
}
</style>
