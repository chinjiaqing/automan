<template>
  <div class="h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-gray-100">
    <div class="w-96 bg-white rounded-xl shadow-lg p-8">
      <!-- Logo -->
      <div class="text-center mb-8">
        <i class="pi pi-bolt text-4xl text-brand-600 mb-3 block" />
        <h1 class="text-2xl font-bold text-gray-800">Automan</h1>
        <p class="text-sm text-gray-400 mt-1">自动化任务执行引擎</p>
      </div>

      <!-- 表单 -->
      <div class="flex flex-col gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">服务器地址</label>
          <input
            v-model="host"
            class="input-base"
            placeholder="127.0.0.1 或域名"
            @keyup.enter="handleConnect"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">端口</label>
          <input
            v-model.number="port"
            type="number"
            class="input-base"
            placeholder="3000"
            min="1"
            max="65535"
            @keyup.enter="handleConnect"
          />
        </div>

        <!-- 错误提示 -->
        <p v-if="errorMsg" class="text-sm text-red-500 flex items-center gap-1">
          <i class="pi pi-exclamation-circle" />
          {{ errorMsg }}
        </p>

        <button
          class="btn-primary w-full py-2.5 mt-2 flex items-center justify-center gap-2 text-base"
          :disabled="connecting"
          @click="handleConnect"
        >
          <i v-if="connecting" class="pi pi-spinner pi-spin" />
          <i v-else class="pi pi-sign-in" />
          {{ connecting ? '连接中...' : '连接' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWebSocket } from '../composables/useWebSocket.js'
import { setApiBase } from '../api/index.js'

const router = useRouter()
const { connect, state } = useWebSocket()

const host = ref('127.0.0.1')
const port = ref(3000)
const connecting = ref(false)
const errorMsg = ref('')

async function handleConnect() {
  errorMsg.value = ''
  if (!host.value.trim()) {
    errorMsg.value = '请输入服务器地址'
    return
  }
  if (!port.value || port.value < 1 || port.value > 65535) {
    errorMsg.value = '请输入有效端口号（1-65535）'
    return
  }

  connecting.value = true
  try {
    // 设置 HTTP API base URL
    const protocol = location.protocol
    setApiBase(`${protocol}//${host.value}:${port.value}`)

    await connect(host.value.trim(), port.value)

    // 连接成功 → 跳转首页
    router.push({ name: 'home' })
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '连接失败，请检查服务器地址和端口'
  } finally {
    connecting.value = false
  }
}

// 如果已经连接，直接跳转
if (state.value === 'connected') {
  router.replace({ name: 'home' })
}
</script>
