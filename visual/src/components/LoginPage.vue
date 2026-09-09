<script setup lang="ts">
import { ref } from 'vue'
import { NButton, NForm, NFormItem, NInput } from 'naive-ui'
import { login } from '../stores/useAuth'
import cameraIcon from '../assets/icons/camera.svg'

const emit = defineEmits<{ (event: 'success', username: string): void }>()

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

async function onSubmit() {
  if (!username.value.trim() || !password.value) {
    error.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  error.value = null
  try {
    const name = await login(username.value, password.value)
    emit('success', name)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-head">
        <img :src="cameraIcon" class="login-logo" alt="logo" />
        <div>
          <h1>智慧安防监控平台</h1>
          <p>SECURITY SURVEILLANCE CENTER</p>
        </div>
      </div>

      <NForm @keyup.enter="onSubmit">
        <NFormItem label="用户名" label-placement="left" label-width="64">
          <NInput v-model:value="username" placeholder="请输入用户名" :disabled="loading" autofocus />
        </NFormItem>
        <NFormItem label="密码" label-placement="left" label-width="64">
          <NInput
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="请输入密码"
            :disabled="loading"
          />
        </NFormItem>
      </NForm>

      <div v-if="error" class="login-error">{{ error }}</div>

      <NButton
        type="primary"
        block
        :loading="loading"
        :disabled="loading"
        style="margin-top: 6px"
        @click="onSubmit"
      >登　录</NButton>

      <p class="login-tip">使用 WVP 平台账号登录</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 50% 0%, #06366c44, transparent 40%),
    linear-gradient(135deg, #020a18, #031631 45%, #020b1a);
}

.login-page::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(rgba(18, 103, 162, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(18, 103, 162, 0.05) 1px, transparent 1px);
  background-size: 24px 24px;
  mask-image: linear-gradient(to bottom, black, transparent 85%);
}

.login-card {
  position: relative;
  width: 380px;
  padding: 34px 30px 26px;
  background: linear-gradient(180deg, rgba(4, 39, 77, 0.95), rgba(2, 27, 53, 0.96));
  border: 1px solid rgba(10, 137, 240, 0.72);
  border-radius: 8px;
  box-shadow: inset 0 0 25px rgba(0, 112, 224, 0.05), 0 0 40px rgba(0, 132, 255, 0.15);
}

.login-card::before {
  content: '';
  position: absolute;
  left: 0;
  right: 30%;
  top: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, #00aaff, #00d9ff, transparent);
  box-shadow: 0 0 14px #00bfff;
}

.login-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 26px;
}

.login-logo {
  width: 44px;
  height: 44px;
  object-fit: contain;
  filter: invert(1) hue-rotate(185deg) saturate(1.4) brightness(1.1);
}

.login-head h1 {
  margin: 0;
  font-size: 20px;
  letter-spacing: 1px;
  color: #e7f4ff;
}

.login-head p {
  margin: 3px 0 0;
  font-size: 10px;
  color: #08aaff;
  letter-spacing: 2px;
}

.login-error {
  margin: 4px 0 0;
  padding: 7px 10px;
  font-size: 12px;
  color: #ff8a94;
  background: #210d12dd;
  border: 1px solid #7c2d38;
  border-radius: 4px;
}

.login-tip {
  margin: 16px 0 0;
  text-align: center;
  font-size: 11px;
  color: #7f9cb5;
}
</style>
