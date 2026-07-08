<template>
  <div class="h-full flex">
    <!-- 左侧操作区 -->
    <div class="w-60 flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto p-4 flex flex-col gap-4">
      <!-- 设备选择 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">当前设备</label>
        <select v-model="selectedDeviceId" class="input-base">
          <option value="">请选择设备</option>
          <option v-for="d in devices" :key="d.id" :value="d.id">
            {{ d.name }}
          </option>
        </select>
      </div>

      <!-- 截屏按钮 -->
      <button
        class="btn-primary w-full flex items-center justify-center gap-2"
        :disabled="!selectedDeviceId || capturing"
        @click="handleCapture"
      >
        <i :class="capturing ? 'pi pi-spinner pi-spin' : 'pi pi-camera'" />
        {{ capturing ? '截屏中...' : '截屏' }}
      </button>

      <!-- 框选坐标（常显，上下布局） -->
      <div class="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs text-gray-500">当前选中：</span>
          <div class="flex items-center gap-2">
            <button class="text-brand-600 hover:text-brand-700 transition-colors" title="复制坐标" @click="copyCoords">
              <i :class="copied ? 'pi pi-check text-green-500' : 'pi pi-copy'" class="text-xs" />
            </button>
            <button v-if="selection || selectionBox" class="text-gray-500 hover:text-gray-700 transition-colors" title="清除选区" @click="clearSelection">
              <i class="pi pi-times text-xs" />
            </button>
          </div>
        </div>
        <code class="text-brand-700 font-mono text-xs block mb-1">
          [{{ displayCoords.x1 }},{{ displayCoords.y1 }},{{ displayCoords.x2 }},{{ displayCoords.y2 }}]
        </code>
        <div class="text-xs text-gray-400">
          宽 {{ origWidth }} × 高 {{ origHeight }}
          <span v-if="!selection" class="text-gray-500 ml-1">(全屏)</span>
        </div>
      </div>

      <!-- Tab: 找图 / OCR -->
      <div class="flex-1 flex flex-col">
        <div class="flex border-b border-gray-200 mb-3">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="flex-1 py-2 text-sm text-center transition-colors border-b-2"
            :class="activeTab === tab.key
              ? 'text-brand-600 border-brand-600 font-medium'
              : 'text-gray-500 border-transparent hover:text-gray-700'"
            @click="activeTab = tab.key"
          >
            <i :class="`pi ${tab.icon} mr-1`" />
            {{ tab.label }}
          </button>
        </div>

        <!-- 找图 Tab -->
        <div v-if="activeTab === 'find'" class="flex flex-col gap-3">
          <button class="btn-ghost w-full flex items-center justify-center gap-2 border border-dashed border-gray-300 py-4" @click="handleUploadImage">
            <i class="pi pi-upload" />
            上传目标图片
          </button>
          <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileSelected" />
          <div v-if="findResults.length > 0" class="flex flex-col gap-1">
            <span class="text-xs text-gray-500">匹配结果：</span>
            <div v-for="(r, i) in findResults" :key="i" class="text-xs bg-gray-50 px-2 py-1 rounded">
              #{{ i + 1 }}: ({{ r.x }}, {{ r.y }}) 置信度 {{ r.confidence }}
            </div>
          </div>
          <div v-else class="text-xs text-gray-400 text-center py-2">
            暂无匹配结果
          </div>
        </div>

        <!-- OCR Tab -->
        <div v-if="activeTab === 'ocr'" class="flex flex-col gap-3">
          <button
            class="btn-primary w-full flex items-center justify-center gap-2"
            :disabled="!screenshot || !selection"
            @click="handleOcr"
          >
            <i class="pi pi-search" />
            {{ selection ? '识别选区' : '请先框选区域' }}
          </button>
          <div v-if="ocrResult" class="text-sm bg-gray-50 p-3 rounded max-h-40 overflow-y-auto whitespace-pre-wrap">
            {{ ocrResult }}
          </div>
          <div v-else class="text-xs text-gray-400 text-center py-2">
            暂无识别结果
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧截屏区 -->
    <div class="flex-1 flex items-center justify-center bg-gray-100 overflow-auto p-4">
      <div v-if="!screenshot" class="text-center text-gray-400">
        <i class="pi pi-image text-6xl mb-3 block" />
        <p>选择设备并点击截屏开始</p>
      </div>

      <div
        v-else
        ref="canvasContainer"
        class="relative select-none"
        :style="{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          cursor: containerCursor,
        }"
        @mousedown="onContainerMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
      >
        <!-- 截图（禁止拖拽选中） -->
        <img
          :src="screenshot.image"
          :style="{ maxWidth: '100%', maxHeight: 'calc(100vh - 120px)' }"
          class="block pointer-events-none"
          style="user-select: none; -webkit-user-drag: none;"
          draggable="false"
          @load="onImageLoad"
        />

        <!-- 框选高亮蒙层 -->
        <div
          v-if="selectionBox"
          class="absolute"
          :style="{
            left: `${selectionBox.left}px`,
            top: `${selectionBox.top}px`,
            width: `${selectionBox.width}px`,
            height: `${selectionBox.height}px`,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
            border: '2px solid #3b82f6',
            outline: '1px solid rgba(255,255,255,0.8)',
            cursor: dragMode === 'move' ? 'grabbing' : 'move',
            zIndex: 10,
          }"
          @mousedown.stop="onBoxMouseDown"
        >
          <!-- 四角等比缩放手柄 -->
          <div
            v-for="h in cornerHandles"
            :key="h.id"
            class="absolute w-3 h-3 bg-brand-500 border-2 border-white rounded-full shadow-sm"
            :style="{
              ...h.pos,
              cursor: h.cursor,
              zIndex: 20,
              marginLeft: '-6px',
              marginTop: '-6px',
            }"
            @mousedown.stop="onHandleMouseDown($event, 'corner', h.id)"
          />

          <!-- 四边单向缩放手柄 -->
          <div
            v-for="h in edgeHandles"
            :key="h.id"
            class="absolute bg-white/80 border border-brand-400 rounded-sm"
            :style="{
              ...h.pos,
              ...h.size,
              cursor: h.cursor,
              zIndex: 20,
            }"
            @mousedown.stop="onHandleMouseDown($event, 'edge', h.id)"
          />

          <!-- 宽度标签（上边线上方居中） -->
          <span
            class="absolute left-1/2 -translate-x-1/2 bg-black/75 text-white text-xs px-1.5 py-0.5 rounded whitespace-nowrap leading-tight"
            :style="{ top: '-22px' }"
          >{{ Math.round(selectionBox.width) }}px</span>

          <!-- 高度标签（右边线右侧居中） -->
          <span
            class="absolute top-1/2 -translate-y-1/2 bg-black/75 text-white text-xs px-1.5 py-0.5 rounded whitespace-nowrap leading-tight"
            :style="{ left: 'calc(100% + 6px)' }"
          >{{ Math.round(selectionBox.height) }}px</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { ScreenshotResponse } from '@automan/shared/types.js'
