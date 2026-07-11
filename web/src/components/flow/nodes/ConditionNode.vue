<template>
  <div class="flow-node flow-node--condition" :class="{ 'is-selected': selected }">
    <Handle type="target" :position="Position.Top" />
    <div class="flow-node__header">
      <div class="flow-node__icon bg-orange-500">
        <i class="pi pi-question text-white text-xs" />
      </div>
      <span class="flow-node__label">{{ label }}</span>
    </div>
    <div class="flow-node__config-preview" v-if="operator">
      <span class="text-xs text-gray-500 truncate">{{ leftLabel }} {{ operator }} {{ rightLabel }}</span>
    </div>
    <!-- true 出口（左侧） -->
    <Handle id="true" type="source" :position="Position.Bottom" :style="{ left: '30%' }" />
    <span class="flow-node__handle-label flow-node__handle-label--true">true</span>
    <!-- false 出口（右侧） -->
    <Handle id="false" type="source" :position="Position.Bottom" :style="{ left: '70%' }" />
    <span class="flow-node__handle-label flow-node__handle-label--false">false</span>
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

const label = computed(() => props.data.label ?? '条件判断')
const selected = computed(() => props.data.selected)
const operator = computed(() => props.data.config?.operator as string)
const leftLabel = computed(() => {
  const v = props.data.config?.left
  return typeof v === 'string' && v ? v : '?'
})
const rightLabel = computed(() => {
  const v = props.data.config?.right
  return typeof v === 'string' && v ? v : '?'
})
</script>
