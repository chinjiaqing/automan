<template>
  <div class="log-panel flex flex-col h-full bg-gray-50">
    <!-- 固定顶部操作栏 -->
    <div class="log-panel__header flex items-center gap-3 px-4 bg-white border-b border-gray-200">
      <span class="text-sm text-gray-600">
        <i class="pi pi-check-circle text-green-500 mr-1" />
        已勾选 <strong class="text-gray-800">{{ checkedCount }}</strong> 个工作流
      </span>

      <span class="flex-1" />

      <Button
        v-if="!isRunning"
        text
        severity="success"
        size="small"
        icon="pi pi-play"
        label="开始"
        :disabled="checkedCount === 0"
        @click="$emit('start')"
      />
      <template v-else>
        <Button
          v-if="!isPaused"
          text
          severity="info"
          size="small"
          icon="pi pi-pause"
          label="暂停"
          @click="$emit('pause')"
        />
        <Button
          v-else
          text
          severity="success"
          size="small"
          icon="pi pi-play"
          label="恢复"
          @click="$emit('resume')"
        />
        <Button
          text
          severity="warn"
          size="small"
          icon="pi pi-stop"
          label="停止"
          @click="$emit('stop')"
        />
      </template>

      <span class="text-xs text-gray-500 font-mono flex items-center">
        <i class="pi pi-clock mr-1" />{{ formatElapsed(elapsed) }}
      </span>

      <Button
        text
        rounded
        severity="secondary"
        size="small"
        icon="pi pi-trash"
        title="清空日志"
        @click="$emit('clear')"
      />
    </div>

    <!-- 插槽：看板等外部内容 -->
    <slot />

    <!-- 滚动日志区 -->
    <div ref="logContainer" class="log-panel__body flex-1 overflow-y-auto px-4 py-2 font-mono text-xs">
      <div v-if="logs.length === 0" class="text-gray-400 text-center py-8">
        暂无日志
      </div>
      <div
        v-for="(log, i) in logs"
        :key="i"
        class="log-line flex items-start gap-2 py-0.5"
      >
        <span class="text-gray-400 flex-shrink-0">{{ log.time }}</span>
        <span
          class="log-tag flex-shrink-0"
          :class="`log-tag--${log.level}`"
        >{{ log.level }}</span>
        <span class="break-all">{{ log.message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import Button from 'primevue/button'
import type { LogEntry } from '../composables/useWorkflowRun.js'

const props = defineProps<{
  logs: readonly LogEntry[]
  checkedCount: number
  isRunning: boolean
  isPaused: boolean
  elapsed: number
}>()

defineEmits<{
  start: []
  stop: []
  pause: []
  resume: []
  clear: []
}>()

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0')
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0')
  const s = String(totalSec % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

const logContainer = ref<HTMLElement | null>(null)

// 新日志到来时自动滚到底部
watch(
  () => props.logs.length,
  async () => {
    await nextTick()
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  },
)
</script>

<style scoped>
.log-panel__header {
  height: 48px;
  flex-shrink: 0;
}

.log-line {
  line-height: 1.6;
}

.log-tag {
  display: inline-block;
  min-width: 36px;
  text-align: center;
  border-radius: 2px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.log-tag--info {
  color: #2563eb;
  background: #dbeafe;
}

.log-tag--error {
  color: #dc2626;
  background: #fee2e2;
}

.log-tag--warn {
  color: #d97706;
  background: #fef3c7;
}

.log-tag--debug {
  color: #6b7280;
  background: #f3f4f6;
}
</style>
