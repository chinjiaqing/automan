<template>
  <div class="flow-node flow-node--data" :class="{ 'is-selected': selected }">
    <Handle type="target" :position="Position.Top" />
    <div class="flow-node__header">
      <div class="flow-node__icon bg-emerald-500">
        <i class="pi pi-database text-white text-xs" />
      </div>
      <span class="flow-node__label">{{ label }}</span>
    </div>
    <!-- 显示作用域 + 变量名 -->
    <div v-if="varName" class="flow-node__var-name flex items-center gap-1">
      <span class="text-xs text-gray-500 bg-gray-100 px-1 rounded">{{ scopeLabel }}</span>
      <span class="text-xs font-mono text-blue-600 bg-blue-50 px-1 rounded">{{ varName }}</span>
    </div>
    <!-- 显示操作 -->
    <div v-if="actionLabel" class="flow-node__action">
      <span class="text-xs text-gray-500">{{ actionLabel }}</span>
    </div>
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'

const props = defineProps<{
  data: {
    label: string
    type: string
    config: Record<string, unknown>
    selected?: boolean
  }
}>()

const label = computed(() => props.data.label ?? '数据')
const selected = computed(() => props.data.selected)
const varName = computed(() => {
  const name = props.data.config?.name
  return typeof name === 'string' ? name : ''
})

const scopeLabel = computed(() => {
  const scope = props.data.config?.scope as string
  const map: Record<string, string> = { session: '全局', local: '本轮', input: '外部输入' }
  return map[scope] ?? scope ?? '本轮'
})

const actionLabel = computed(() => {
  const action = props.data.config?.action as string
  if (!action) return ''
  const map: Record<string, string> = {
    createOrSet: '创建或赋值',
    set: '赋值 = ',
    add: '+= ',
    sub: '-= ',
    mul: '×= ',
    div: '÷= ',
  }
  const prefix = map[action] ?? action
  if (action === 'createOrSet') {
    const val = props.data.config?.value ?? '?'
    return `${prefix} ${val}`
  }
  if (action === 'set') {
    const val = props.data.config?.value ?? '?'
    return `${prefix}${val}`
  }
  const val = props.data.config?.operand ?? '?'
  return `${prefix}${val}`
})
</script>
