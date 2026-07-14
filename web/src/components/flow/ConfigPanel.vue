<template>
  <aside class="config-panel" v-if="nodeDef">
    <div class="config-panel__header">
      <div class="flex items-center gap-2">
        <i :class="`pi ${nodeDef.icon} text-sm text-brand-600`" />
        <span class="text-sm font-semibold text-gray-700">{{ nodeDef.label }}</span>
      </div>
      <span class="text-xs text-gray-400">{{ nodeId }}</span>
    </div>

    <div class="config-panel__body">
      <!-- 节点描述 -->
      <div v-if="nodeDef.description" class="config-panel__desc">
        {{ nodeDef.description }}
      </div>

      <!-- 节点名称 -->
      <div class="config-panel__field">
        <label class="config-panel__label">节点名称</label>
        <InputText
          class="w-full"
          size="small"
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
          <InputText
            v-if="field.type === 'text'"
            class="w-full"
            size="small"
            :value="getConfig(field.key)"
            :placeholder="field.placeholder"
            @input="setConfig(field.key, ($event.target as HTMLInputElement).value)"
          />

          <!-- number -->
          <InputNumber
            v-else-if="field.type === 'number'"
            class="w-full"
            size="small"
            :use-grouping="false"
            :model-value="getConfig(field.key) as number"
            @update:model-value="setConfig(field.key, $event)"
          />

          <!-- select -->
          <Select
            v-else-if="field.type === 'select'"
            class="w-full"
            size="small"
            :options="getSelectOptions(field)"
            option-label="label"
            option-value="value"
            :model-value="getConfig(field.key)"
            @update:modelValue="onSelectChange(field.key, $event)"
          />

          <!-- slider -->
          <div v-else-if="field.type === 'slider'" class="flex items-center gap-2">
            <Slider
              class="flex-1"
              :min="field.min ?? 0"
              :max="field.max ?? 100"
              :model-value="(getConfig(field.key) ?? field.default ?? 50) as number"
              @update:model-value="setConfig(field.key, $event as number)"
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
            @update:modelValue="onDataSourceSelect(field.key, $event)"
          />

          <!-- coord-input (纯坐标，无引用) -->
          <InputText
            v-else-if="field.type === 'coord-input'"
            class="w-full"
            size="small"
            placeholder="x,y,w,h"
            :value="formatCoord(getConfig(field.key))"
            @input="setConfig(field.key, parseCoord(($event.target as HTMLInputElement).value))"
          />

          <!-- coord-ref (坐标 + 引用，支持 {{ref}}) -->
          <DataRefInput
            v-else-if="field.type === 'coord-ref'"
            :value="formatCoordStr(getConfig(field.key))"
            :placeholder="field.placeholder ?? 'x1,y1,x2,y2'"
            :upstream-nodes="upstreamNodes"
            @update:modelValue="setConfig(field.key, $event)"
          />

          <!-- image-upload -->
          <div v-else-if="field.type === 'image-upload'" class="config-panel__field">
            <!-- 已上传图片预览 -->
            <div v-if="getConfig(field.key)" class="mb-1.5 relative inline-block overflow-visible">
              <img
                :src="getConfig(field.key) as string"
                class="block rounded border border-gray-200"
                style="max-width: 100%; max-height: 80px;"
              />
              <button
                class="img-remove-btn"
                title="移除图片"
                @click.stop="setConfig(field.key, '')"
              >
                <i class="pi pi-times" style="font-size: 10px;" />
              </button>
            </div>
            <Button
              outlined
              severity="secondary"
              size="small"
              class="w-full"
              :label="getConfig(field.key) ? '点击替换' : '点击上传模板图片'"
              :icon="getConfig(field.key) ? 'pi pi-pencil' : 'pi pi-upload'"
              @click="handleImageUpload(field.key)"
            />
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
      <div v-if="effectiveOutputs.length" class="config-panel__outputs">
        <div class="config-panel__label mb-1">输出端口</div>
        <div
          v-for="out in effectiveOutputs"
          :key="out.key"
          class="text-xs text-gray-500 flex items-center gap-1"
        >
          <span class="w-2 h-2 rounded-full bg-green-400" />
          {{ out.label }}
          <span class="text-gray-400">({{ out.dataType }})</span>
        </div>
      </div>

      <!-- call 节点：片段输入参数表单 -->
      <template v-if="nodeType === 'call' && selectedFragment">
        <div class="config-panel__outputs">
          <div class="config-panel__label mb-1">输入参数</div>
          <div v-for="param in selectedFragment.inputs" :key="param.name" class="config-panel__field">
            <label class="config-panel__label">{{ param.label || param.name }}</label>
            <DataRefInput
              :value="getConfig(`arg_${param.name}`) as string"
              :placeholder="`默认: ${param.defaultValue ?? ''}`"
              :upstream-nodes="upstreamNodes"
              @update:modelValue="setConfig(`arg_${param.name}`, $event)"
            />
          </div>
          <div v-if="selectedFragment.inputs.length === 0" class="text-xs text-gray-400 py-1">无输入参数</div>
        </div>
        <div v-if="selectedFragment.outputs.length" class="config-panel__outputs">
          <div class="config-panel__label mb-1">返回输出</div>
          <div v-for="param in selectedFragment.outputs" :key="param.name"
            class="text-xs text-gray-500 flex items-center gap-1">
            <span class="w-2 h-2 rounded-full bg-blue-400" />
            {{ param.label || param.name }}
            <span class="text-gray-400">({{ param.type }})</span>
          </div>
        </div>
      </template>
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
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Slider from 'primevue/slider'
import { getNodeTypeDef } from '../../flow/nodeTypes.js'
import type { NodeTypeDefinition, FieldSchema, Fragment, OutputPort } from '@automan/shared/types.js'
import DataRefInput from './DataRefInput.vue'
import DataSourceSelect from './DataSourceSelect.vue'

