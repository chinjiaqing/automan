<template>
  <header class="h-14 flex items-center bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
    <!-- Left: Logo (w-60 与 sidebar 对齐) -->
    <div class="w-60 flex items-center px-4 flex-shrink-0">
      <img src="/logo.png" alt="logo" class="w-7 h-7 mr-2" />
      <h1 class="text-lg font-semibold text-gray-800">凹凸曼</h1>
    </div>

    <!-- Right: Navigation + Status -->
    <div class="flex-1 flex items-center px-6">
      <!-- Page Navigation -->
      <nav class="flex items-center gap-1">
        <router-link
          v-for="item in navItems"
          :key="item.name"
          :to="{ name: item.name }"
          class="px-3 py-1.5 text-sm rounded-md transition-colors inline-flex items-center gap-0.5"
          :class="isActive(item.name)
            ? 'bg-brand-50 text-brand-700 font-medium'
            : 'text-gray-600 hover:bg-gray-100'"
        >
          <i :class="`pi ${item.icon}`" />
          {{ item.label }}
          <span v-if="item.beta" class="text-[9px] font-semibold bg-amber-100 text-amber-600 px-1 rounded leading-tight">BETA</span>
        </router-link>
      </nav>

      <!-- Status -->
      <div class="ml-auto flex items-center gap-3">
        <span class="inline-flex items-center gap-1.5 text-xs text-green-600">
          <span class="w-2 h-2 rounded-full bg-green-500" />
          已连接
        </span>
        <Button text size="small" severity="secondary" icon="pi pi-sign-out" label="断开" @click="handleDisconnect" />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useWebSocket } from '../composables/useWebSocket.js'

const route = useRoute()
const router = useRouter()
const { disconnect } = useWebSocket()

const navItems = [
  { name: 'home', label: '首页', icon: 'pi-home' },
  { name: 'track', label: '开发板', icon: 'pi-image' },
  { name: 'flow', label: '编排', icon: 'pi-sitemap' },
  { name: 'fragments', label: '片段', icon: 'pi-code', beta: true },
  { name: 'ai-flow', label: 'AI编排', icon: 'pi-bolt' },
]

function isActive(name: string) {
  return route.name === name
}

function handleDisconnect() {
  disconnect()
  router.push({ name: 'login' })
}
</script>
