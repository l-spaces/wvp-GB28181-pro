<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { NPopconfirm } from 'naive-ui'
import { logout, username as currentUsername } from '../stores/useAuth'
import { useToast } from '../composables/useToast'

const { notify } = useToast()

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'] as const

const clock = ref(format(new Date()))
const weekday = ref(WEEKDAYS[new Date().getDay()])
let timer: ReturnType<typeof setInterval>

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function format(now: Date) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

onMounted(() => {
  timer = setInterval(() => {
    const now = new Date()
    clock.value = format(now)
    weekday.value = WEEKDAYS[now.getDay()]
  }, 1000)
})

onBeforeUnmount(() => {
  clearInterval(timer)
})

/** 退出登录：清凭证回登录页（App watch loggedIn 自动停轮询） */
function onLogout() {
  logout()
  notify('已退出登录')
}
</script>

<template>
  <header class="header">
    <div class="logo">◉</div>
    <div class="title">智慧安防监控平台</div>
    <div class="header-right">
      <div class="time-box">
        <div class="clock">{{ clock }}</div>
        <div class="weekday">{{ weekday }}</div>
      </div>
      <div class="user-box">
        <div class="user-info">
          <span class="user-name">{{ currentUsername }}</span>
          <NPopconfirm
            :show-icon="false"
            positive-text="退出"
            negative-text="取消"
            @positive-click="onLogout"
          >
            <template #trigger>
              <button class="logout-btn" title="退出登录">退出</button>
            </template>
            确定退出登录吗？
          </NPopconfirm>
        </div>
      </div>
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
  display: flex;
  align-items: center;
  gap: 18px;
}

.header-right .time-box {
  text-align: right;
  line-height: 1.35;
}

.user-box {
  display: flex;
  align-items: center;
  padding-left: 14px;
  border-left: 1px solid rgba(10, 137, 240, 0.35);
}

.user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  line-height: 1;
}

.user-name {
  font-size: 13px;
  color: #dff4ff;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.logout-btn {
  height: 20px;
  padding: 0 10px;
  font-size: 11px;
  color: #9fc0df;
  background: transparent;
  border: 1px solid rgba(10, 137, 240, 0.55);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.logout-btn:hover {
  color: #fff;
  border-color: #18d5ff;
  background: rgba(8, 170, 255, 0.2);
  box-shadow: 0 0 10px rgba(10, 200, 255, 0.25);
}

.clock {
  font-size: 16px;
  color: #dcecff;
}

.weekday {
  font-size: 13px;
  color: #9db8d5;
}
</style>
