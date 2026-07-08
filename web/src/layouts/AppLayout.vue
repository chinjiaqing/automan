<template>
  <div class="h-screen flex flex-col bg-gray-50">
    <AppHeader />
    <main class="flex-1 overflow-hidden">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { useWebSocket } from '../composables/useWebSocket.js'
import AppHeader from '../components/AppHeader.vue'

const router = useRouter()
const { state } = useWebSocket()

// WS 断开 → 跳转登录页
watch(state, (val) => {
  if (val === 'disconnected') {
    router.push({ name: 'login' })
  }
})
</script>
