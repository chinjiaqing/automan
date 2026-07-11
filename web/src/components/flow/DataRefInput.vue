<template>
  <div class="data-ref-input">
    <input
      class="config-panel__input"
      type="text"
      :value="value"
      :placeholder="placeholder"
      @input="onInput($event)"
    />
    <button
      v-if="upstreamNodes.length > 0"
      class="data-ref-input__btn"
      title="引用上游输出"
      @click="showDropdown = !showDropdown"
    >
      <i class="pi pi-at text-xs" />
    </button>
    <div v-if="showDropdown" class="data-ref-input__dropdown">
      <div
        v-for="node in upstreamNodes"
        :key="node.id"
        class="data-ref-input__group"
      >
        <div class="data-ref-input__group-label">{{ node.label }} ({{ node.id }})</div>
        <button
          v-for="port in getNodeOutputs(node.type)"
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
import { getNodeTypeDef } from '../../flow/nodeTypes.js'
import { makeRef } from '../../flow/refResolver.js'

const props = defineProps<{
  value: string
  placeholder?: string
  upstreamNodes: Array<{ id: string; label: string; type: string }>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const showDropdown = ref(false)

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

function getNodeOutputs(type: string) {
  const def = getNodeTypeDef(type)
  return def?.outputs ?? []
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
</script>

<style scoped>
.data-ref-input {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
}

.data-ref-input__btn {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid #d1d5db;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
}

.data-ref-input__btn:hover {
  background: #f3f4f6;
  color: #3b82f6;
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
