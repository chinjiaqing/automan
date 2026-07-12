<template>
  <div class="flow-view">
    <!-- 左侧脚本列表 -->
    <aside class="flow-sidebar">
      <div class="flow-sidebar__header">
        <span class="text-sm font-semibold text-gray-700">脚本列表</span>
        <Button size="small" icon="pi pi-plus" label="新建" @click="handleCreate" />
      </div>
      <nav class="flex-1 overflow-y-auto px-2 py-2">
        <div v-if="workflowList.length === 0" class="text-xs text-gray-400 text-center py-8">
          暂无脚本
        </div>
        <div
          v-for="wf in workflowList"
          :key="wf.id"
          class="flow-sidebar__item"
          :class="{ 'is-active': currentWorkflowId === wf.id }"
          @click="selectWorkflow(wf.id)"
        >
          <span class="text-sm truncate">{{ wf.name }}</span>
        </div>
      </nav>
    </aside>

    <!-- 中间区域：有选中时显示画布，无选中时显示占位 -->
    <template v-if="currentWorkflowId">
      <!-- 节点面板 -->
      <NodePalette />

      <!-- 画布 -->
      <div class="flow-canvas" @drop="onDrop" @dragover.prevent>
        <!-- 顶部工具栏 -->
        <div class="flow-toolbar">
          <InputText
            class="flow-toolbar__name"
            :value="currentWorkflowName"
            @input="onNameInput"
            placeholder="工作流名称"
            size="small"
          />
          <span v-if="currentWorkflowId" class="text-xs text-gray-400 select-all">
            ID: {{ currentWorkflowId }}
          </span>
          <div class="flex-1" />
          <Button size="small" severity="secondary" text icon="pi pi-save" :label="hasChanges ? '保存 *' : '保存'" :disabled="!hasChanges" @click="handleSave" />
          <Button size="small" severity="danger" text icon="pi pi-trash" label="删除" @click="handleDelete" />
        </div>

        <!-- Vue Flow 画布 -->
        <VueFlow
          v-model:nodes="nodes"
          v-model:edges="edges"
          :node-types="nodeTypes"
          :default-edge-options="defaultEdgeOpts"
          :fit-view-on-init="true"
          :snap-to-grid="true"
          :snap-grid="[16, 16]"
          :delete-key-code="['Delete', 'Backspace']"
          class="flow-vue-flow"
          @node-click="onNodeClick"
          @pane-click="onPaneClick"
          @nodes-change="markChanged"
          @edges-change="markChanged"
          @connect="onConnect"
        >
          <Background :gap="16" />
          <Controls />
        </VueFlow>
      </div>

      <!-- 右侧配置面板 -->
      <ConfigPanel
        v-if="selectedNode"
        :node-type="selectedNode.type"
        :node-id="selectedNode.id"
        :node-label="selectedNode.label"
        :config="selectedNode.config as Record<string, unknown>"
        :upstream-nodes="upstreamNodes"
        :data-nodes="dataNodes"
        @update:config="onConfigUpdate"
        @update:label="onLabelUpdate"
      />
      <aside v-else class="config-panel-placeholder">
        <div class="flex flex-col items-center justify-center h-full text-gray-400 w-[280px]">
          <i class="pi pi-arrow-left text-2xl mb-2" />
          <span class="text-sm">选择节点以配置</span>
        </div>
      </aside>
    </template>

    <!-- 无选中：空占位 -->
    <div v-else class="flow-empty">
      <i class="pi pi-file-edit text-4xl text-gray-300 mb-3" />
      <span class="text-sm text-gray-400">选择或新建脚本来开始编辑</span>
    </div>

    <!-- 新建脚本弹窗 -->
    <Dialog v-model:visible="createDialogVisible" header="新建脚本" :modal="true" :style="{ width: '360px' }">
      <div class="mb-4">
        <label class="block text-sm text-gray-600 mb-1.5">脚本名称</label>
        <InputText
          class="w-full"
          v-model="createName"
          placeholder="请输入脚本名称"
          @keydown.enter="confirmCreate"
          size="small"
        />
      </div>
      <template #footer>
        <Button severity="secondary" text label="取消" @click="createDialogVisible = false" />
        <Button label="确定" :disabled="!createName.trim()" @click="confirmCreate" />
      </template>
    </Dialog>

    <!-- 删除确认弹窗 -->
    <Dialog v-model:visible="deleteDialogVisible" header="确认删除" :modal="true" :style="{ width: '360px' }">
      <p class="text-sm text-gray-600 mb-4">确定要删除脚本「{{ deleteTargetName }}」吗？此操作不可撤销。</p>
      <template #footer>
        <Button severity="secondary" text label="取消" @click="deleteDialogVisible = false" />
        <Button severity="danger" label="删除" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, markRaw, onMounted } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { VueFlow, useVueFlow, type Connection } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'

