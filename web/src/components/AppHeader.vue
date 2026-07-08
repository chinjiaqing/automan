<template>
  <header class="h-14 flex items-center bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
    <!-- Left: Logo (w-60 与 sidebar 对齐) -->
    <div class="w-60 flex items-center px-6 flex-shrink-0">
      <i class="pi pi-bolt text-xl text-brand-600 mr-2" />
      <h1 class="text-lg font-semibold text-gray-800">Automan</h1>
    </div>

    <!-- Right: Navigation + Status -->
    <div class="flex-1 flex items-center px-6">
      <!-- Page Navigation -->
      <nav class="flex items-center gap-1">
        <router-link
          v-for="item in navItems"
          :key="item.name"
          :to="{ name: item.name }"
          class="px-3 py-1.5 text-sm rounded-md transition-colors"
          :class="isActive(item.name)
            ? 'bg-brand-50 text-brand-700 font-medium'
            : 'text-gray-600 hover:bg-gray-100'"
        >
          <i :class="`pi ${item.icon} mr-1`" />
          {{ item.label }}
        </router-link>
      </nav>

      <!-- Status -->
      <div class="ml-auto flex items-center gap-3">
        <span class="inline-flex items-center gap-1.5 text-xs text-green-600">
          <span class="w-2 h-2 rounded-full bg-green-500" />
          已连接
        </span>
        <button class="btn-ghost text-xs" @click="handleDisconnect">
          <i class="pi pi-sign-out mr-1" />
          断开
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useWebSocket } from '../composables/useWebSocket.js'

const route = useRoute()
const router = useRouter()
const { disconnect } = useWebSocket()

const navItems = [
  { name: 'home', label: '首页', icon: 'pi-home' },
  { name: 'canvas', label: '开发板', icon: 'pi-image' },
]

function isActive(name: string) {
  return route.name === name
}

function handleDisconnect() {
  disconnect()
  router.push({ name: 'login' })
}
</script>
