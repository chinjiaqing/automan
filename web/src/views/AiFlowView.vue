<template>
  <div class="ai-flow">
    <!-- 顶部工具栏 -->
    <div class="ai-flow__toolbar">
      <div class="flex items-center gap-3">
        <Select
          v-model="selectedWorkflowId"
          :options="workflowList"
          optionLabel="name"
          optionValue="id"
          placeholder="加载已有脚本"
          class="w-56"
          size="small"
          showClear
          @update:modelValue="handleLoadWorkflow"
        />
        <span v-if="currentWorkflowName" class="text-sm text-gray-500">
          当前: {{ currentWorkflowName }}
        </span>
        <Button text size="small" icon="pi pi-upload" label="导入 JSON" @click="handleImportJson" />
        <Button text size="small" icon="pi pi-trash" label="清空画布" severity="secondary" @click="handleClear" />
      </div>
      <div class="flex items-center gap-2">
        <Button size="small" icon="pi pi-save" label="另存为" :disabled="flowNodes.length === 0" @click="handleSaveAs" />
        <div class="save-to-wrapper">
          <Select
            v-model="saveToId"
            :options="workflowList"
            optionLabel="name"
            optionValue="id"
            placeholder="保存为…"
            class="save-to-select"
            size="small"
            :disabled="flowNodes.length === 0"
            @update:modelValue="handleSaveTo"
          />
        </div>
        <Button icon="pi pi-cog" text size="small" severity="secondary" @click="configDialogVisible = true" />
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="ai-flow__content">
      <!-- 左侧画布 -->
      <FlowCanvas
        :nodes="flowNodes"
        :edges="flowEdges"
        :collapsed="canvasCollapsed"
      />

      <!-- 收起/展开按钮 -->
      <button
        class="ai-flow__toggle"
        :class="{ 'is-collapsed': canvasCollapsed }"
        @click="canvasCollapsed = !canvasCollapsed"
        :title="canvasCollapsed ? '展开画布' : '收起画布'"
      >
        <i :class="`pi ${canvasCollapsed ? 'pi-angle-right' : 'pi-angle-left'}`" />
      </button>

      <!-- 右侧对话 -->
      <div class="ai-flow__chat">
        <ChatPanel
          :messages="messages"
          :is-streaming="isStreaming"
          :error="error"
          :is-configured="isConfigured"
          @send="handleSend"
        />
      </div>
    </div>

    <!-- LLM 配置弹窗 -->
    <LlmConfigDialog
      v-model="configDialogVisible"
      :config="config"
      @save="handleConfigSave"
    />

    <!-- 另存为弹窗 -->
    <Dialog v-model:visible="saveDialogVisible" header="另存为新脚本" :modal="true" :style="{ width: '360px' }">
      <div class="mb-4">
        <label class="block text-sm text-gray-600 mb-1.5">脚本名称</label>
        <InputText
          class="w-full"
          v-model="saveName"
          placeholder="请输入脚本名称"
          @keydown.enter="confirmSaveAs"
          size="small"
        />
      </div>
      <template #footer>
        <Button severity="secondary" text label="取消" @click="saveDialogVisible = false" />
        <Button label="确定" :disabled="!saveName.trim()" @click="confirmSaveAs" />
      </template>
    </Dialog>

    <!-- 隐藏的 file input -->
    <input ref="fileInput" type="file" accept=".json" class="hidden" @change="onFileSelected" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { useToast } from 'primevue/usetoast'
import FlowCanvas from '../components/FlowCanvas.vue'
import ChatPanel from '../components/ChatPanel.vue'
import LlmConfigDialog from '../components/LlmConfigDialog.vue'
import { useAiChat } from '../composables/useAiChat.js'
import { workflowApi } from '../api/workflow.js'
import type { Workflow, WorkflowNode, WorkflowEdge } from '@automan/shared/types.js'

// ── AI 聊天 ──
const { config, messages, isStreaming, error, isConfigured, updateConfig, send, clearChat } = useAiChat()
const toast = useToast()

// ── 画布状态 ──
const flowNodes = ref<WorkflowNode[]>([])
const flowEdges = ref<WorkflowEdge[]>([])
const canvasCollapsed = ref(false)

// ── 工作流列表 ──
const workflowList = ref<Workflow[]>([])
const selectedWorkflowId = ref('')
const currentWorkflowName = ref('')

// ── 配置弹窗 ──
const configDialogVisible = ref(false)

// ── 另存为弹窗 ──
const saveDialogVisible = ref(false)
const saveName = ref('')

// ── 保存为（覆盖已有）──
const saveToId = ref<string | null>(null)

// ── 文件导入 ──
const fileInput = ref<HTMLInputElement>()

onMounted(async () => {
  await loadWorkflowList()
})

async function loadWorkflowList() {
  const res = await workflowApi.list()
  if (res.success) {
    workflowList.value = res.data
  }
}

async function handleLoadWorkflow(id: string | null) {
  if (!id) {
    flowNodes.value = []
    flowEdges.value = []
    currentWorkflowName.value = ''
    return
  }
  const res = await workflowApi.get(id)
  if (res.success) {
    flowNodes.value = res.data.nodes ?? []
    flowEdges.value = res.data.edges ?? []
    currentWorkflowName.value = res.data.name
  }
}