import NodePalette from '../components/flow/NodePalette.vue'
import ConfigPanel from '../components/flow/ConfigPanel.vue'
import StartNode from '../components/flow/nodes/StartNode.vue'
import EndNode from '../components/flow/nodes/EndNode.vue'
import ConditionNode from '../components/flow/nodes/ConditionNode.vue'
import LoopNode from '../components/flow/nodes/LoopNode.vue'
import ActionNode from '../components/flow/nodes/ActionNode.vue'
import DataNode from '../components/flow/nodes/DataNode.vue'

import { workflowApi } from '../api/workflow.js'
import { getNodeTypeDef } from '../flow/nodeTypes.js'
import type { Workflow, WorkflowNode as WfNode } from '@automan/shared/types.js'

// ── Vue Flow 实例 ────────────────────────────────
const { addNodes, addEdges, project } = useVueFlow()

// ── 自定义节点类型映射 ──────────────────────────
const nodeTypes: Record<string, any> = {
  start: markRaw(StartNode),
  end: markRaw(EndNode),
  condition: markRaw(ConditionNode),
  loop: markRaw(LoopNode),
  findPic: markRaw(ActionNode),
  ocrWords: markRaw(ActionNode),
  ocrFindStr: markRaw(ActionNode),
  click: markRaw(ActionNode),
  areaClick: markRaw(ActionNode),
  delay: markRaw(ActionNode),
  variable: markRaw(DataNode),
}

const defaultEdgeOpts = {
  type: 'smoothstep',
  style: { stroke: '#94a3b8', strokeWidth: 2 },
}

// ── 状态 ─────────────────────────────────────────
const nodes = ref<any[]>([])
const edges = ref<any[]>([])
const workflowList = ref<Workflow[]>([])
const currentWorkflowId = ref('')
const currentWorkflowName = ref('')
const hasChanges = ref(false)
const selectedNode = ref<WfNode | null>(null)

// ── 新建弹窗 ──
const createDialogVisible = ref(false)
const createName = ref('')

// ── 删除弹窗 ──
const deleteDialogVisible = ref(false)
const deleteTargetName = ref('')

// ── 计算属性 ─────────────────────────────────────
/** 选中节点的上游节点（在拓扑序中位于其前面的节点） */
const upstreamNodes = computed(() => {
  if (!selectedNode.value) return []
  return nodes.value
    .filter((n) => n.id !== selectedNode.value!.id && n.type !== 'end')
    .map((n) => ({ id: n.id, label: n.label ?? n.data?.label, type: n.type }))
})

/** 工作流中所有数据节点（供 data-source 下拉引用） */
const dataNodes = computed(() => {
  return nodes.value
    .filter((n) => n.type === 'variable' && n.data?.config?.name)
    .map((n) => ({
      name: n.data.config.name as string,
      label: n.data.label ?? n.type,
      nodeId: n.id,
    }))
})

// ── 生命周期 ──────────────────────────────────────
onMounted(async () => {
  await loadWorkflowList()
})

// ── 方法 ─────────────────────────────────────────

async function loadWorkflowList() {
  const res = await workflowApi.list()
  if (res.success) {
    workflowList.value = res.data
  }
}

/** 从列表选中一个工作流 */
async function selectWorkflow(id: string) {
  if (currentWorkflowId.value === id) return
  await loadWorkflow(id)
}

