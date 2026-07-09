// ─────────────────────────────────────────────
// useSelection — 框选交互 composable
// 职责：拖拽框选、移动、缩放、坐标换算、复制、保存选区
// ─────────────────────────────────────────────

import { ref, computed, type Ref } from 'vue'
import type { ScreenshotResponse } from '@automan/shared/types.js'

// ── 类型 ──
export type DragMode = 'none' | 'new' | 'move' | 'resize'
export type HandleType = 'corner' | 'edge'
export type HandleId = 'tl' | 'tr' | 'bl' | 'br' | 'top' | 'bottom' | 'left' | 'right'
export interface Box {
  left: number
  top: number
  width: number
  height: number
}
export interface Selection {
  x1: number
  y1: number
  x2: number
  y2: number
}

const SNAP_THRESHOLD = 5
const MIN_BOX_SIZE = 10

// ── 缩放手柄定义 ──
export const CORNER_HANDLES = [
  { id: 'tl' as HandleId, pos: { left: '0', top: '0' }, cursor: 'nwse-resize' },
  { id: 'tr' as HandleId, pos: { left: '100%', top: '0' }, cursor: 'nesw-resize' },
  { id: 'bl' as HandleId, pos: { left: '0', top: '100%' }, cursor: 'nesw-resize' },
  { id: 'br' as HandleId, pos: { left: '100%', top: '100%' }, cursor: 'nwse-resize' },
]

export const EDGE_HANDLES = [
  { id: 'top' as HandleId, pos: { left: '50%', top: '0', marginLeft: '-12px', marginTop: '-3px' }, size: { width: '24px', height: '6px' }, cursor: 'ns-resize' },
  { id: 'bottom' as HandleId, pos: { left: '50%', top: '100%', marginLeft: '-12px', marginTop: '-3px' }, size: { width: '24px', height: '6px' }, cursor: 'ns-resize' },
  { id: 'left' as HandleId, pos: { left: '0', top: '50%', marginLeft: '-3px', marginTop: '-12px' }, size: { width: '6px', height: '24px' }, cursor: 'ew-resize' },
  { id: 'right' as HandleId, pos: { left: '100%', top: '50%', marginLeft: '-3px', marginTop: '-12px' }, size: { width: '6px', height: '24px' }, cursor: 'ew-resize' },
]

/**
 * 框选交互 composable
 * @param screenshot 截图数据 ref
 * @param imgDisplaySize 图片显示尺寸 ref
 * @param canvasContainer 画布容器 DOM ref
 */