function handleImportJson() {
  fileInput.value?.click()
}

function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result as string)
      if (data.nodes && Array.isArray(data.nodes)) {
        flowNodes.value = data.nodes
        flowEdges.value = data.edges ?? []
        currentWorkflowName.value = data.name ?? '导入的工作流'
      }
    } catch {
      error.value = 'JSON 解析失败，请检查文件格式'
    }
  }
  reader.readAsText(file)
  // 重置 input 以便重复选同一文件
  if (fileInput.value) fileInput.value.value = ''
}

function handleClear() {
  flowNodes.value = []
  flowEdges.value = []
  currentWorkflowName.value = ''
  selectedWorkflowId.value = ''
  clearChat()
}

/** 另存为：弹窗 → 创建新脚本 */
function handleSaveAs() {
  saveName.value = currentWorkflowName.value || ''
  saveDialogVisible.value = true
}

async function confirmSaveAs() {
  const name = saveName.value.trim()
  if (!name) return
  saveDialogVisible.value = false

  const res = await workflowApi.create({ name })
  if (res.success) {
    await workflowApi.save(res.data.id, {
      name,
      nodes: flowNodes.value,
      edges: flowEdges.value,
    })
    currentWorkflowName.value = name
    selectedWorkflowId.value = res.data.id
    await loadWorkflowList()
    toast.add({ severity: 'success', summary: '已另存为', detail: `"${name}" 创建成功`, life: 3000 })
  }
}

/** 保存为：覆盖更新已有脚本 */
async function handleSaveTo(id: string | null) {
  if (!id) return
  const wf = workflowList.value.find((w) => w.id === id)
  if (!wf) return

  await workflowApi.save(id, {
    name: wf.name,
    nodes: flowNodes.value,
    edges: flowEdges.value,
  })
  currentWorkflowName.value = wf.name
  selectedWorkflowId.value = id
  // 重置 Select 占位
  saveToId.value = null
  toast.add({ severity: 'success', summary: '已保存', detail: `"${wf.name}" 已更新`, life: 3000 })
}

function handleConfigSave(cfg: typeof config.value) {
  updateConfig(cfg)
}

/** 解析 AI 回复中的 JSON，直接替换画布 */
function parseAndApplyFlow(content: string): boolean {
  // 策略 1：直接解析
  let data = tryParseJson(content)
  if (data && Array.isArray(data.nodes)) {
    flowNodes.value = data.nodes
    flowEdges.value = data.edges ?? []
    return true
  }

  // 策略 2：提取 ```json ... ``` 代码块（贪婪匹配最大块）
  const codeBlocks = content.match(/```(?:json)?\s*([\s\S]*?)```/g)
  if (codeBlocks) {
    // 从最长的代码块开始尝试（最可能包含完整 JSON）
    codeBlocks.sort((a, b) => b.length - a.length)
    for (const block of codeBlocks) {
      const inner = block.replace(/^```(?:json)?\s*/, '').replace(/```$/, '')
      data = tryParseJson(inner)
      if (data && Array.isArray(data.nodes)) {
        flowNodes.value = data.nodes
        flowEdges.value = data.edges ?? []
        return true
      }
    }
  }

  // 策略 3：找第一个 { 到最后一个 } 之间的内容
  const firstBrace = content.indexOf('{')
  const lastBrace = content.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    data = tryParseJson(content.slice(firstBrace, lastBrace + 1))
    if (data && Array.isArray(data.nodes)) {
      flowNodes.value = data.nodes
      flowEdges.value = data.edges ?? []
      return true
    }
  }

  return false
}

function tryParseJson(text: string): any {
  try {
    return JSON.parse(text.trim())
  } catch {
    return null
  }
}

async function handleSend(userMessage: string) {
  const result = await send(userMessage, flowNodes.value, flowEdges.value)
  if (result) {
    const applied = parseAndApplyFlow(result)
    if (!applied && !isPureExplanation(result)) {
      error.value = '无法解析 AI 返回的工作流 JSON，请要求 AI 重新输出完整 JSON'
    }
  }
}

/** 判断回复是否为纯解释（不含 JSON 结构） */
function isPureExplanation(content: string): boolean {
  // 如果包含 nodes 数组，可能有意输出 JSON
  return !content.includes('"nodes"') && !content.includes('"edges"')
}
</script>

<style scoped>
.ai-flow {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.ai-flow__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid #e5e7eb;
  background: white;
  flex-shrink: 0;
}

.ai-flow__content {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.ai-flow__toggle {
  position: absolute;
  top: 8px;
  left: calc(50% - 14px);
  z-index: 10;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: white;
  cursor: pointer;
  color: #6b7280;
  transition: left 0.25s, background 0.15s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.ai-flow__toggle.is-collapsed {
  left: 4px;
}

.ai-flow__toggle:hover {
  background: #f3f4f6;
}

.ai-flow__chat {
  flex: 1;
  min-width: 0;
}

.save-to-wrapper {
  display: inline-flex;
}

.save-to-select {
  width: 140px;
}
</style>
