<template>
  <div class="data-ref-input">
    <InputText
      class="w-full"
      size="small"
      :value="value"
      :placeholder="placeholder"
      @input="onInput($event)"
    />
    <Button
      v-if="upstreamNodes.length > 0 || variableNodes.length > 0"
      text
      severity="secondary"
      size="small"
      icon="pi pi-at"
      title="Insert reference"
      @click="showDropdown = !showDropdown"
    />
    <div v-if="showDropdown" class="data-ref-input__dropdown">
      <div
        v-if="variableNodes.length > 0"
        class="data-ref-input__group"
      >
        <div class="data-ref-input__group-label">变量</div>
        <button
          v-for="node in variableNodes"
          :key="node.name"
          class="data-ref-input__option"
          @click="insertVarRef(node.name)"
        >
          {{ node.label }}
          <span class="text-gray-400">({{ node.name }})</span>
        </button>
      </div>
      <div
        v-for="node in upstreamNodes"
        :key="node.id"
        class="data-ref-input__group"
      >
        <div class="data-ref-input__group-label">{{ node.label }} ({{ node.id }})</div>
        <button
          v-for="port in getNodeOutputs(node)"
          :key="port.key"
          class="data-ref-input__option"
          @click="insertRef(node.id, port.key)"
        >
          {{ port.label }}
          <span class="text-gray-400">({{ port.dataType }})</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { getNodeTypeDef } from '../../flow/nodeTypes.js'
import { makeRef } from '../../flow/refResolver.js'
import type { OutputPort } from '@automan/shared/types.js'

type ReferenceNode = {
  id: string
  label: string
  type: string
  outputs?: OutputPort[]
}

const props = withDefaults(defineProps<{
  value: string
  placeholder?: string
  upstreamNodes: ReferenceNode[]
  variableNodes?: Array<{ name: string; label: string; nodeId: string; scope?: string }>
}>(), {
  variableNodes: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const showDropdown = ref(false)

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

function getNodeOutputs(node: ReferenceNode) {
  return node.outputs ?? getNodeTypeDef(node.type)?.outputs ?? []
}

function insertRef(nodeId: string, outputKey: string) {
  const refStr = makeRef(nodeId, outputKey)
  // 如果当前值已经是纯引用，替换它；否则追加
  const newVal = /^\{\{[^}]+\}\}$/.test(props.value) || !props.value
    ? refStr
    : `${props.value}${refStr}`
  emit('update:modelValue', newVal)
  showDropdown.value = false
}

function insertVarRef(name: string) {
  const refStr = `{{var:${name}}}`
  const newVal = /^\{\{[^}]+\}\}$/.test(props.value) || !props.value
    ? refStr
    : `${props.value}${refStr}`
  emit('update:modelValue', newVal)
  showDropdown.value = false
}
</script>

<style scoped>
.data-ref-input {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
}

.data-ref-input__dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  min-width: 200px;
  max-height: 240px;
  overflow-y: auto;
  z-index: 100;
}

.data-ref-input__group-label {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  padding: 4px 10px;
  background: #f9fafb;
}

.data-ref-input__option {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 4px 10px 4px 20px;
  font-size: 12px;
  text-align: left;
  color: #374151;
  background: none;
  border: none;
  cursor: pointer;
}

.data-ref-input__option:hover {
  background: #eff6ff;
  color: #2563eb;
}
</style>