export function useSelection(
  screenshot: Ref<ScreenshotResponse | null>,
  imgDisplaySize: Ref<{ width: number; height: number }>,
  canvasContainer: Ref<HTMLElement | undefined>,
) {
  // ── 状态 ──
  const dragMode = ref<DragMode>('none')
  const dragStart = ref({ x: 0, y: 0 })
  const moveOffset = ref({ x: 0, y: 0 })
  const moveInitialBox = ref<Box | null>(null)
  const resizeHandle = ref<HandleId>('tl')
  const resizeHandleType = ref<HandleType>('corner')
  const resizeInitialBox = ref<Box | null>(null)
  const selectionBox = ref<Box | null>(null)
  const selection = ref<Selection | null>(null)
  const copied = ref(false)
  let copyTimer: ReturnType<typeof setTimeout> | null = null

  // ── 计算属性 ──
  const containerCursor = computed(() => {
    if (dragMode.value === 'move') return 'grabbing'
    if (dragMode.value === 'resize') return getResizeCursor(resizeHandle.value)
    return 'crosshair'
  })

  const scaleX = computed(() =>
    screenshot.value && imgDisplaySize.value.width
      ? screenshot.value.width / imgDisplaySize.value.width
      : 1,
  )
  const scaleY = computed(() =>
    screenshot.value && imgDisplaySize.value.height
      ? screenshot.value.height / imgDisplaySize.value.height
      : 1,
  )

  const displayCoords = computed<Selection>(() => {
    if (selection.value) return selection.value
    return { x1: 0, y1: 0, x2: 0, y2: 0 }
  })

  const origWidth = computed(() => {
    if (selection.value) return selection.value.x2 - selection.value.x1
    return screenshot.value ? screenshot.value.width : 0
  })
  const origHeight = computed(() => {
    if (selection.value) return selection.value.y2 - selection.value.y1
    return screenshot.value ? screenshot.value.height : 0
  })

  // ── 工具函数 ──
  function getResizeCursor(id: HandleId): string {
    const map: Record<HandleId, string> = {
      tl: 'nwse-resize', br: 'nwse-resize',
      tr: 'nesw-resize', bl: 'nesw-resize',
      top: 'ns-resize', bottom: 'ns-resize',
      left: 'ew-resize', right: 'ew-resize',
    }
    return map[id]
  }

  function getRelativePos(e: MouseEvent): { x: number; y: number } {
    const rect = canvasContainer.value!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function snapToEdge(box: Box) {
    const imgW = imgDisplaySize.value.width
    const imgH = imgDisplaySize.value.height
    if (box.left < SNAP_THRESHOLD) box.left = 0
    if (box.top < SNAP_THRESHOLD) box.top = 0
    if (imgW - (box.left + box.width) < SNAP_THRESHOLD) box.left = imgW - box.width
    if (imgH - (box.top + box.height) < SNAP_THRESHOLD) box.top = imgH - box.height
  }

  function updateSelectionFromBox(box: Box) {
    selection.value = {
      x1: Math.round(box.left * scaleX.value),
      y1: Math.round(box.top * scaleY.value),
      x2: Math.round((box.left + box.width) * scaleX.value),
      y2: Math.round((box.top + box.height) * scaleY.value),
    }
  }

  // ── 缩放计算 ──
  function calcProportionalResize(dx: number, dy: number): Box {
    const init = resizeInitialBox.value!
    const ratio = init.width / init.height
    const id = resizeHandle.value

    let delta: number
    if (id === 'br') delta = Math.max(dx, dy)
    else if (id === 'bl') delta = Math.max(-dx, dy)
    else if (id === 'tr') delta = Math.max(dx, -dy)
    else delta = Math.max(-dx, -dy)

    let newW = Math.max(MIN_BOX_SIZE, init.width + delta)
    let newH = newW / ratio

    const imgW = imgDisplaySize.value.width
    const imgH = imgDisplaySize.value.height
    if (newW > imgW) { newW = imgW; newH = newW / ratio }
    if (newH > imgH) { newH = imgH; newW = newH * ratio }

    let newLeft = init.left
    let newTop = init.top
    if (id === 'tl' || id === 'bl') newLeft = init.left + init.width - newW
    if (id === 'tl' || id === 'tr') newTop = init.top + init.height - newH

    newLeft = Math.max(0, newLeft)
    newTop = Math.max(0, newTop)

    return { left: newLeft, top: newTop, width: newW, height: newH }
  }

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

  // ── 鼠标事件 ──
  function onContainerMouseDown(e: MouseEvent) {
    if (!screenshot.value) return
    const pos = getRelativePos(e)
    dragMode.value = 'new'
    dragStart.value = pos
    selectionBox.value = { left: pos.x, top: pos.y, width: 0, height: 0 }
    selection.value = null
  }

  function onBoxMouseDown(e: MouseEvent) {
    if (!screenshot.value || !selectionBox.value) return
    const pos = getRelativePos(e)
    dragMode.value = 'move'
    moveOffset.value = { x: pos.x - selectionBox.value.left, y: pos.y - selectionBox.value.top }
    moveInitialBox.value = { ...selectionBox.value }
  }

  function onHandleMouseDown(e: MouseEvent, type: HandleType, id: HandleId) {
    if (!screenshot.value || !selectionBox.value) return
    const pos = getRelativePos(e)
    dragMode.value = 'resize'
    resizeHandle.value = id
    resizeHandleType.value = type
    dragStart.value = pos
    resizeInitialBox.value = { ...selectionBox.value }
  }

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
      const box = resizeHandleType.value === 'corner'
        ? calcProportionalResize(dx, dy)
        : calcEdgeResize(dx, dy)
      snapToEdge(box)
      selectionBox.value = box
      updateSelectionFromBox(box)
    }
  }

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

  // ── 操作 ──
  async function copyCoords() {
    const coords = displayCoords.value
    const text = `[${coords.x1},${coords.y1},${coords.x2},${coords.y2}]`
    await navigator.clipboard.writeText(text)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copied.value = false }, 1000)
  }

  function clearSelection() {
    selection.value = null
    selectionBox.value = null
  }

  function saveSelection() {
    if (!screenshot.value || !selection.value) return
    const { x1, y1, x2, y2 } = selection.value
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = x2 - x1
      canvas.height = y2 - y1
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, x1, y1, x2 - x1, y2 - y1, 0, 0, x2 - x1, y2 - y1)
      canvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `selection_${x1}_${y1}_${x2}_${y2}.png`
        a.click()
        URL.revokeObjectURL(url)
      }, 'image/png')
    }
    img.src = screenshot.value.image
  }

  return {
    // 状态
    dragMode,
    selectionBox,
    selection,
    copied,
    // 计算属性
    containerCursor,
    displayCoords,
    origWidth,
    origHeight,
    scaleX,
    scaleY,
    // 事件处理
    onContainerMouseDown,
    onBoxMouseDown,
    onHandleMouseDown,
    onMouseMove,
    onMouseUp,
    // 操作
    copyCoords,
    clearSelection,
    saveSelection,
  }
}
