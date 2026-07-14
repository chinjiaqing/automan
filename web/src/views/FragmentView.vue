<template>
  <div class="fragment-view">
    <!-- 第一列：片段分组 -->
    <aside class="frag-col frag-col--groups">
      <div class="frag-col__header">
        <span class="text-sm font-semibold text-gray-700">分组</span>
        <Button size="small" text icon="pi pi-plus" title="新建分组" @click="openCreateGroup" />
      </div>
      <nav class="flex-1 overflow-y-auto px-2 py-2">
        <div
          class="frag-col__item"
          :class="{ 'is-active': selectedGroupId === null }"
          @click="selectedGroupId = null"
        >
          <i class="pi pi-th-large text-xs" />
          <span class="text-sm truncate">全部</span>
          <span class="frag-col__badge">{{ fragmentList.length }}</span>
        </div>
        <div
          v-for="g in groups"
          :key="g.id"
          class="frag-col__item"
          :class="{ 'is-active': selectedGroupId === g.id }"
          @click="selectedGroupId = g.id"
        >
          <i class="pi pi-folder text-xs" />
          <span class="text-sm truncate flex-1">{{ g.name }}</span>
          <span class="frag-col__badge">{{ groupCountMap[g.id] ?? 0 }}</span>
          <Button size="small" text severity="secondary" icon="pi pi-pencil"
            class="frag-col__edit" @click.stop="openRenameGroup(g.id, g.name)" />
          <Button size="small" text severity="danger" icon="pi pi-trash"
            class="frag-col__del" @click.stop="deleteGroup(g.id)" />
        </div>
      </nav>
    </aside>

    <!-- 第二列：片段列表 -->
    <aside class="frag-col frag-col--list">
      <div class="frag-col__header">
        <span class="text-sm font-semibold text-gray-700">片段</span>
        <Button size="small" text icon="pi pi-plus" title="新建片段" @click="handleCreate" />
      </div>
      <nav class="flex-1 overflow-y-auto px-2 py-2">
        <div v-if="filteredFragments.length === 0" class="text-xs text-gray-400 text-center py-8">
          暂无片段
        </div>
        <div
          v-for="frag in filteredFragments"
          :key="frag.id"
          class="frag-col__item"
          :class="{ 'is-active': currentFragmentId === frag.id }"
          @click="selectFragment(frag.id)"
        >
          <span class="text-sm truncate flex-1">{{ frag.name }}</span>
          <Button size="small" text severity="secondary" icon="pi pi-pencil"
            class="frag-col__edit" @click.stop="openEditDialogFor(frag)" />
        </div>
      </nav>
    </aside>

    <!-- 中间区域 -->
    <template v-if="currentFragmentId">
      <!-- 节点面板 -->
      <NodePalette :exclude-types="['call', 'endSuccess', 'endFail', 'end', 'return']" />

      <!-- 画布 -->
      <div class="frag-canvas" @drop="onDrop" @dragover.prevent>
        <!-- 顶部工具栏 -->
        <div class="frag-toolbar">
          <span class="frag-toolbar__name text-sm font-medium text-gray-800 truncate">{{ currentFragmentName }}</span>
          <Button
            size="small" text severity="secondary"
            :icon="showIOEditor ? 'pi pi-chevron-up' : 'pi pi-sliders-h'"
            :label="showIOEditor ? '收起参数' : '输入输出'"
            @click="showIOEditor = !showIOEditor"
          />
          <div class="flex-1" />
          <div class="flex gap-2 flex-shrink-0">
            <Button size="small" severity="secondary" text icon="pi pi-save"
              :label="hasChanges ? '保存 *' : '保存'" :disabled="!hasChanges" @click="handleSave" />
            <Button size="small" severity="danger" text icon="pi pi-trash" label="删除" @click="handleDelete" />
          </div>
        </div>

        <!-- I/O 编辑器 -->
        <FragmentIOEditor
          v-if="showIOEditor"
          :inputs="currentInputs"
          :outputs="currentOutputs"
          @update:inputs="onInputsUpdate"
          @update:outputs="onOutputsUpdate"
          class="frag-io-bar"
        />

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
          class="frag-vue-flow"
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
        :fragment-mode="true"
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
    <div v-else class="frag-empty">
      <i class="pi pi-code text-4xl text-gray-300 mb-3" />
      <span class="text-sm text-gray-400">选择或新建片段来开始编辑</span>
    </div>

    <!-- 新建片段弹窗 -->
    <Dialog v-model:visible="createDialogVisible" header="新建片段" :modal="true" :style="{ width: '360px' }">
      <div class="mb-4">
        <label class="block text-sm text-gray-600 mb-1.5">片段名称</label>
        <InputText class="w-full" v-model="createName" placeholder="请输入片段名称"
          @keydown.enter="confirmCreate" size="small" />
      </div>
      <div class="mb-4">
        <label class="block text-sm text-gray-600 mb-1.5">分组</label>
        <Select class="w-full" v-model="createGroupId" :options="groupOptions" option-label="label"
          option-value="value" placeholder="选择分组（可选）" size="small" />
      </div>
      <template #footer>
        <Button severity="secondary" text label="取消" @click="createDialogVisible = false" />
        <Button label="确定" :disabled="!createName.trim()" @click="confirmCreate" />
      </template>
    </Dialog>

    <!-- 编辑片段弹窗（重命名 + 换分组） -->
    <Dialog v-model:visible="editDialogVisible" header="编辑片段" :modal="true" :style="{ width: '360px' }">
      <div class="mb-4">
        <label class="block text-sm text-gray-600 mb-1.5">片段名称</label>
        <InputText class="w-full" v-model="editName" placeholder="请输入片段名称"
          @keydown.enter="confirmEdit" size="small" />
      </div>
      <div class="mb-4">
        <label class="block text-sm text-gray-600 mb-1.5">分组</label>
        <Select class="w-full" v-model="editGroupId" :options="groupOptions" option-label="label"
          option-value="value" placeholder="选择分组（可选）" size="small" />
      </div>
      <template #footer>
        <Button severity="secondary" text label="取消" @click="editDialogVisible = false" />
        <Button label="确定" :disabled="!editName.trim()" @click="confirmEdit" />
      </template>
    </Dialog>

    <!-- 删除确认弹窗 -->
    <Dialog v-model:visible="deleteDialogVisible" header="确认删除" :modal="true" :style="{ width: '360px' }">
      <p class="text-sm text-gray-600 mb-4">确定要删除片段「{{ deleteTargetName }}」吗？此操作不可撤销。</p>
      <template #footer>
        <Button severity="secondary" text label="取消" @click="deleteDialogVisible = false" />
        <Button severity="danger" label="删除" @click="confirmDelete" />
      </template>
    </Dialog>

    <!-- 分组新建/重命名弹窗 -->
    <Dialog v-model:visible="groupDialogVisible" :header="groupDialogMode === 'create' ? '新建分组' : '重命名分组'"
      :modal="true" :style="{ width: '320px' }">
      <div class="mb-4">
        <label class="block text-sm text-gray-600 mb-1.5">分组名称</label>
        <InputText class="w-full" v-model="groupDialogName" placeholder="请输入分组名称"
          @keydown.enter="confirmGroupDialog" size="small" />
      </div>
      <template #footer>
        <Button severity="secondary" text label="取消" @click="groupDialogVisible = false" />
        <Button label="确定" :disabled="!groupDialogName.trim()" @click="confirmGroupDialog" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, markRaw, onMounted, nextTick } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { VueFlow, useVueFlow, type Connection } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'

