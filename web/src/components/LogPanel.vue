<template>
  <div class="log-panel flex flex-col flex-1 min-h-0 bg-gray-50">
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
import type { LogEntry } from '../composables/useWorkflowRun.js'

const props = defineProps<{
  logs: readonly LogEntry[]
}>()

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
</style>
