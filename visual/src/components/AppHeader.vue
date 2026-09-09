<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const clock = ref(format(new Date()))
let timer: ReturnType<typeof setInterval>

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function format(now: Date) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

onMounted(() => {
  timer = setInterval(() => {
    clock.value = format(new Date())
  }, 1000)
})

onBeforeUnmount(() => {
  clearInterval(timer)
})
</script>

<template>
  <header class="header">
    <div class="logo">◉</div>
    <div class="title">智慧安防监控平台</div>
    <div class="header-right">
      <div class="clock">{{ clock }}</div>
      <div class="weather">星期日　多云　28°C　<b>☼</b></div>
    </div>
  </header>
</template>

<style scoped>
.header {
  position: relative;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #0a4c92;
  padding: 0 10px;
}

.header::after {
  content: '';
  position: absolute;
  left: 0;
  right: 25%;
  bottom: -1px;
  height: 2px;
  background: linear-gradient(90deg, transparent, #00aaff, #00d9ff, transparent);
  box-shadow: 0 0 14px #00bfff;
}

.logo {
  width: 55px;
  height: 55px;
  border: 1px solid #09a8ff;
  border-radius: 12px;
  background: linear-gradient(145deg, #0b8fe4, #05336e);
  display: grid;
  place-items: center;
  font-size: 29px;
  box-shadow: 0 0 22px #008cff55;
  margin-right: 15px;
}

.title {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 2px;
  text-shadow: 0 0 12px #0aaaff66;
}

.header-right {
  margin-left: auto;
  text-align: right;
  line-height: 1.35;
}

.clock {
  font-size: 16px;
  color: #dcecff;
}

.weather {
  font-size: 13px;
  color: #9db8d5;
}

.weather b {
  font-size: 20px;
  color: #ffd15c;
  margin-left: 14px;
}
</style>
