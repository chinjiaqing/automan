<template>
  <div
    class="h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-gray-100"
  >
    <div class="w-96 bg-white rounded-xl shadow-lg p-8">
      <!-- Logo -->
      <div class="text-center mb-8">
        <img src="/logo.png" alt="logo" class="w-16 h-16 mx-auto mb-3" />
        <h1 class="text-2xl font-bold text-gray-800">凹凸曼</h1>
        <p class="text-sm text-gray-400 mt-1">一个面向自动化的游戏脚本编排引擎</p>
      </div>

      <!-- 表单 -->
      <div class="flex flex-col gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">服务器地址</label>
          <InputText
            v-model="host"
            class="w-full"
            placeholder="127.0.0.1 或域名"
            @keyup.enter="handleConnect"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">端口</label>
          <InputNumber
            v-model="port"
            class="w-full"
            placeholder="3000"
            :min="1"
            :max="65535"
            :use-grouping="false"
            @keyup.enter="handleConnect"
          />
        </div>

        <!-- 错误提示 -->
        <p v-if="errorMsg" class="text-sm text-red-500 flex items-center gap-1">
          <i class="pi pi-exclamation-circle" />
          {{ errorMsg }}
        </p>

        <Button
          class="w-full mt-2"
          :icon="connecting ? 'pi pi-spinner pi-spin' : 'pi pi-sign-in'"
          :label="connecting ? '连接中...' : '连接'"
          :disabled="connecting"
          size="large"
          @click="handleConnect"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import { useWebSocket } from '../composables/useWebSocket.js'

const CACHE_KEY = 'automan_server'

const router = useRouter()
const { connect, state } = useWebSocket()

// 从缓存读取上次的服务器地址
const cached = (() => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) return JSON.parse(raw) as { host: string; port: number }
  } catch {
    /* ignore */
  }
  return null
})()

const host = ref(cached?.host ?? '127.0.0.1')
const port = ref(cached?.port ?? 3000)
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
    await connect(host.value.trim(), port.value)

    // 连接成功 → 缓存到 localStorage
    localStorage.setItem(CACHE_KEY, JSON.stringify({ host: host.value.trim(), port: port.value }))

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
} else {
  // 桌面版通过 URL query 注入连接参数（/login?port=3000&autoconnect=1）
  const query = new URLSearchParams(location.search)
  const qPort = Number(query.get('port'))
  if (qPort >= 1 && qPort <= 65535) {
    host.value = query.get('host') ?? '127.0.0.1'
    port.value = qPort
  }
  if (query.get('autoconnect') === '1') {
    void handleConnect()
  }
}
</script>