import { deviceApi } from '../api/device.js'
import { useDevices } from '../composables/useDevices.js'

const { devices, fetchDevices } = useDevices()

// 设备选择
const selectedDeviceId = ref('')

// 截屏
const screenshot = ref<ScreenshotResponse | null>(null)
const capturing = ref(false)
const canvasContainer = ref<HTMLElement>()
const imgDisplaySize = ref({ width: 0, height: 0 })

// ── 框选状态 ──
type DragMode = 'none' | 'new' | 'move' | 'resize'
type HandleType = 'corner' | 'edge'
type HandleId = 'tl' | 'tr' | 'bl' | 'br' | 'top' | 'bottom' | 'left' | 'right'

const dragMode = ref<DragMode>('none')
const dragStart = ref({ x: 0, y: 0 })
const moveOffset = ref({ x: 0, y: 0 })
const moveInitialBox = ref<Box | null>(null)
const resizeHandle = ref<HandleId>('tl')
const resizeHandleType = ref<HandleType>('corner')
const resizeInitialBox = ref<Box | null>(null)

interface Box { left: number; top: number; width: number; height: number }
const selectionBox = ref<Box | null>(null)
const selection = ref<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

// 容器光标
const containerCursor = computed(() => {
  if (dragMode.value === 'move') return 'grabbing'
  if (dragMode.value === 'resize') return getResizeCursor(resizeHandle.value)
  return 'crosshair'
})

