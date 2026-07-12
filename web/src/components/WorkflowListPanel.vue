<template>
  <div class="wf-panel flex flex-col h-full bg-white border-r border-gray-200">
    <div class="px-3 pt-3 pb-2">
      <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">工作流</span>
    </div>

    <nav class="flex-1 overflow-y-auto px-2">
      <div v-if="workflows.length === 0" class="text-xs text-gray-400 text-center py-6">
        暂无工作流
      </div>

      <div v-for="wf in workflows" :key="wf.id" class="mb-1">
        <!-- 工作流行：标题 + 开关 -->
        <div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 group">
          <!-- 展开箭头 -->
          <Button text rounded severity="secondary" size="small" :icon="expandedId === wf.id ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" @click="toggleExpand(wf.id)" />

          <!-- 标题（点击跳转到编辑器） -->
          <button
            class="flex-1 text-sm text-left truncate hover:text-brand-600 transition-colors bg-transparent border-none cursor-pointer"
            @click="toggleExpand(wf.id)"
          >
            {{ wf.name }}
          </button>

          <!-- Switch 开关 -->
          <button
            class="wf-switch"
            :class="{ 'is-on': isChecked(wf.id) }"
            @click.stop="toggleCheck(wf.id)"
            :disabled="isRunning"
            :title="isChecked(wf.id) ? '已启用' : '未启用'"
          >
            <span class="wf-switch__dot" />
          </button>
        </div>

        <!-- 展开配置区 -->
        <div v-if="expandedId === wf.id" class="ml-6 mr-2 mb-2 px-2 py-2 bg-gray-50 rounded text-xs space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-gray-500 w-16">触发方式</span>
            <Select :options="['每次截图']" model-value="每次截图" class="flex-1" size="small" />
          </div>
          <div class="text-gray-400 text-center py-1">更多配置待扩展</div>
        </div>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import type { Workflow } from '@automan/shared/types.js'
import { workflowApi } from '../api/workflow.js'
import { useWorkflowRun } from '../composables/useWorkflowRun.js'

const props = defineProps<{ deviceId: string }>()

const { toggleCheck, isChecked, isRunning } = useWorkflowRun()

const workflows = ref<Workflow[]>([])
const expandedId = ref('')

async function loadWorkflows() {
  const res = await workflowApi.list()
  if (res.success) {
    workflows.value = res.data
  }
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? '' : id
}

watch(() => props.deviceId, () => {
  loadWorkflows()
}, { immediate: true })

onMounted(() => {
  loadWorkflows()
})
</script>

<style scoped>
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