import NodePalette from '../components/flow/NodePalette.vue'
import ConfigPanel from '../components/flow/ConfigPanel.vue'
import FragmentIOEditor from '../components/flow/FragmentIOEditor.vue'
import StartNode from '../components/flow/nodes/StartNode.vue'
import ConditionNode from '../components/flow/nodes/ConditionNode.vue'
import LoopNode from '../components/flow/nodes/LoopNode.vue'
import ActionNode from '../components/flow/nodes/ActionNode.vue'
import DataNode from '../components/flow/nodes/DataNode.vue'

import { fragmentApi } from '../api/fragment.js'
import { getNodeTypeDef } from '../flow/nodeTypes.js'
import type {
  Fragment,
  FragmentGroup,
  FragmentParam,
  WorkflowNode as WfNode,
} from '@automan/shared/types.js'

// ── 状态 ─────────────────────────────────────
const nodes = ref<any[]>([])
const edges = ref<any[]>([])
const fragmentList = ref<Fragment[]>([])
const groups = ref<FragmentGroup[]>([])

const { addNodes, addEdges, project, fitView } = useVueFlow()

// ── 节点类型映射（片段编辑器：无 call/endSuccess/endFail/end/return）──
const nodeTypes: Record<string, any> = {
  start: markRaw(StartNode),
  condition: markRaw(ConditionNode),
  loop: markRaw(LoopNode),
  findPic: markRaw(ActionNode),
  ocrWords: markRaw(ActionNode),
  ocrFindStr: markRaw(ActionNode),
  click: markRaw(ActionNode),
  areaClick: markRaw(ActionNode),
  swipe: markRaw(ActionNode),
  delay: markRaw(ActionNode),
  randomDelay: markRaw(ActionNode),
  variable: markRaw(DataNode),
  dice: markRaw(DataNode),
  launchApp: markRaw(ActionNode),
  killApp: markRaw(ActionNode),
  restartApp: markRaw(ActionNode),
  appRunning: markRaw(ConditionNode),
  log: markRaw(ActionNode),
}

