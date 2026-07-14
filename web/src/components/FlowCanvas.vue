<template>
  <div class="flow-canvas-wrapper" :class="{ 'is-collapsed': collapsed }">
    <div class="flow-canvas">
      <VueFlow
        v-model:nodes="innerNodes"
        v-model:edges="innerEdges"
        :node-types="nodeTypes"
        :default-edge-options="defaultEdgeOpts"
        :fit-view-on-init="false"
        :snap-to-grid="true"
        :snap-grid="[16, 16]"
        :nodes-draggable="true"
        :nodes-connectable="false"
        :elements-selectable="true"
        :delete-key-code="null"
        class="flow-canvas__vue-flow"
      >
        <Background :gap="16" />
        <Controls :show-interactive="false" />
      </VueFlow>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, markRaw, nextTick } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'

import StartNode from './flow/nodes/StartNode.vue'
import EndNode from './flow/nodes/EndNode.vue'
import EndSuccessNode from './flow/nodes/EndSuccessNode.vue'
import EndFailNode from './flow/nodes/EndFailNode.vue'
import ConditionNode from './flow/nodes/ConditionNode.vue'
import LoopNode from './flow/nodes/LoopNode.vue'
import ActionNode from './flow/nodes/ActionNode.vue'
import DataNode from './flow/nodes/DataNode.vue'
import type { WorkflowNode, WorkflowEdge } from '@automan/shared/types.js'
import { getNodeTypeDef } from '../flow/nodeTypes.js'

const props = defineProps<{
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  collapsed?: boolean
}>()

// ── Vue Flow ──
const innerNodes = ref<any[]>([])
const innerEdges = ref<any[]>([])
const { fitView } = useVueFlow()

const nodeTypes: Record<string, any> = {
  start: markRaw(StartNode),
  end: markRaw(EndNode),
  endSuccess: markRaw(EndSuccessNode),
  endFail: markRaw(EndFailNode),
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

// ── 外部 nodes/edges → 内部 VueFlow 节点 ──
function toFlowNode(n: WorkflowNode): any {
  const def = getNodeTypeDef(n.type)
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
    deletable: false,
    draggable: true,
  }
}

watch(
  () => [props.nodes, props.edges],
  () => {
    innerNodes.value = props.nodes.map((n) => toFlowNode(n))
    innerEdges.value = props.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      type: 'smoothstep',
    }))
    nextTick(() => fitView({ padding: 0.2 }))
  },
  { immediate: true, deep: true },
)
</script>

<style scoped>
.flow-canvas-wrapper {
  position: relative;
  width: 50%;
  min-width: 50%;
  flex-shrink: 0;
  transition: width 0.25s, min-width 0.25s;
}

.flow-canvas-wrapper.is-collapsed {
  width: 0;
  min-width: 0;
}

.flow-canvas {
  width: 100%;
  height: 100%;
  border-right: 1px solid #e5e7eb;
  background: #fafafa;
  overflow: hidden;
}

.flow-canvas__vue-flow {
  width: 100%;
  height: 100%;
}
</style>

<!-- 全局节点样式（与 FlowView 共享） -->
<style>
.flow-node {
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 12px;
  min-width: 140px;
  font-size: 13px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.flow-node--start { border-color: #22c55e; }
.flow-node--end { border-color: #ef4444; }
.flow-node__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.flow-node__icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.flow-node__label {
  font-size: 13px;
  font-weight: 500;
  color: #1f2937;
  white-space: nowrap;
}
.flow-node__outputs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.flow-node__output {
  font-size: 11px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 1px 6px;
  border-radius: 4px;
}
.flow-node__var-name {
  margin-top: 4px;
}
.flow-node__action {
  margin-top: 2px;
}
.flow-node--loop {
  border-color: #0891b2;
  min-width: 160px;
}
</style>
