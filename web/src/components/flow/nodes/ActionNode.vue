<template>
  <div class="flow-node flow-node--action" :class="{ 'is-selected': selected }">
    <Handle type="target" :position="Position.Top" />
    <div class="flow-node__header">
      <div class="flow-node__icon" :class="iconBg">
        <i :class="`pi ${icon} text-white text-xs`" />
      </div>
      <span class="flow-node__label">{{ label }}</span>
    </div>
    <div class="flow-node__outputs" v-if="outputs.length">
      <div v-for="out in outputs" :key="out.key" class="flow-node__output">
        <span class="text-xs text-gray-500">{{ out.label }}</span>
      </div>
    </div>
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { getNodeTypeDef } from '../../../flow/nodeTypes.js'

const props = defineProps<{
  data: {
    label: string
    type: string
    config: Record<string, unknown>
    selected?: boolean
  }
}>()

const nodeDef = computed(() => getNodeTypeDef(props.data.type))
const icon = computed(() => nodeDef.value?.icon ?? 'pi-circle')
const label = computed(() => props.data.label ?? '动作')
const selected = computed(() => props.data.selected)
const outputs = computed(() => nodeDef.value?.outputs ?? [])

const iconBg = computed(() => {
  const map: Record<string, string> = {
    findPic: 'bg-blue-500',
    ocrWords: 'bg-purple-500',
    ocrFindStr: 'bg-indigo-500',
    click: 'bg-pink-500',
    areaClick: 'bg-rose-500',
    delay: 'bg-gray-500',
    screenshot: 'bg-teal-500',
  }
  return map[props.data.type] ?? 'bg-blue-500'
})
</script>