// ── 缩放手柄定义 ──
const cornerHandles = [
  { id: 'tl' as HandleId, pos: { left: '0', top: '0' }, cursor: 'nwse-resize' },
  { id: 'tr' as HandleId, pos: { left: '100%', top: '0' }, cursor: 'nesw-resize' },
  { id: 'bl' as HandleId, pos: { left: '0', top: '100%' }, cursor: 'nesw-resize' },
  { id: 'br' as HandleId, pos: { left: '100%', top: '100%' }, cursor: 'nwse-resize' },
]
const edgeHandles = [
  { id: 'top' as HandleId, pos: { left: '50%', top: '0', marginLeft: '-12px', marginTop: '-3px' }, size: { width: '24px', height: '6px' }, cursor: 'ns-resize' },
  { id: 'bottom' as HandleId, pos: { left: '50%', top: '100%', marginLeft: '-12px', marginTop: '-3px' }, size: { width: '24px', height: '6px' }, cursor: 'ns-resize' },
  { id: 'left' as HandleId, pos: { left: '0', top: '50%', marginLeft: '-3px', marginTop: '-12px' }, size: { width: '6px', height: '24px' }, cursor: 'ew-resize' },
  { id: 'right' as HandleId, pos: { left: '100%', top: '50%', marginLeft: '-3px', marginTop: '-12px' }, size: { width: '6px', height: '24px' }, cursor: 'ew-resize' },
]

function getResizeCursor(id: HandleId): string {
  const map: Record<HandleId, string> = {
    tl: 'nwse-resize', br: 'nwse-resize',
    tr: 'nesw-resize', bl: 'nesw-resize',
    top: 'ns-resize', bottom: 'ns-resize',
    left: 'ew-resize', right: 'ew-resize',
  }
  return map[id]
}

// ── 比例/坐标计算 ──
const scaleX = computed(() => screenshot.value && imgDisplaySize.value.width
  ? screenshot.value.width / imgDisplaySize.value.width : 1)
const scaleY = computed(() => screenshot.value && imgDisplaySize.value.height
  ? screenshot.value.height / imgDisplaySize.value.height : 1)
// 显示坐标：有选区显示实际坐标，无选区显示 [0,0,0,0] 表示全屏
const displayCoords = computed(() => {
  if (selection.value) return selection.value
  return { x1: 0, y1: 0, x2: 0, y2: 0 }
})

// 原始分辨率宽高：有选区显示选区尺寸，无选区显示全屏尺寸
const origWidth = computed(() => {
  if (selection.value) return selection.value.x2 - selection.value.x1
  return screenshot.value ? screenshot.value.width : 0
})
const origHeight = computed(() => {
  if (selection.value) return selection.value.y2 - selection.value.y1
  return screenshot.value ? screenshot.value.height : 0
})

const SNAP_THRESHOLD = 5
const MIN_BOX_SIZE = 10

// Tab
const tabs = [
  { key: 'find', label: '找图', icon: 'pi-search' },
  { key: 'ocr', label: 'OCR', icon: 'pi-file-edit' },
]
const activeTab = ref('find')

// 找图
const fileInput = ref<HTMLInputElement>()
const findResults = ref<{ x: number; y: number; confidence: number }[]>([])

// OCR
const ocrResult = ref('')

// 加载设备列表，默认选中第一个
onMounted(async () => {
  await fetchDevices()
  if (devices.value.length > 0) {
    selectedDeviceId.value = devices.value[0].id
  }
})

// 截屏
async function handleCapture() {
  if (!selectedDeviceId.value) return
  capturing.value = true
  selection.value = null
  selectionBox.value = null
  try {
    const res = await deviceApi.screenshot(selectedDeviceId.value)
    if (res.success) {
      screenshot.value = res.data
    } else {
      alert('message' in res ? res.message : '截屏失败')
    }
  } catch (err) {
    alert('截屏请求失败')
  } finally {
    capturing.value = false
  }
}

