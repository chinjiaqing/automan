<template>
  <div class="data-source-select">
    <div class="data-source-select__display">
      <span v-if="value" class="data-source-select__tag">{{ value }}</span>
      <span v-else class="text-gray-400 text-xs">自动生成或选择已有</span>
      <Button text severity="secondary" size="small" :icon="showDropdown ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" @click="showDropdown = !showDropdown" />
    </div>
    <div v-if="showDropdown" class="data-source-select__dropdown">
      <!-- 已有数据源列表 -->
      <div v-if="dataNodes.length > 0" class="data-source-select__section">
        <div class="data-source-select__section-label">已有数据源</div>
        <button
          v-for="node in dataNodes"
          :key="node.name"
          class="data-source-select__option"
          :class="{ 'is-active': value === node.name }"
          @click="selectExisting(node.name)"
        >
          <span class="data-source-select__name">{{ node.name }}</span>
          <span class="data-source-select__desc">{{ node.label }}</span>
        </button>
      </div>
      <!-- 新建数据源 -->
      <div class="data-source-select__section">
        <div class="data-source-select__section-label">新建数据源</div>
        <Button text severity="secondary" size="small" icon="pi pi-plus" label="自动生成 ID" class="w-full justify-start pl-5" @click="createNew" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'

const props = defineProps<{
  value: string
  dataNodes: Array<{ name: string; label: string; nodeId: string }>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const showDropdown = ref(false)

function selectExisting(name: string) {
  emit('update:modelValue', name)
  showDropdown.value = false
}

function createNew() {
  const id = generateDataId()
  emit('update:modelValue', id)
  showDropdown.value = false
}

function generateDataId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let suffix = ''
  for (let i = 0; i < 5; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)]
  }
  return `data_${suffix}`
}
</script>

<style scoped>
.data-source-select {
  position: relative;
}

.data-source-select__display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
  background: white;
  cursor: pointer;
}

.data-source-select__tag {
  background: #eff6ff;
  color: #2563eb;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 12px;
  font-family: monospace;
}

.data-source-select__dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
}

.data-source-select__section {
  padding: 4px 0;
}

.data-source-select__section + .data-source-select__section {
  border-top: 1px solid #f3f4f6;
}

.data-source-select__section-label {
  font-size: 10px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  padding: 2px 10px;
}

.data-source-select__option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 10px;
  font-size: 12px;
  text-align: left;
  color: #374151;
  background: none;
  border: none;
  cursor: pointer;
}

.data-source-select__option:hover {
  background: #eff6ff;
}

.data-source-select__option.is-active {
  background: #dbeafe;
  color: #2563eb;
}

.data-source-select__name {
  font-family: monospace;
  font-weight: 500;
}

.data-source-select__desc {
  color: #9ca3af;
  font-size: 11px;
}
</style>