async function loadWorkflow(id: string) {
  const res = await workflowApi.get(id)
  if (!res.success) return
  const wf = res.data
  currentWorkflowId.value = wf.id
  currentWorkflowName.value = wf.name

  // 将 WorkflowNode[] 转为 Vue Flow 节点
  nodes.value = wf.nodes.map((n) => toFlowNode(n))
  edges.value = wf.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    type: 'smoothstep',
  }))
  hasChanges.value = false
  selectedNode.value = null
}

function toFlowNode(n: WfNode): any {
  const def = getNodeTypeDef(n.type)
  const category = def?.category ?? 'action'
  return {
    id: n.id,
    type: n.type,
    position: n.position,
    data: {
      label: n.label,
      type: n.type,
      config: n.config ?? {},
      selected: false,
    },
    deletable: n.type !== 'start' && n.type !== 'end',
    draggable: true,
  }
}

function toWfNode(n: any): WfNode {
  return {
    id: n.id,
    type: n.type,
    label: n.data?.label ?? n.label ?? n.type,
    position: n.position ?? { x: 0, y: 0 },
    config: n.data?.config ?? {},
  }
}

function toWfEdge(e: any) {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
  }
}

function onNodeClick({ node }: { node: any }) {
  nodes.value.forEach((n) => {
    if (n.data) n.data.selected = false
  })
  if (node.data) node.data.selected = true
  selectedNode.value = toWfNode(node)
}

function onPaneClick() {
  nodes.value.forEach((n) => {
    if (n.data) n.data.selected = false
  })
  selectedNode.value = null
}

function onConnect(connection: Connection) {
  const id = `e-${connection.source}${connection.sourceHandle ?? ''}-${connection.target}`
  addEdges([
    {
      ...connection,
      id,
      type: 'smoothstep',
    },
  ])
  hasChanges.value = true
}

function markChanged() {
  hasChanges.value = true
}

/** 名称输入 */
function onNameInput(e: Event) {
  currentWorkflowName.value = (e.target as HTMLInputElement).value
  hasChanges.value = true
}

// ── 拖入添加节点 ────────────────────────────────
function onDrop(event: DragEvent) {
  const nodeType = event.dataTransfer?.getData('application/automan-node-type')
  if (!nodeType) return

  const def = getNodeTypeDef(nodeType)
  if (!def) return

  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const position = project({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top - 40,
  })

  const id = `${nodeType}_${Date.now()}`
  const defaultConfig: Record<string, unknown> = {}
  for (const field of def.configSchema) {
    if (field.default !== undefined) {
      defaultConfig[field.key] = field.default
    }
  }

  if (nodeType === 'variable' && !defaultConfig.name) {
    defaultConfig.name = generateDataId()
  }

  const newNode = {
    id,
    type: nodeType,
    position,
    data: {
      label: def.label,
      type: nodeType,
      config: defaultConfig,
      selected: false,
    },
    deletable: nodeType !== 'start' && nodeType !== 'end',
  }

  addNodes([newNode])
  hasChanges.value = true
}

// ── 配置更新 ─────────────────────────────────────
function onConfigUpdate(key: string, value: unknown) {
  if (!selectedNode.value) return
  const node = nodes.value.find((n) => n.id === selectedNode.value!.id)
  if (node?.data) {
    node.data = { ...node.data, config: { ...node.data.config, [key]: value } }
  }
  selectedNode.value = {
    ...selectedNode.value,
    config: { ...selectedNode.value.config, [key]: value },
  }
  hasChanges.value = true
}

function onLabelUpdate(value: string) {
  if (!selectedNode.value) return
  const node = nodes.value.find((n) => n.id === selectedNode.value!.id)
  if (node?.data) {
    node.data = { ...node.data, label: value }
  }
  selectedNode.value = { ...selectedNode.value, label: value }
  hasChanges.value = true
}

// ── 工作流 CRUD ───────────────────────────────────
function handleCreate() {
  createName.value = ''
  createDialogVisible.value = true
}

