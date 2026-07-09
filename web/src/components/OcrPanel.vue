<template>
  <div class="flex flex-col gap-3">
    <button
      class="btn-primary w-full flex items-center justify-center gap-2"
      :disabled="!screenshot || !selection"
      @click="handleOcr"
    >
      <i class="pi pi-search" />
      {{ selection ? '识别选区' : '请先框选区域' }}
    </button>
    <div v-if="ocrResult" class="text-sm bg-gray-50 p-3 rounded max-h-40 overflow-y-auto whitespace-pre-wrap">
      {{ ocrResult }}
    </div>
    <div v-else class="text-xs text-gray-400 text-center py-2">
      暂无识别结果
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { ScreenshotResponse } from '@automan/shared/types.js'
import type { Selection } from '../composables/useSelection.js'

defineProps<{
  screenshot: ScreenshotResponse | null
  selection: Selection | null
}>()

const ocrResult = ref('')

async function handleOcr() {
  alert('OCR 功能待实现')
}
</script>