const props = withDefaults(defineProps<{
  nodeType: string
  nodeId: string
  nodeLabel: string
  config: Record<string, unknown>
  upstreamNodes: Array<{ id: string; label: string; type: string }>
  dataNodes: Array<{ name: string; label: string; nodeId: string; scope?: string }>
  /** call 节点专用：片段列表 */
  fragments?: Fragment[]
  /** 片段编辑器模式：隐藏作用域字段，强制为"本轮" */
  fragmentMode?: boolean
}>(), {
  fragments: () => [],
  fragmentMode: false,
})

const emit = defineEmits<{
  'update:config': [key: string, value: unknown]
  'update:label': [value: string]
}>()

const nodeDef = computed(() => getNodeTypeDef(props.nodeType))

/** call 节点：当前选中的片段 */
const selectedFragment = computed(() => {
  if (props.nodeType !== 'call' || !props.fragments.length) return null
  const fragId = props.config?.fragmentId as string
  if (!fragId) return null
  return props.fragments.find((f) => f.id === fragId) ?? null
})

/** 输出端口：call 节点从片段 outputs 动态生成，其他节点从 nodeDef 读取 */
const effectiveOutputs = computed<OutputPort[]>(() => {
  if (props.nodeType === 'call' && selectedFragment.value) {
    return selectedFragment.value.outputs.map((p) => ({
      key: p.name,
      label: p.label || p.name,
      dataType: p.type === 'number' ? 'number' : 'string',
    }))
  }
  return nodeDef.value?.outputs ?? []
})

const fileRefs = ref<Record<string, HTMLInputElement | null>>({})

/** 下拉选项中文映射 */
const optionLabels: Record<string, Record<string, string>> = {
  scope: { session: '全局', local: '本轮', input: '外部输入' },
  action: { createOrSet: '创建或赋值', set: '赋值', add: '增加', sub: '减去', mul: '乘', div: '除' },
}

/** 将 string[] 选项转为 {label, value}[] 格式，有中文映射时使用中文 */
function getSelectOptions(field: FieldSchema): Array<{ label: string; value: string }> {
  // call 节点的 fragmentId：从片段列表动态生成
  if (field.key === 'fragmentId' && props.fragments.length > 0) {
    return props.fragments.map((f) => ({ label: f.name, value: f.id }))
  }
  const labels = optionLabels[field.key]
  return (field.options ?? []).map((opt: string) => ({
    label: labels?.[opt] ?? opt,
    value: opt,
  }))
}

/** Select 变化时触发配置更新，并处理联动逻辑 */
function onSelectChange(key: string, value: string) {
  setConfig(key, value)
}

function setFileRef(key: string, el: HTMLInputElement | null) {
  fileRefs.value[key] = el
}

function getConfig(key: string): unknown {
  return props.config?.[key]
}

function setConfig(key: string, value: unknown) {
  emit('update:config', key, value)
}

/** 选择已有数据源时，自动填充该数据源首次定义时的 scope */
function onDataSourceSelect(key: string, name: string) {
  emit('update:config', key, name)
  // 查找第一个定义该变量名的节点（排除当前节点），取其 scope
  const source = props.dataNodes.find((n) => n.name === name && n.nodeId !== props.nodeId)
  if (source) {
    emit('update:config', 'scope', source.scope ?? 'local')
  }
}

function shouldShow(field: FieldSchema): boolean {
  // 片段模式下隐藏作用域字段（强制为"本轮"）
  if (props.fragmentMode && field.key === 'scope') return false
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

/** coord-ref 显示值：兼容旧数组格式和新字符串格式 */
function formatCoordStr(val: unknown): string {
  if (typeof val === 'string') return val
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
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  border-bottom: 1px solid #f3f4f6;
}

.config-panel__body {
  padding: 12px 16px;
  overflow-y: auto;
  flex: 1;
}

.config-panel__desc {
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.5;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f3f4f6;
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

.config-panel__outputs {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #f3f4f6;
}

.img-remove-btn {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ef4444;
  color: white;
  border: 2px solid white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: background 0.15s;
  z-index: 1;
}

.img-remove-btn:hover {
  background: #dc2626;
}
</style>
