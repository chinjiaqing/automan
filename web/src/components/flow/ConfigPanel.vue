<template>
  <aside class="config-panel" v-if="nodeDef">
    <div class="config-panel__header">
      <i :class="`pi ${nodeDef.icon} text-sm text-brand-600`" />
      <span class="text-sm font-semibold text-gray-700">{{ nodeDef.label }}</span>
      <span class="text-xs text-gray-400 ml-auto">{{ nodeId }}</span>
    </div>

    <div class="config-panel__body">
      <!-- 节点名称 -->
      <div class="config-panel__field">
        <label class="config-panel__label">节点名称</label>
        <input
          class="config-panel__input"
          :value="nodeLabel"
          @input="emit('update:label', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <!-- 动态配置项 -->
      <template v-for="field in nodeDef.configSchema" :key="field.key">
        <!-- showWhen 条件判断 -->
        <div v-if="shouldShow(field)" class="config-panel__field">
          <label class="config-panel__label">{{ field.label }}</label>

          <!-- text -->
          <input
            v-if="field.type === 'text'"
            class="config-panel__input"
            type="text"
            :value="getConfig(field.key)"
            :placeholder="field.placeholder"
            @input="setConfig(field.key, ($event.target as HTMLInputElement).value)"
          />

          <!-- number -->
          <input
            v-else-if="field.type === 'number'"
            class="config-panel__input"
            type="number"
            :value="getConfig(field.key)"
            @input="setConfig(field.key, Number(($event.target as HTMLInputElement).value))"
          />

          <!-- select -->
          <select
            v-else-if="field.type === 'select'"
            class="config-panel__input"
            :value="getConfig(field.key)"
            @change="setConfig(field.key, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="opt in field.options" :key="opt" :value="opt">{{ opt }}</option>
          </select>

          <!-- slider -->
          <div v-else-if="field.type === 'slider'" class="flex items-center gap-2">
            <input
              class="flex-1"
              type="range"
              :min="field.min ?? 0"
              :max="field.max ?? 100"
              :value="getConfig(field.key) ?? field.default ?? 50"
              @input="setConfig(field.key, Number(($event.target as HTMLInputElement).value))"
            />
            <span class="text-xs text-gray-500 w-8 text-right">
              {{ getConfig(field.key) ?? field.default ?? 50 }}
            </span>
          </div>

          <!-- data-ref / data-input -->
          <DataRefInput
            v-else-if="field.type === 'data-ref' || field.type === 'data-input'"
            :value="getConfig(field.key) as string"
            :placeholder="field.placeholder"
            :upstream-nodes="upstreamNodes"
            @update:modelValue="setConfig(field.key, $event)"
          />

          <!-- data-source -->
          <DataSourceSelect
            v-else-if="field.type === 'data-source'"
            :value="getConfig(field.key) as string"
            :data-nodes="dataNodes"
            @update:modelValue="setConfig(field.key, $event)"
          />

          <!-- coord-input -->
          <input
            v-else-if="field.type === 'coord-input'"
            class="config-panel__input"
            type="text"
            placeholder="x,y,w,h"
            :value="formatCoord(getConfig(field.key))"
            @input="setConfig(field.key, parseCoord(($event.target as HTMLInputElement).value))"
          />

          <!-- image-upload -->
          <div v-else-if="field.type === 'image-upload'" class="config-panel__field">
            <button
              class="btn-ghost text-xs w-full border border-dashed border-gray-300 py-2 rounded"
              @click="handleImageUpload(field.key)"
            >
              {{ getConfig(field.key) ? '已上传（点击替换）' : '点击上传模板图片' }}
            </button>
            <input
              :ref="(el) => setFileRef(field.key, el as HTMLInputElement)"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onFileChange($event, field.key)"
            />
          </div>
        </div>
      </template>

      <!-- 输出端口信息 -->
      <div v-if="nodeDef.outputs.length" class="config-panel__outputs">
        <div class="config-panel__label mb-1">输出端口</div>
        <div
          v-for="out in nodeDef.outputs"
          :key="out.key"
          class="text-xs text-gray-500 flex items-center gap-1"
        >
          <span class="w-2 h-2 rounded-full bg-green-400" />
          {{ out.label }}
          <span class="text-gray-400">({{ out.dataType }})</span>
        </div>
      </div>
    </div>
  </aside>

  <!-- 无选中节点时显示占位 -->
  <aside v-else class="config-panel config-panel--empty">
    <div class="flex flex-col items-center justify-center h-full text-gray-400">
      <i class="pi pi-arrow-left text-2xl mb-2" />
      <span class="text-sm">选择节点以配置</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { getNodeTypeDef } from '../../flow/nodeTypes.js'
import type { NodeTypeDefinition, FieldSchema } from '@automan/shared/types.js'
import DataRefInput from './DataRefInput.vue'
import DataSourceSelect from './DataSourceSelect.vue'

const props = defineProps<{
  nodeType: string
  nodeId: string
  nodeLabel: string
  config: Record<string, unknown>
  upstreamNodes: Array<{ id: string; label: string; type: string }>
  dataNodes: Array<{ name: string; label: string; nodeId: string }>
}>()

const emit = defineEmits<{
  'update:config': [key: string, value: unknown]
  'update:label': [value: string]
}>()

const nodeDef = computed(() => getNodeTypeDef(props.nodeType))

const fileRefs = ref<Record<string, HTMLInputElement | null>>({})

function setFileRef(key: string, el: HTMLInputElement | null) {
  fileRefs.value[key] = el
}

function getConfig(key: string): unknown {
  return props.config?.[key]
}

function setConfig(key: string, value: unknown) {
  emit('update:config', key, value)
}

function shouldShow(field: FieldSchema): boolean {
  if (!field.showWhen) return true
  return Object.entries(field.showWhen).every(([k, v]) => {
    const current = String(props.config?.[k])
    // 支持逗号分隔多值匹配：'add,sub,mul,div'
    const allowed = String(v).split(',').map((s) => s.trim())
    return allowed.includes(current)
  })
}

function formatCoord(val: unknown): string {
  if (Array.isArray(val) && val.length === 4) return val.join(',')
  return '0,0,0,0'
}

function parseCoord(str: string): number[] {
  const parts = str.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n))
  return parts.length === 4 ? parts : [0, 0, 0, 0]
}

function handleImageUpload(key: string) {
  fileRefs.value[key]?.click()
}

function onFileChange(event: Event, key: string) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    setConfig(key, reader.result as string)
  }
  reader.readAsDataURL(file)
}
</script>

<style scoped>
.config-panel {
  display: flex;
  flex-direction: column;
  width: 280px;
  background: white;
  border-left: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.config-panel--empty {
  width: 280px;
}

.config-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #f3f4f6;
}

.config-panel__body {
  padding: 12px 16px;
  overflow-y: auto;
  flex: 1;
}

.config-panel__field {
  margin-bottom: 12px;
}

.config-panel__label {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: #6b7280;
  margin-bottom: 4px;
}

.config-panel__input {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
}

.config-panel__input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.config-panel__outputs {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #f3f4f6;
}
</style>