const defaultEdgeOpts = {
  type: 'smoothstep',
  style: { stroke: '#94a3b8', strokeWidth: 2 },
}

// ── 当前片段状态 ─────────────────────────────
const currentFragmentId = ref('')
const currentFragmentName = ref('')
const currentGroupId = ref('')
const currentInputs = ref<FragmentParam[]>([])
const currentOutputs = ref<FragmentParam[]>([])
const hasChanges = ref(false)
const selectedNode = ref<WfNode | null>(null)
const showIOEditor = ref(false)

// ── 弹窗 ──
const createDialogVisible = ref(false)
const createName = ref('')
const createGroupId = ref('')
const deleteDialogVisible = ref(false)
const deleteTargetName = ref('')

// ── 编辑片段弹窗 ──
const editDialogVisible = ref(false)
const editFragmentId = ref('')
const editName = ref('')
const editGroupId = ref('')

// ── 分组弹窗 ──
const groupDialogVisible = ref(false)
const groupDialogMode = ref<'create' | 'rename'>('create')
const groupDialogName = ref('')
const groupDialogTargetId = ref('')

// ── 分组选中状态 ──
const selectedGroupId = ref<string | null>(null)

// ── 计算属性 ─────────────────────────────────
const upstreamNodes = computed(() => {
  if (!selectedNode.value) return []
  return nodes.value
    .filter((n) => n.id !== selectedNode.value!.id && n.type !== 'end')
    .map((n) => ({ id: n.id, label: n.label ?? n.data?.label, type: n.type }))
})

const dataNodes = computed(() => {
  const seen = new Set<string>()
  const variableDataNodes = nodes.value
    .filter((n) => {
      if (n.type !== 'variable' || !n.data?.config?.name) return false
      const name = n.data.config.name as string
      if (seen.has(name)) return false
      seen.add(name)
      return true
    })
    .map((n) => ({
      name: n.data.config.name as string,
      label: n.data.label ?? n.type,
      nodeId: n.id,
      scope: (n.data.config.scope as string) ?? 'local',
    }))
  // 将声明的 input 变量加入可选列表，供 variable 节点引用
  const inputNodes = currentInputs.value
    .filter((p) => p.name && !seen.has(p.name))
    .map((p) => ({ name: p.name, label: p.label ?? '入参', nodeId: '__input', scope: 'local' }))
  for (const p of inputNodes) seen.add(p.name)
  // 将声明的 output 变量加入可选列表，供 variable 节点写入
  const outputNodes = currentOutputs.value
    .filter((p) => p.name && !seen.has(p.name))
    .map((p) => ({ name: p.name, label: p.label ?? '输出', nodeId: '__output', scope: 'local' }))
  return [...variableDataNodes, ...inputNodes, ...outputNodes]
})

/** 按当前选中分组过滤片段 */
const filteredFragments = computed(() => {
  if (selectedGroupId.value === null) return fragmentList.value
  return fragmentList.value.filter((f) => (f.groupId || '') === selectedGroupId.value)
})

const groupOptions = computed(() => [
  { label: '未分组', value: '' },
  ...groups.value.map((g) => ({ label: g.name, value: g.id })),
])

/** 各分组下的片段数量 */
const groupCountMap = computed(() => {
  const map: Record<string, number> = {}
  for (const frag of fragmentList.value) {
    const gid = frag.groupId || ''
    map[gid] = (map[gid] || 0) + 1
  }
  return map
})

// ── 生命周期 ─────────────────────────────────
onMounted(async () => {
  await Promise.all([loadGroups(), loadFragmentList()])
})

