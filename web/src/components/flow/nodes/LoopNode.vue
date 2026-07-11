<template>
  <div class="flow-node flow-node--loop" :class="{ 'is-selected': selected }">
    <Handle type="target" :position="Position.Top" />
    <div class="flow-node__header">
      <div class="flow-node__icon bg-cyan-600">
        <i class="pi pi-refresh text-white text-xs" />
      </div>
      <span class="flow-node__label">{{ label }}</span>
    </div>
    <div class="flow-node__config-preview" v-if="operator">
      <span class="text-xs text-gray-500 truncate">while {{ leftLabel }} {{ operator }} {{ rightLabel }}</span>
      <span v-if="maxIter" class="text-xs text-gray-400 ml-1">(max {{ maxIter }})</span>
    </div>
    <!-- body 出口（左侧） -->
    <Handle id="body" type="source" :position="Position.Bottom" :style="{ left: '30%' }" />
    <span class="flow-node__handle-label flow-node__handle-label--body">body</span>
    <!-- exit 出口（右侧） -->
    <Handle id="exit" type="source" :position="Position.Bottom" :style="{ left: '70%' }" />
    <span class="flow-node__handle-label flow-node__handle-label--exit">exit</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'

const props = defineProps<{
  data: {
    label: string
    config: Record<string, unknown>
    selected?: boolean
  }
}>()

const label = computed(() => props.data.label ?? '循环')
const selected = computed(() => props.data.selected)
const operator = computed(() => props.data.config?.operator as string)
const maxIter = computed(() => props.data.config?.maxIter as number)
const leftLabel = computed(() => {
  const v = props.data.config?.left
  return typeof v === 'string' && v ? v : '?'
})
const rightLabel = computed(() => {
  const v = props.data.config?.right
  return typeof v === 'string' && v ? v : '?'
})
</script>
