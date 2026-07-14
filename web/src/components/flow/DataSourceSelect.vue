<template>
  <div class="data-source-select" ref="wrapperRef">
    <div class="data-source-select__display" @click="toggleDropdown">
      <span v-if="value" class="data-source-select__tag">{{ value }}</span>
      <span v-else class="text-gray-400 text-xs">自动生成或选择已有</span>
      <Button text severity="secondary" size="small" :icon="showDropdown ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" @click.stop="toggleDropdown" />
    </div>
    <Teleport to="body">
      <div
        v-if="showDropdown"
        class="data-source-select__dropdown"
        :style="dropdownStyle"
      >
        <!-- 入参 -->
        <div v-if="inputParams.length > 0" class="data-source-select__section">
          <div class="data-source-select__section-label">入参</div>
          <button
            v-for="node in inputParams"
            :key="node.name"
            class="data-source-select__option"
            :class="{ 'is-active': value === node.name }"
            @click="selectExisting(node.name)"
          >
            <span class="data-source-select__name">{{ node.label }}</span>
            <span class="data-source-select__desc">{{ node.name }}</span>
          </button>
        </div>
        <!-- 出参 -->
        <div v-if="outputParams.length > 0" class="data-source-select__section">
          <div class="data-source-select__section-label">出参</div>
          <button
            v-for="node in outputParams"
            :key="node.name"
            class="data-source-select__option"
            :class="{ 'is-active': value === node.name }"
            @click="selectExisting(node.name)"
          >
            <span class="data-source-select__name">{{ node.label }}</span>
            <span class="data-source-select__desc">{{ node.name }}</span>
          </button>
        </div>
        <!-- 变量节点 -->
        <div v-if="variableNodes.length > 0" class="data-source-select__section">
          <div class="data-source-select__section-label">变量</div>
          <button
            v-for="node in variableNodes"
            :key="node.name"
            class="data-source-select__option"
            :class="{ 'is-active': value === node.name }"
            @click="selectExisting(node.name)"
          >
            <span class="data-source-select__name">{{ node.label }}</span>
            <span class="data-source-select__desc">{{ node.name }}</span>
          </button>
        </div>
        <!-- 新建数据源 -->
        <div class="data-source-select__section">
          <div class="data-source-select__section-label">新建</div>
          <Button text severity="secondary" size="small" icon="pi pi-plus" label="自动生成 ID" class="w-full justify-start pl-5" @click="createNew" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import Button from 'primevue/button'

const props = defineProps<{
  value: string
  dataNodes: Array<{ name: string; label: string; nodeId: string }>
}>()

/** 按 nodeId 前缀分组 */
const inputParams = computed(() => props.dataNodes.filter((n) => n.nodeId === '__input'))
const outputParams = computed(() => props.dataNodes.filter((n) => n.nodeId === '__output'))
const variableNodes = computed(() => props.dataNodes.filter((n) => n.nodeId !== '__input' && n.nodeId !== '__output'))

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const showDropdown = ref(false)
const wrapperRef = ref<HTMLElement | null>(null)
const dropdownStyle = ref<Record<string, string>>({})

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
  if (showDropdown.value) {
    nextTick(updatePosition)
  }
}

function updatePosition() {
  if (!wrapperRef.value) return
  const rect = wrapperRef.value.getBoundingClientRect()
  dropdownStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    minWidth: '220px',
  }
}

/** 点击外部关闭 */
function onClickOutside(e: MouseEvent) {
  if (!showDropdown.value) return
  const target = e.target as HTMLElement
  if (wrapperRef.value?.contains(target)) return
  // 检查是否点击在下拉框内（Teleport 到 body 的元素）
  if (target.closest('.data-source-select__dropdown')) return
  showDropdown.value = false
}

onMounted(() => document.addEventListener('mousedown', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside))

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
</style>

<style>
/* 非 scoped：Teleport 到 body 的下拉框样式 */
.data-source-select__dropdown {
  margin-top: 0;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  max-height: 240px;
  overflow-y: auto;
  z-index: 10000;
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
  padding: 5px 10px;
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
  font-weight: 500;
}

.data-source-select__desc {
  color: #9ca3af;
  font-size: 11px;
  font-family: monospace;
}
</style>