async function confirmCreate() {
  const name = createName.value.trim()
  if (!name) return
  createDialogVisible.value = false
  const res = await workflowApi.create({ name })
  if (res.success) {
    await loadWorkflowList()
    await loadWorkflow(res.data.id)
  }
}

async function handleSave() {
  if (!currentWorkflowId.value) return
  const wfNodes = nodes.value.map((n) => toWfNode(n))
  const wfEdges = edges.value.map((e) => toWfEdge(e))
  const res = await workflowApi.save(currentWorkflowId.value, {
    name: currentWorkflowName.value,
    nodes: wfNodes,
    edges: wfEdges,
  })
  if (res.success) {
    hasChanges.value = false
    // 更新列表中的名称
    const item = workflowList.value.find((w) => w.id === currentWorkflowId.value)
    if (item) item.name = res.data.name
  }
}

async function handleDelete() {
  if (!currentWorkflowId.value) return
  deleteTargetName.value = currentWorkflowName.value
  deleteDialogVisible.value = true
}

async function confirmDelete() {
  deleteDialogVisible.value = false
  const res = await workflowApi.remove(currentWorkflowId.value)
  if (res.success) {
    currentWorkflowId.value = ''
    currentWorkflowName.value = ''
    nodes.value = []
    edges.value = []
    selectedNode.value = null
    await loadWorkflowList()
  }
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
.flow-view {
  display: flex;
  height: calc(100vh - 3.5rem);
  overflow: hidden;
}

/* ── 左侧脚本列表 ── */
.flow-sidebar {
  width: 200px;
  display: flex;
  flex-direction: column;
  background: white;
  border-right: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.flow-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 12px 8px;
  border-bottom: 1px solid #f3f4f6;
}

.flow-sidebar__item {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  margin-bottom: 2px;
}

.flow-sidebar__item:hover {
  background: #f3f4f6;
}

.flow-sidebar__item.is-active {
  background: #eff6ff;
  color: #2563eb;
  font-weight: 500;
}

/* ── 画布区域 ── */
.flow-canvas {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
}

.flow-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.flow-toolbar__name {
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  outline: none;
  min-width: 120px;
  max-width: 240px;
  transition: border-color 0.15s;
}

.flow-toolbar__name:hover {
  border-color: #9ca3af;
}

.flow-toolbar__name:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.flow-vue-flow {
  flex: 1;
  background: #fafafa;
}

/* ── 空占位 ── */
.flow-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #fafafa;
}

.config-panel-placeholder {
  width: 280px;
  background: white;
  border-left: 1px solid #e5e7eb;
  flex-shrink: 0;
}
</style>

<style>
/* 全局节点样式 */
.flow-node {
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 12px;
  min-width: 140px;
  font-size: 13px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.flow-node.is-selected {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.flow-node--start {
  border-color: #22c55e;
}

.flow-node--end {
  border-color: #ef4444;
}

.flow-node__header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.flow-node__icon {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.flow-node__label {
  font-weight: 500;
  color: #1f2937;
}

.flow-node__outputs {
  margin-top: 6px;
  padding-top: 4px;
  border-top: 1px solid #f3f4f6;
}

.flow-node__output {
  padding: 1px 0;
}

.flow-node__handle-label {
  position: absolute;
  bottom: -16px;
  font-size: 10px;
  color: #9ca3af;
}

.flow-node__handle-label--true {
  left: calc(30% - 10px);
  color: #22c55e;
}

.flow-node__handle-label--false {
  left: calc(70% - 12px);
  color: #ef4444;
}

.flow-node__handle-label--body {
  left: calc(30% - 10px);
  color: #0891b2;
}

.flow-node__handle-label--exit {
  left: calc(70% - 10px);
  color: #6b7280;
}

.flow-node--loop {
  border-color: #0891b2;
}

.flow-node__config-preview {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid #f3f4f6;
}

.flow-node__var-name {
  margin-top: 4px;
}

.flow-node__action {
  margin-top: 2px;
  padding-top: 3px;
  border-top: 1px solid #f3f4f6;
}

/* Vue Flow 控制按钮 */
.vue-flow__controls {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
  border-radius: 6px !important;
}
</style>
