<template>
  <div class="wf-panel flex flex-col h-full min-w-0 bg-white border-r border-gray-200">
    <div class="px-3 pt-3 pb-2">
      <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">工作流</span>
    </div>

    <nav class="flex-1 overflow-y-auto overflow-x-hidden px-2">
      <div v-if="workflows.length === 0" class="text-xs text-gray-400 text-center py-6">
        暂无工作流
      </div>

      <div v-for="wf in workflows" :key="wf.id" class="mb-1">
        <!-- 工作流行：标题 + 开关 -->
        <div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 group">
          <!-- 展开箭头 -->
          <Button text rounded severity="secondary" size="small" :icon="expandedId === wf.id ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" @click="toggleExpand(wf.id)" />

          <!-- 标题（点击展开配置） -->
          <button
            class="flex-1 text-sm text-left truncate hover:text-brand-600 transition-colors bg-transparent border-none cursor-pointer"
            @click="toggleExpand(wf.id)"
          >
            {{ wf.name }}
          </button>

          <!-- 运行状态标签 -->
          <span
            v-if="getFlowState(wf.id) && getFlowState(wf.id) !== 'idle'"
            class="text-xs px-1.5 py-0.5 rounded-full"
            :class="flowStateClass(getFlowState(wf.id)!)"
          >
            {{ flowStateLabel(getFlowState(wf.id)!) }}
          </span>

          <!-- Switch 开关 -->
          <button
            class="wf-switch"
            :class="{ 'is-on': isChecked(wf.id, props.deviceId) }"
            @click.stop="toggleCheck(wf.id, props.deviceId)"
            :disabled="isRunning"
            :title="isChecked(wf.id, props.deviceId) ? '已启用' : '未启用'"
          >
            <span class="wf-switch__dot" />
          </button>
        </div>

        <!-- 展开配置区 -->
        <div v-if="expandedId === wf.id" class="ml-6 mr-2 mb-2 px-3 py-3 bg-gray-50 rounded text-xs space-y-3">
          <!-- 触发方式 -->
          <div class="space-y-1">
            <label class="text-gray-500 font-medium">触发方式</label>
            <Select
              v-model="configForm.triggerMode"
              :options="triggerOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              size="small"
            />
          </div>

          <!-- 定时配置（仅 scheduled 模式显示） -->
          <div v-if="configForm.triggerMode === 'scheduled'" class="space-y-2">
            <label class="text-gray-500 font-medium">定时时间</label>
            <div v-for="(d, idx) in configForm.scheduleDates" :key="idx" class="flex items-center gap-2">
              <DatePicker
                v-model="configForm.scheduleDates[idx]"
                time-only
                hour-format="24"
                show-icon
                class="flex-1"
                size="small"
                :step-minute="1"
              />
              <Button icon="pi pi-times" severity="danger" text size="small" rounded @click="removeTime(idx)" />
            </div>
            <Button label="添加时间" icon="pi pi-plus" severity="secondary" text size="small" @click="addTime" />
          </div>

          <!-- 成功停止条件 -->
          <div class="space-y-1">
            <label class="text-gray-500 font-medium">成功N次后停止</label>
            <InputNumber
              v-model="configForm.maxSuccessCount"
              :min="0"
              :use-grouping="false"
              class="w-full"
              size="small"
              placeholder="不限制"
            />
            <div v-if="configForm.maxSuccessCount === 0" class="text-xs text-gray-400">当前不限制，达到指定次数后自动停止</div>
          </div>

          <!-- 失败停止条件 -->
          <div class="space-y-1">
            <label class="text-gray-500 font-medium">失败N次后停止</label>
            <InputNumber
              v-model="configForm.maxFailCount"
              :min="0"
              :use-grouping="false"
              class="w-full"
              size="small"
              placeholder="不限制"
            />
            <div v-if="configForm.maxFailCount === 0" class="text-xs text-gray-400">当前不限制，达到指定次数后自动停止</div>
          </div>

          <!-- 外部输入变量 -->
          <div v-if="expandedInputFields.length > 0" class="space-y-2">
            <label class="text-gray-500 font-medium">脚本参数</label>
            <div v-for="field in expandedInputFields" :key="field.name" class="space-y-0.5">
              <div class="flex items-center gap-1 min-w-0">
                <span class="text-gray-600 truncate" :title="field.name">{{ field.label }}</span>
              </div>
              <InputText
                v-model="configForm.inputValues[field.name]"
                :placeholder="field.defaultValue ? `默认: ${field.defaultValue}` : '未设置'"
                class="w-full"
                size="small"
              />
            </div>
          </div>

          <!-- 运行计数显示 -->
          <div v-if="getFlowState(wf.id)" class="flex gap-3 text-gray-400">
            <span>成功: {{ getCounts(wf.id).success }}</span>
            <span>失败: {{ getCounts(wf.id).fail }}</span>
          </div>

          <!-- 保存按钮 -->
          <div class="flex justify-end">
            <Button label="保存配置" icon="pi pi-check" size="small" :loading="savingConfig" @click="saveConfig(wf.id)" />
          </div>
        </div>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, reactive, computed } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import DatePicker from 'primevue/datepicker'
import { useToast } from 'primevue/usetoast'
import type { Workflow, WorkflowRunConfig, FlowState } from '@automan/shared/types.js'
import { workflowApi } from '../api/workflow.js'
import { useWorkflowRun } from '../composables/useWorkflowRun.js'

const props = defineProps<{ deviceId: string }>()

const { toggleCheck, isChecked, isRunning, workflowFlowStateMap } = useWorkflowRun()
const toast = useToast()

const workflows = ref<Workflow[]>([])
const expandedId = ref('')
const savingConfig = ref(false)

