<template>
  <div class="flow-node flow-node--condition" :class="{ 'is-selected': selected }">
    <Handle type="target" :position="Position.Top" />
    <div class="flow-node__header">
      <div class="flow-node__icon" :class="iconBg">
        <i :class="iconClass" class="text-white text-xs" />
      </div>
      <span class="flow-node__label">{{ label }}</span>
    </div>
    <!-- 应用状态节点：显示包名 -->
    <div class="flow-node__config-preview" v-if="nodeType === 'appRunning'">
      <span class="text-xs text-gray-500 truncate">{{ packageName || '未设置包名' }}</span>
    </div>
    <!-- 普通条件节点：显示运算表达式 -->
    <div class="flow-node__config-preview" v-else-if="operator">
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
    type?: string
    config: Record<string, unknown>
    selected?: boolean
  }
}>()

const nodeType = computed(() => props.data.type ?? 'condition')
const label = computed(() => props.data.label ?? '条件判断')
const selected = computed(() => props.data.selected)
const operator = computed(() => props.data.config?.operator as string)
const packageName = computed(() => props.data.config?.packageName as string)
const leftLabel = computed(() => {
  const v = props.data.config?.left
  return typeof v === 'string' && v ? v : '?'
})
const rightLabel = computed(() => {
  const v = props.data.config?.right
  return typeof v === 'string' && v ? v : '?'
})
const iconBg = computed(() => nodeType.value === 'appRunning' ? 'bg-cyan-500' : 'bg-orange-500')
const iconClass = computed(() => nodeType.value === 'appRunning' ? 'pi pi-info-circle' : 'pi pi-question')
</script>
