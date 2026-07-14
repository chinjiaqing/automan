<template>
  <aside class="node-palette">
    <h3 class="text-sm font-semibold text-gray-600 px-3 py-2 border-b border-gray-100">节点</h3>
    <div class="overflow-y-auto flex-1">
      <div v-for="(nodes, category) in grouped" :key="category" class="px-2 py-2">
        <div class="text-xs text-gray-400 uppercase tracking-wide px-1 mb-1">
          {{ categoryLabels[category] }}
        </div>
        <div
          v-for="node in nodes"
          :key="node.type"
          class="node-palette__item"
          draggable="true"
          @dragstart="onDragStart($event, node)"
        >
          <i :class="`pi ${node.icon} text-sm`" />
          <span class="text-sm">{{ node.label }}</span>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getNodeTypesByCategory } from '../../flow/nodeTypes.js'
import type { NodeTypeDefinition } from '@automan/shared/types.js'

const props = withDefaults(defineProps<{
  /** 排除的节点类型（如 workflow 编辑器排除 return，片段编辑器排除 call） */
  excludeTypes?: string[]
  /** 仅展示的分类（不传则展示全部） */
  onlyCategories?: string[]
}>(), {
  excludeTypes: () => [],
})

const categoryLabels: Record<string, string> = {
  flow: '流程控制',
  action: '动作',
  data: '数据',
  app: '应用',
  debug: '调试',
  fragment: '片段',
}

const grouped = computed(() => {
  const all = getNodeTypesByCategory()
  const result: Record<string, NodeTypeDefinition[]> = {}
  for (const [cat, nodes] of Object.entries(all)) {
    if (props.onlyCategories && !props.onlyCategories.includes(cat)) continue
    const filtered = nodes.filter((n) => !props.excludeTypes.includes(n.type))
    if (filtered.length > 0) result[cat] = filtered
  }
  return result
})

function onDragStart(event: DragEvent, nodeDef: NodeTypeDefinition) {
  if (!event.dataTransfer) return
  event.dataTransfer.setData('application/automan-node-type', nodeDef.type)
  event.dataTransfer.effectAllowed = 'move'
}
</script>

<style scoped>
.node-palette {
  display: flex;
  flex-direction: column;
  width: 200px;
  background: white;
  border-right: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.node-palette__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: grab;
  transition: background 0.15s;
  color: #374151;
}

.node-palette__item:hover {
  background: #f3f4f6;
}

.node-palette__item:active {
  cursor: grabbing;
}
</style>
