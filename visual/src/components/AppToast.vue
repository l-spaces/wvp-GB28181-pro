<script setup lang="ts">
import { useToast } from '../composables/useToast'

const { visible, text } = useToast()
</script>

<template>
  <div class="toast" :class="{ show: visible }">{{ text }}</div>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%) translateY(20px);
  opacity: 0;
  background: #062c56ee;
  border: 1px solid #0bb4ff;
  padding: 10px 18px;
  border-radius: 5px;
  transition: 0.25s;
  z-index: 99;
  pointer-events: none;
}

.toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
</style>