// ── 数据加载 ─────────────────────────────────
async function loadGroups() {
  const res = await fragmentApi.listGroups()
  if (res.success) groups.value = res.data
}

async function loadFragmentList() {
  const res = await fragmentApi.list()
  if (res.success) fragmentList.value = res.data
}

async function selectFragment(id: string) {
  if (currentFragmentId.value === id) return
  await loadFragment(id)
}

async function loadFragment(id: string) {
  const res = await fragmentApi.get(id)
  if (!res.success) return
  const frag = res.data
  currentFragmentId.value = frag.id
  currentFragmentName.value = frag.name
  currentGroupId.value = frag.groupId || ''
  currentInputs.value = frag.inputs
  currentOutputs.value = frag.outputs

  nodes.value = frag.nodes.map((n) => toFlowNode(n))
  edges.value = frag.edges.map((e) => ({
    id: e.id, source: e.source, target: e.target,
    sourceHandle: e.sourceHandle, type: 'smoothstep',
  }))
  hasChanges.value = false
  selectedNode.value = null
  showIOEditor.value = false
  nextTick(() => fitView({ padding: 0.2 }))
}

// ── 节点转换 ─────────────────────────────────
function toFlowNode(n: WfNode): any {
  return {
    id: n.id, type: n.type, position: n.position,
    data: { label: n.label, type: n.type, config: n.config ?? {}, selected: false },
    deletable: n.type !== 'start',
    draggable: n.type !== 'start',
  }
}

function toWfNode(n: any): WfNode {
  return {
    id: n.id, type: n.type,
    label: n.data?.label ?? n.label ?? n.type,
    position: n.position ?? { x: 0, y: 0 },
    config: n.data?.config ?? {},
  }
}

function toWfEdge(e: any) {
  return { id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle }
}

// ── 画布交互 ─────────────────────────────────
function onNodeClick({ node }: { node: any }) {
  nodes.value.forEach((n) => { if (n.data) n.data.selected = false })
  if (node.data) node.data.selected = true
  selectedNode.value = toWfNode(node)
}

function onPaneClick() {
  nodes.value.forEach((n) => { if (n.data) n.data.selected = false })
  selectedNode.value = null
}

function onConnect(connection: Connection) {
  const id = `e-${connection.source}${connection.sourceHandle ?? ''}-${connection.target}`
  addEdges([{ ...connection, id, type: 'smoothstep' }])
  hasChanges.value = true
}

function markChanged() { hasChanges.value = true }

function onInputsUpdate(val: FragmentParam[]) {
  currentInputs.value = val
  hasChanges.value = true
}

function onOutputsUpdate(val: FragmentParam[]) {
  currentOutputs.value = val
  hasChanges.value = true
}

// ── 拖入添加节点 ────────────────────────────
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
    if (field.default !== undefined) defaultConfig[field.key] = field.default
  }
  if (nodeType === 'variable' && !defaultConfig.name) {
    defaultConfig.name = generateDataId()
  }
  addNodes([{
    id, type: nodeType, position,
    data: { label: def.label, type: nodeType, config: defaultConfig, selected: false },
    deletable: nodeType !== 'start',
  }])
  hasChanges.value = true
}

// ── 配置更新 ─────────────────────────────────
function onConfigUpdate(key: string, value: unknown) {
  if (!selectedNode.value) return
  const node = nodes.value.find((n) => n.id === selectedNode.value!.id)
  if (node?.data) {
    node.data = { ...node.data, config: { ...node.data.config, [key]: value } }
  }
  selectedNode.value = { ...selectedNode.value, config: { ...selectedNode.value.config, [key]: value } }
  hasChanges.value = true
}

function onLabelUpdate(value: string) {
  if (!selectedNode.value) return
  const node = nodes.value.find((n) => n.id === selectedNode.value!.id)
  if (node?.data) node.data = { ...node.data, label: value }
  selectedNode.value = { ...selectedNode.value, label: value }
  hasChanges.value = true
}

// ── CRUD ─────────────────────────────────────
function handleCreate() {
  createName.value = ''
  createGroupId.value = selectedGroupId.value ?? ''
  createDialogVisible.value = true
}

async function confirmCreate() {
  const name = createName.value.trim()
  if (!name) return
  createDialogVisible.value = false
  const groupId = createGroupId.value || undefined
  const res = await fragmentApi.create({ name, groupId })
  if (res.success) {
    await loadFragmentList()
    await loadFragment(res.data.id)
  }
}