// 图片加载完成
function onImageLoad(e: Event) {
  const img = e.target as HTMLImageElement
  imgDisplaySize.value = { width: img.clientWidth, height: img.clientHeight }
}

// 坐标工具
function getRelativePos(e: MouseEvent): { x: number; y: number } {
  const rect = canvasContainer.value!.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

// 贴边修正
function snapToEdge(box: Box) {
  const imgW = imgDisplaySize.value.width
  const imgH = imgDisplaySize.value.height
  if (box.left < SNAP_THRESHOLD) box.left = 0
  if (box.top < SNAP_THRESHOLD) box.top = 0
  if (imgW - (box.left + box.width) < SNAP_THRESHOLD) box.left = imgW - box.width
  if (imgH - (box.top + box.height) < SNAP_THRESHOLD) box.top = imgH - box.height
}

// 根据 display box 更新原始坐标
function updateSelectionFromBox(box: Box) {
  selection.value = {
    x1: Math.round(box.left * scaleX.value),
    y1: Math.round(box.top * scaleY.value),
    x2: Math.round((box.left + box.width) * scaleX.value),
    y2: Math.round((box.top + box.height) * scaleY.value),
  }
}

// ── 容器 mousedown：新建框选 ──
function onContainerMouseDown(e: MouseEvent) {
  if (!screenshot.value) return
  const pos = getRelativePos(e)
  dragMode.value = 'new'
  dragStart.value = pos
  selectionBox.value = { left: pos.x, top: pos.y, width: 0, height: 0 }
  selection.value = null
}

// ── 选框内部 mousedown：拖动移动 ──
function onBoxMouseDown(e: MouseEvent) {
  if (!screenshot.value || !selectionBox.value) return
  const pos = getRelativePos(e)
  dragMode.value = 'move'
  moveOffset.value = {
    x: pos.x - selectionBox.value.left,
    y: pos.y - selectionBox.value.top,
  }
  moveInitialBox.value = { ...selectionBox.value }
}

// ── 缩放手柄 mousedown ──
function onHandleMouseDown(e: MouseEvent, type: HandleType, id: HandleId) {
  if (!screenshot.value || !selectionBox.value) return
  const pos = getRelativePos(e)
  dragMode.value = 'resize'
  resizeHandle.value = id
  resizeHandleType.value = type
  dragStart.value = pos
  resizeInitialBox.value = { ...selectionBox.value }
}

// ── 缩放计算：等比（顶点） ──
function calcProportionalResize(dx: number, dy: number): Box {
  const init = resizeInitialBox.value!
  const ratio = init.width / init.height
  const id = resizeHandle.value

  // 根据角点方向确定主方向 delta
  let delta: number
  if (id === 'br') delta = Math.max(dx, dy)
  else if (id === 'bl') delta = Math.max(-dx, dy)
  else if (id === 'tr') delta = Math.max(dx, -dy)
  else delta = Math.max(-dx, -dy) // tl

  let newW = Math.max(MIN_BOX_SIZE, init.width + delta)
  let newH = newW / ratio

  // 确保不超出图片
  const imgW = imgDisplaySize.value.width
  const imgH = imgDisplaySize.value.height
  if (newW > imgW) { newW = imgW; newH = newW / ratio }
  if (newH > imgH) { newH = imgH; newW = newH * ratio }

  let newLeft = init.left
  let newTop = init.top
  if (id === 'tl' || id === 'bl') newLeft = init.left + init.width - newW
  if (id === 'tl' || id === 'tr') newTop = init.top + init.height - newH

  // 限制不超出边界
  newLeft = Math.max(0, newLeft)
  newTop = Math.max(0, newTop)

  return { left: newLeft, top: newTop, width: newW, height: newH }
}

// ── 缩放计算：单向（边线） ──
function calcEdgeResize(dx: number, dy: number): Box {
  const init = resizeInitialBox.value!
  const id = resizeHandle.value
  const imgW = imgDisplaySize.value.width
  const imgH = imgDisplaySize.value.height

  const box = { ...init }

  if (id === 'left') {
    const maxDx = init.width - MIN_BOX_SIZE
    const clampedDx = Math.max(-init.left, Math.min(dx, maxDx))
    box.left = init.left + clampedDx
    box.width = init.width - clampedDx
  } else if (id === 'right') {
    const maxDx = imgW - init.left - init.width
    const clampedDx = Math.max(MIN_BOX_SIZE - init.width, Math.min(dx, maxDx))
    box.width = init.width + clampedDx
  } else if (id === 'top') {
    const maxDy = init.height - MIN_BOX_SIZE
    const clampedDy = Math.max(-init.top, Math.min(dy, maxDy))
    box.top = init.top + clampedDy
    box.height = init.height - clampedDy
  } else if (id === 'bottom') {
    const maxDy = imgH - init.top - init.height
    const clampedDy = Math.max(MIN_BOX_SIZE - init.height, Math.min(dy, maxDy))
    box.height = init.height + clampedDy
  }

  return box
}

// ── mousemove ──
function onMouseMove(e: MouseEvent) {
  if (dragMode.value === 'none' || !screenshot.value) return
  const pos = getRelativePos(e)
  const imgW = imgDisplaySize.value.width
  const imgH = imgDisplaySize.value.height

  if (dragMode.value === 'new') {
    const x1 = Math.max(0, Math.min(dragStart.value.x, pos.x))
    const y1 = Math.max(0, Math.min(dragStart.value.y, pos.y))
    const x2 = Math.min(imgW, Math.max(dragStart.value.x, pos.x))
    const y2 = Math.min(imgH, Math.max(dragStart.value.y, pos.y))
    selectionBox.value = { left: x1, top: y1, width: x2 - x1, height: y2 - y1 }

  } else if (dragMode.value === 'move' && moveInitialBox.value) {
    const box = {
      left: pos.x - moveOffset.value.x,
      top: pos.y - moveOffset.value.y,
      width: moveInitialBox.value.width,
      height: moveInitialBox.value.height,
    }
    box.left = Math.max(0, Math.min(box.left, imgW - box.width))
    box.top = Math.max(0, Math.min(box.top, imgH - box.height))
    snapToEdge(box)
    selectionBox.value = box
    updateSelectionFromBox(box)

  } else if (dragMode.value === 'resize' && resizeInitialBox.value) {
    const dx = pos.x - dragStart.value.x
    const dy = pos.y - dragStart.value.y
    let box: Box
    if (resizeHandleType.value === 'corner') {
      box = calcProportionalResize(dx, dy)
    } else {
      box = calcEdgeResize(dx, dy)
    }
    snapToEdge(box)
    selectionBox.value = box
    updateSelectionFromBox(box)
  }
}

// ── mouseup ──
function onMouseUp() {
  if (dragMode.value === 'none' || !screenshot.value) return

  if (dragMode.value === 'new') {
    const box = selectionBox.value
    if (!box || box.width < 5 || box.height < 5) {
      selectionBox.value = null
      selection.value = null
    } else {
      snapToEdge(box)
      selectionBox.value = { ...box }
      updateSelectionFromBox(box)
    }
  }

  dragMode.value = 'none'
  moveInitialBox.value = null
  resizeInitialBox.value = null
}

// 复制反馈
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

// 复制坐标
async function copyCoords() {
  const coords = displayCoords.value
  const text = `${coords.x1},${coords.y1},${coords.x2},${coords.y2}`
  await navigator.clipboard.writeText(text)
  // 显示复制成功反馈
  copied.value = true
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copied.value = false
  }, 1000)
}

// 清除选区，恢复到全屏 [0,0,0,0]
function clearSelection() {
  selection.value = null
  selectionBox.value = null
}

// 上传图片（找图）
function handleUploadImage() {
  fileInput.value?.click()
}

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  alert('找图功能待实现')
}

// OCR
async function handleOcr() {
  alert('OCR 功能待实现')
}
</script>