/** 每个工作流的运行配置缓存 */
const configCache = ref<Map<string, WorkflowRunConfig>>(new Map())

/** 配置表单 */
const configForm = reactive<{
  triggerMode: 'immediate' | 'scheduled'
  /** 时间选择器的 Date 数组（UI 绑定用） */
  scheduleDates: Date[]
  maxSuccessCount: number
  maxFailCount: number
  /** 外部输入变量值 */
  inputValues: Record<string, string>
}>({
  triggerMode: 'immediate',
  scheduleDates: [],
  maxSuccessCount: 0,
  maxFailCount: 0,
  inputValues: {},
})

const triggerOptions = [
  { label: '每次截图', value: 'immediate' },
  { label: '定时触发', value: 'scheduled' },
]

/** 当前展开工作流的外部输入字段 */
const expandedInputFields = computed(() => {
  if (!expandedId.value) return []
  const wf = workflows.value.find((w) => w.id === expandedId.value)
  return wf?.inputFields ?? []
})

function getFlowState(workflowId: string): FlowState | undefined {
  return workflowFlowStateMap.value.get(workflowId)?.flowState as FlowState | undefined
}

function getCounts(workflowId: string): { success: number; fail: number } {
  const entry = workflowFlowStateMap.value.get(workflowId)
  return { success: entry?.successCount ?? 0, fail: entry?.failCount ?? 0 }
}

function flowStateLabel(state: FlowState): string {
  const map: Record<FlowState, string> = {
    idle: '空闲',
    pending: '等待中',
    processing: '执行中',
    success: '成功',
    fail: '失败',
    completed: '已完成',
    inactive: '等待定时',
  }
  return map[state]
}

function flowStateClass(state: FlowState): string {
  const map: Record<FlowState, string> = {
    idle: 'bg-gray-100 text-gray-500',
    pending: 'bg-yellow-100 text-yellow-700',
    processing: 'bg-blue-100 text-blue-700',
    success: 'bg-green-100 text-green-700',
    fail: 'bg-red-100 text-red-700',
    completed: 'bg-purple-100 text-purple-700',
    inactive: 'bg-sky-100 text-sky-700',
  }
  return map[state]
}

function addTime() {
  // 默认添加到今天 09:00
  const d = new Date()
  d.setHours(9, 0, 0, 0)
  configForm.scheduleDates.push(d)
}

function removeTime(idx: number) {
  configForm.scheduleDates.splice(idx, 1)
}

async function loadWorkflows() {
  const res = await workflowApi.list()
  if (res.success) {
    workflows.value = res.data
  }
}

/** 展开时加载配置 */
async function loadRunConfig(workflowId: string) {
  try {
    const res = await workflowApi.getRunConfig(props.deviceId, workflowId)
    if (res.success && res.data) {
      const cfg = res.data
      configCache.value.set(workflowId, cfg)
      configForm.triggerMode = cfg.triggerMode
      configForm.scheduleDates = cfg.scheduleTimes.length > 0
        ? cfg.scheduleTimes.map((t) => {
            const d = new Date()
            d.setHours(t.hour, t.minute, 0, 0)
            return d
          })
        : []
      configForm.maxSuccessCount = cfg.maxSuccessCount
      configForm.maxFailCount = cfg.maxFailCount
      configForm.inputValues = { ...(cfg.inputValues ?? {}) }
    } else {
      // 无配置，重置默认
      configForm.triggerMode = 'immediate'
      configForm.scheduleDates = []
      configForm.maxSuccessCount = 0
      configForm.maxFailCount = 0
      configForm.inputValues = {}
    }
  } catch {
    configForm.triggerMode = 'immediate'
    configForm.scheduleDates = []
    configForm.maxSuccessCount = 0
    configForm.maxFailCount = 0
    configForm.inputValues = {}
  }
}

async function saveConfig(workflowId: string) {
  savingConfig.value = true
  try {
    await workflowApi.saveRunConfig({
      deviceId: props.deviceId,
      workflowId,
      triggerMode: configForm.triggerMode,
      scheduleTimes: configForm.scheduleDates.map((d) => ({ hour: d.getHours(), minute: d.getMinutes() })),
      maxSuccessCount: configForm.maxSuccessCount,
      maxFailCount: configForm.maxFailCount,
      inputValues: configForm.inputValues,
    })
    toast.add({ severity: 'success', summary: '保存成功', detail: '工作流运行配置已更新', life: 3000 })
  } catch (err) {
    toast.add({ severity: 'error', summary: '保存失败', detail: err instanceof Error ? err.message : '网络异常', life: 5000 })
  } finally {
    savingConfig.value = false
  }
}

function toggleExpand(id: string) {
  if (expandedId.value === id) {
    expandedId.value = ''
  } else {
    expandedId.value = id
    loadRunConfig(id)
  }
}

watch(() => props.deviceId, () => {
  loadWorkflows()
}, { immediate: true })

onMounted(() => {
  loadWorkflows()
})
</script>

<style scoped>
/* 展开配置区内的 PrimeVue 表单控件：填满容器且可收缩，避免窄侧栏溢出 */
.wf-panel :deep(.p-inputtext),
.wf-panel :deep(.p-select),
.wf-panel :deep(.p-inputnumber),
.wf-panel :deep(.p-datepicker) {
  width: 100%;
  min-width: 0;
}

.wf-switch {
  position: relative;
  width: 28px;
  height: 16px;
  border-radius: 8px;
  background: #d1d5db;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
  padding: 0;
  border: none;
}

.wf-switch.is-on {
  background: #22c55e;
}

.wf-switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wf-switch__dot {
  display: block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: white;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
}

.wf-switch.is-on .wf-switch__dot {
  transform: translateX(12px);
}
</style>