function openEditDialogFor(frag: Fragment) {
  editFragmentId.value = frag.id
  editName.value = frag.name
  editGroupId.value = frag.groupId || ''
  editDialogVisible.value = true
}

async function confirmEdit() {
  const name = editName.value.trim()
  if (!name || !editFragmentId.value) return
  editDialogVisible.value = false
  const res = await fragmentApi.save(editFragmentId.value, {
    name,
    groupId: editGroupId.value,
  })
  if (res.success) {
    // 如果编辑的是当前片段，更新当前状态
    if (editFragmentId.value === currentFragmentId.value) {
      currentFragmentName.value = name
      currentGroupId.value = editGroupId.value
    }
    await loadFragmentList()
  }
}

async function handleSave() {
  if (!currentFragmentId.value) return
  const res = await fragmentApi.save(currentFragmentId.value, {
    name: currentFragmentName.value,
    inputs: currentInputs.value,
    outputs: currentOutputs.value,
    nodes: nodes.value.map((n) => toWfNode(n)),
    edges: edges.value.map((e) => toWfEdge(e)),
  })
  if (res.success) {
    hasChanges.value = false
    const item = fragmentList.value.find((f) => f.id === currentFragmentId.value)
    if (item) item.name = res.data.name
  }
}

async function handleDelete() {
  if (!currentFragmentId.value) return
  deleteTargetName.value = currentFragmentName.value
  deleteDialogVisible.value = true
}

async function confirmDelete() {
  deleteDialogVisible.value = false
  const res = await fragmentApi.remove(currentFragmentId.value)
  if (res.success) {
    currentFragmentId.value = ''
    nodes.value = []
    edges.value = []
    selectedNode.value = null
    await loadFragmentList()
  }
}

// ── 分组管理 ─────────────────────────────────
function openCreateGroup() {
  groupDialogMode.value = 'create'
  groupDialogName.value = ''
  groupDialogTargetId.value = ''
  groupDialogVisible.value = true
}

function openRenameGroup(id: string, currentName: string) {
  groupDialogMode.value = 'rename'
  groupDialogName.value = currentName
  groupDialogTargetId.value = id
  groupDialogVisible.value = true
}

async function confirmGroupDialog() {
  const name = groupDialogName.value.trim()
  if (!name) return
  groupDialogVisible.value = false
  if (groupDialogMode.value === 'create') {
    const res = await fragmentApi.createGroup({ name })
    if (res.success) {
      await loadGroups()
      selectedGroupId.value = res.data.id
    }
  } else {
    await fragmentApi.updateGroup({ id: groupDialogTargetId.value, name })
    await loadGroups()
  }
}

async function deleteGroup(id: string) {
  await fragmentApi.deleteGroup(id)
  if (selectedGroupId.value === id) selectedGroupId.value = null
  await loadGroups()
  await loadFragmentList()
}

function generateDataId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return `data_${s}`
}
</script>

<style scoped>
.fragment-view {
  display: flex;
  height: calc(100vh - 3.5rem);
  overflow: hidden;
}

.frag-col {
  display: flex;
  flex-direction: column;
  background: white;
  border-right: 1px solid #e5e7eb;
  flex-shrink: 0;
  overflow: hidden;
}

.frag-col--groups {
  width: 200px;
}

.frag-col--list {
  width: 240px;
}

.frag-col__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px 8px;
  border-bottom: 1px solid #f3f4f6;
  flex-shrink: 0;
}

.frag-col__item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  margin-bottom: 2px;
  position: relative;
}

.frag-col__item:hover { background: #f3f4f6; }
.frag-col__item.is-active { background: #eff6ff; color: #2563eb; font-weight: 500; }

.frag-col__badge {
  margin-left: auto;
  font-size: 10px;
  color: #9ca3af;
  background: #f3f4f6;
  border-radius: 8px;
  padding: 0 5px;
  line-height: 1.6;
}

.frag-col__edit,
.frag-col__del {
  opacity: 0;
  transition: opacity 0.15s;
  padding: 0 !important;
  width: 18px !important;
  height: 18px !important;
}

.frag-col__item:hover .frag-col__edit,
.frag-col__item:hover .frag-col__del {
  opacity: 1;
}

.frag-canvas {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
}

.frag-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.frag-toolbar__name {
  max-width: 200px;
}

.frag-io-bar {
  padding: 8px 12px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.frag-vue-flow { flex: 1; background: #fafafa; }

.frag-empty {
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
