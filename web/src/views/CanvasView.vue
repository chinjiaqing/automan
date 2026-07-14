<template>
  <div class="h-full flex">
    <!-- 左侧操作区 -->
    <div class="w-60 flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto p-4 flex flex-col gap-4">
      <!-- 设备选择 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">当前设备</label>
        <Select
          v-model="selectedDeviceId"
          :options="devices"
          option-label="name"
          option-value="id"
          placeholder="请选择设备"
          class="w-full"
          size="small"
        />
      </div>

      <!-- 截屏按钮 -->
      <Button
        class="w-full"
        :icon="capturing ? 'pi pi-spinner pi-spin' : 'pi pi-camera'"
        :label="capturing ? '截屏中...' : '截屏'"
        :disabled="!selectedDeviceId || capturing"
        @click="handleCapture"
        size="small"
      />

      <!-- 框选坐标（常显） -->
      <div class="bg-brand-50 border border-brand-200 rounded-md px-3 py-2">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs text-gray-500">当前选中：</span>
          <div class="flex items-center gap-2">
            <Button text severity="secondary" size="small" :icon="copied ? 'pi pi-check' : 'pi pi-copy'" :class="copied ? 'text-green-500' : 'text-brand-600'" @click="copyCoords" />
            <Button v-if="selection || selectionBox" text severity="secondary" size="small" icon="pi pi-times" @click="clearSelection" />
          </div>
        </div>
        <code class="text-brand-700 font-mono text-xs block mb-1">
          [{{ displayCoords.x1 }},{{ displayCoords.y1 }},{{ displayCoords.x2 }},{{ displayCoords.y2 }}]
        </code>
        <div class="text-xs text-gray-400">
          宽 {{ origWidth }} × 高 {{ origHeight }}
          <span v-if="!selection" class="text-gray-500 ml-1">(全屏)</span>
        </div>
        <Button
          v-if="selection"
          class="w-full mt-2"
          size="small"
          severity="secondary"
          text
          icon="pi pi-save"
          label="保存选区图片"
          @click="saveSelection"
        />
      </div>

      <!-- Tab: 找图 / OCR -->
      <div class="flex flex-col">
        <SelectButton
          v-model="activeTab"
          :options="tabs"
          option-label="label"
          option-value="key"
          :allow-empty="false"
          class="mb-3"
          size="small"
        />

        <FindPicPanel
          v-if="activeTab === 'find'"
          :screenshot="screenshot"
          :selection="selection"
          @update:results="onFindResults"
        />
        <OcrPanel
          v-if="activeTab === 'ocr'"
          :screenshot="screenshot"
          :selection="selection"
        />
      </div>

      <!-- 点击操作区 -->
      <div class="border-t border-gray-200 pt-3 flex flex-col gap-2">
        <SelectButton
          v-model="activeClickTab"
          :options="clickTabs"
          option-label="label"
          option-value="key"
          :allow-empty="false"
          size="small"
        />

        <!-- 单点点击 -->
        <div v-if="activeClickTab === 'click'" class="flex items-center gap-2">
          <InputText
            v-model="clickPoint"
            placeholder="[x, y]"
            class="flex-1 font-mono min-w-0"
            size="small"
          />
          <Button
            :icon="clickLoading ? 'pi pi-spinner pi-spin' : 'pi pi-bullseye'"
            label="点击"
            :disabled="!selectedDeviceId || clickLoading"
            @click="handleClick"
            size="small"
          />
        </div>

        <!-- 范围点击 -->
        <div v-if="activeClickTab === 'area'" class="flex items-center gap-2">
          <InputText
            v-model="clickArea"
            placeholder="[x1, y1, x2, y2]"
            class="flex-1 font-mono"
            size="small"
          />
          <Button
            :icon="clickLoading ? 'pi pi-spinner pi-spin' : 'pi pi-bullseye'"
            label="点击"
            :disabled="!selectedDeviceId || clickLoading"
            @click="handleAreaClick"
            size="small"
            class="shrink-0"
          />
        </div>
      </div>

      <!-- 拟真滑动调试区 -->
      <div class="border-t border-gray-200 pt-3 flex flex-col gap-2">
        <div class="flex items-center gap-1.5 mb-1">
          <i class="pi pi-arrows-alt text-sm text-gray-500" />
          <span class="text-sm font-medium text-gray-600">拟真滑动</span>
        </div>
        <InputText
          v-model="swipeStart"
          placeholder="起点区域 [x1, y1, x2, y2]"
          class="w-full font-mono"
          size="small"
        />
        <InputText
          v-model="swipeEnd"
          placeholder="终点区域 [x1, y1, x2, y2]"
          class="w-full font-mono"
          size="small"
        />
        <Button
          :icon="swipeLoading ? 'pi pi-spinner pi-spin' : 'pi pi-arrows-alt'"
          :label="swipeLoading ? '滑动中...' : '滑动'"
          :disabled="!selectedDeviceId || swipeLoading"
          @click="handleSwipe"
          size="small"
        />
        <!-- 滑动轨迹信息 -->
        <div v-if="swipeResult" class="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">
          <div>起点 ({{ swipeResult.startX }}, {{ swipeResult.startY }}) → 终点 ({{ swipeResult.endX }}, {{ swipeResult.endY }})</div>
          <div>分段 {{ swipeResult.steps }} · {{ swipeResult.elapsed }}ms · 轨迹点 {{ swipeResult.trajectory.length }}</div>
        </div>
      </div>
    </div>
    <div class="flex-1 flex flex-col bg-gray-100 overflow-hidden relative">
      <!-- 工具栏 -->
      <div class="h-[52px] flex-shrink-0 bg-white border-b border-gray-200 flex items-center justify-center px-4 gap-4">
        <!-- 取色工具组 -->
        <div class="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
          <div
            class="w-6 h-6 rounded border border-gray-300 cursor-pointer transition-transform hover:scale-110"
            :style="{ backgroundColor: pickedColor }"
            title="点击取色"
            @click="pickColor"
          />
          <span class="text-[11px] font-mono text-gray-500 select-all">{{ pickedColor }}</span>
          <Button
            text
            :severity="colorCopied ? 'success' : 'secondary'"
            size="small"
            :icon="colorCopied ? 'pi pi-check' : 'pi pi-copy'"
            @click="copyColor"
          />
          <div class="w-px h-4 bg-gray-200 mx-0.5" />
          <Button
            text
            :severity="eyedropperActive ? 'primary' : 'secondary'"
            size="small"
            icon="pi pi-palette"
            :class="eyedropperActive ? 'scale-110' : ''"
            @click="pickColor"
          />
        </div>

        <!-- 后续工具组占位：用同样的 .tool-group 样式，组间加 gap-4 即可 -->
      </div>

      <!-- 截图展示区 -->
      <div class="flex-1 flex items-center justify-center overflow-auto p-4">
      <div v-if="!screenshot" class="text-center text-gray-400">
        <i class="pi pi-image text-6xl mb-3 block" />
        <p>选择设备并点击截屏开始</p>
      </div>

      <div
        v-else
        ref="canvasContainer"
        class="relative select-none"
        :style="{ userSelect: 'none', WebkitUserSelect: 'none', cursor: containerCursor }"
        @mousedown="onContainerMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
      >
        <!-- 截图 -->
        <img
          :src="screenshot.image"
          :style="{ maxWidth: '100%', maxHeight: 'calc(100vh - 172px)' }"
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
          <!-- 四角缩放手柄 -->
          <div
            v-for="h in CORNER_HANDLES"
            :key="h.id"
            class="absolute w-3 h-3 bg-brand-500 border-2 border-white rounded-full shadow-sm"
            :style="{ ...h.pos, cursor: h.cursor, zIndex: 20, marginLeft: '-6px', marginTop: '-6px' }"
            @mousedown.stop="onHandleMouseDown($event, 'corner', h.id)"
          />
          <!-- 四边缩放手柄 -->
          <div
            v-for="h in EDGE_HANDLES"
            :key="h.id"
            class="absolute bg-white/80 border border-brand-400 rounded-sm"
            :style="{ ...h.pos, ...h.size, cursor: h.cursor, zIndex: 20 }"
            @mousedown.stop="onHandleMouseDown($event, 'edge', h.id)"
          />
          <!-- 宽/高标注 -->
          <span
            class="absolute left-1/2 -translate-x-1/2 bg-black/75 text-white text-xs px-1.5 py-0.5 rounded whitespace-nowrap leading-tight"
            :style="{ top: '-22px' }"
          >{{ Math.round(selectionBox.width) }}px</span>
          <span
            class="absolute top-1/2 -translate-y-1/2 bg-black/75 text-white text-xs px-1.5 py-0.5 rounded whitespace-nowrap leading-tight"
            :style="{ left: 'calc(100% + 6px)' }"
          >{{ Math.round(selectionBox.height) }}px</span>
        </div>

        <!-- 找图匹配结果高亮 -->
        <div
          v-for="(m, i) in matchOverlays"
          :key="'match-' + i"
          class="absolute border-2 border-green-400 bg-green-400/10 pointer-events-none"
          :style="{ left: `${m.left}px`, top: `${m.top}px`, width: `${m.width}px`, height: `${m.height}px`, zIndex: 9 }"
        >
          <span class="absolute -top-4 left-0 bg-green-500 text-white text-xs px-1 rounded leading-tight">
            #{{ i + 1 }} {{ m.confidence }}
          </span>
        </div>

        <!-- 滑动轨迹 SVG -->
        <svg
          v-if="swipeTrajectoryVisible && swipeTrajectoryPath"
          class="absolute inset-0 pointer-events-none"
          :width="imgDisplaySize.width"
          :height="imgDisplaySize.height"
          style="z-index: 15;"
        >
          <!-- 轨迹线 -->
          <path
            :d="swipeTrajectoryPath"
            fill="none"
            stroke="#3b82f6"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-dasharray="8,4"
            class="swipe-path-animate"
          />
          <!-- 起点圆点 -->
          <circle
            v-if="swipeResult"
            :cx="(swipeResult.startX * imgDisplaySize.width) / (screenshot?.width || 1)"
            :cy="(swipeResult.startY * imgDisplaySize.height) / (screenshot?.height || 1)"
            r="6"
            fill="#22c55e"
            stroke="white"
            stroke-width="2"
          />
          <!-- 终点圆点 -->
          <circle
            v-if="swipeResult"
            :cx="(swipeResult.endX * imgDisplaySize.width) / (screenshot?.width || 1)"
            :cy="(swipeResult.endY * imgDisplaySize.height) / (screenshot?.height || 1)"
            r="6"
            fill="#ef4444"
            stroke="white"
            stroke-width="2"
          />
        </svg>
      </div>
      </div>

      <!-- Toast -->
      <Transition name="toast">
        <div
          v-if="toastMsg"
          class="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50"
        >{{ toastMsg }}</div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import type { ScreenshotResponse, FindPicProMatch } from '@automan/shared/types.js'
import { deviceApi } from '../api/device.js'
import { useDevices } from '../composables/useDevices.js'
import { useSelection, CORNER_HANDLES, EDGE_HANDLES } from '../composables/useSelection.js'
import FindPicPanel from '../components/FindPicPanel.vue'
import OcrPanel from '../components/OcrPanel.vue'

// ── 设备 & 截屏 ──
const { devices, fetchDevices } = useDevices()
const selectedDeviceId = ref('')
const screenshot = ref<ScreenshotResponse | null>(null)
const capturing = ref(false)
const canvasContainer = ref<HTMLElement>()
const imgDisplaySize = ref({ width: 0, height: 0 })

// ── 取色工具 ──
const pickedColor = ref('#ffffff')
const colorCopied = ref(false)
const eyedropperActive = ref(false)
const toastMsg = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(msg: string) {
  toastMsg.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 1500)
}

async function pickColor() {
  if (!('EyeDropper' in window)) {
    showToast('当前浏览器不支持取色器')
    return
  }
  eyedropperActive.value = true
  try {
    const dropper = new (window as any).EyeDropper()
    const result = await dropper.open()
    pickedColor.value = result.sRGBHex
  } catch {
    // user cancelled
  } finally {
    eyedropperActive.value = false
  }
}

function copyColor() {
  navigator.clipboard.writeText(pickedColor.value).then(() => {
    colorCopied.value = true
    showToast('复制成功')
    setTimeout(() => { colorCopied.value = false }, 1000)
  })
}

// ── 框选（composable） ──
const {
  dragMode, selectionBox, selection, copied,
  containerCursor, displayCoords, origWidth, origHeight, scaleX, scaleY,
  onContainerMouseDown, onBoxMouseDown, onHandleMouseDown, onMouseMove, onMouseUp,
  copyCoords, clearSelection, saveSelection,
} = useSelection(screenshot, imgDisplaySize, canvasContainer)

// ── Tab ──
const tabs = [
  { key: 'find', label: '找图', icon: 'pi-search' },
  { key: 'ocr', label: 'OCR', icon: 'pi-file-edit' },
]
const activeTab = ref('find')

// ── 点击操作 ──
const clickTabs = [
  { key: 'click', label: '点击', icon: 'pi-bullseye' },
  { key: 'area', label: '范围点击', icon: 'pi-stop' },
]
const activeClickTab = ref('click')
const clickPoint = ref('[0, 0]')
const clickArea = ref('[0, 0, 0, 0]')
const clickLoading = ref(false)

// ── 拟真滑动 ──
const swipeStart = ref('[100, 800, 400, 1000]')
const swipeEnd = ref('[100, 200, 400, 400]')
const swipeLoading = ref(false)
const swipeResult = ref<{
  startX: number; startY: number; endX: number; endY: number
  steps: number; elapsed: number; trajectory: { x: number; y: number; t: number }[]
} | null>(null)
/** 轨迹动画 SVG path */
const swipeTrajectoryPath = ref('')
const swipeTrajectoryVisible = ref(false)

function parseCoord(input: string, expected: number): number[] | null {
  const nums = input.replace(/[\[\]\s]/g, '').split(',').map(Number)
  if (nums.length !== expected || nums.some(isNaN)) return null
  return nums
}

async function handleClick() {
  const coords = parseCoord(clickPoint.value, 2)
  if (!coords) {
    showToast('坐标格式错误，请输入 [x, y]')
    return
  }
  clickLoading.value = true
  try {
    const res = await deviceApi.click({
      deviceId: selectedDeviceId.value,
      point: [coords[0], coords[1]],
    })
    if (res.success) {
      showToast(`点击成功 (${res.data.x}, ${res.data.y})`)
    } else {
      showToast('message' in res ? res.message : '点击失败')
    }
  } catch {
    showToast('点击请求失败')
  } finally {
    clickLoading.value = false
  }
}

async function handleAreaClick() {
  const coords = parseCoord(clickArea.value, 4)
  if (!coords) {
    showToast('坐标格式错误，请输入 [x1, y1, x2, y2]')
    return
  }
  clickLoading.value = true
  try {
    const res = await deviceApi.areaClick({
      deviceId: selectedDeviceId.value,
      region: [coords[0], coords[1], coords[2], coords[3]],
    })
    if (res.success) {
      showToast(`范围点击成功 (${res.data.x}, ${res.data.y})`)
    } else {
      showToast('message' in res ? res.message : '范围点击失败')
    }
  } catch {
    showToast('范围点击请求失败')
  } finally {
    clickLoading.value = false
  }
}

async function handleSwipe() {
  const start = parseCoord(swipeStart.value, 4)
  const end = parseCoord(swipeEnd.value, 4)
  if (!start || !end) {
    showToast('坐标格式错误，请输入 [x1, y1, x2, y2]')
    return
  }
  swipeLoading.value = true
  swipeResult.value = null
  swipeTrajectoryVisible.value = false
  try {
    const res = await deviceApi.swipe({
      deviceId: selectedDeviceId.value,
      startRegion: [start[0], start[1], start[2], start[3]],
      endRegion: [end[0], end[1], end[2], end[3]],
    })
    if (res.success) {
      swipeResult.value = res.data
      showToast(`滑动完成 ${res.data.steps} 段, ${res.data.elapsed}ms`)
      // 生成 SVG path 并显示轨迹动画
      showSwipeTrajectory(res.data.trajectory)
    } else {
      showToast('message' in res ? res.message : '滑动失败')
    }
  } catch {
    showToast('滑动请求失败')
  } finally {
    swipeLoading.value = false
  }
}

function showSwipeTrajectory(trajectory: { x: number; y: number; t: number }[]) {
  if (!screenshot.value || !imgDisplaySize.value.width) return
  const sx = imgDisplaySize.value.width / screenshot.value.width
  const sy = imgDisplaySize.value.height / screenshot.value.height
  // 将原始坐标映射到显示坐标，生成 SVG path
  const points = trajectory.map(p => ({ x: p.x * sx, y: p.y * sy }))
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`
  }
  swipeTrajectoryPath.value = d
  swipeTrajectoryVisible.value = true
  // 2秒后自动消失
  setTimeout(() => { swipeTrajectoryVisible.value = false }, 2000)
}

// ── 找图结果覆盖层 ──
const findData = ref<{ matches: FindPicProMatch[]; templateSize: { width: number; height: number } }>({
  matches: [],
  templateSize: { width: 0, height: 0 },
})

const matchOverlays = computed(() => {
  if (!screenshot.value || !imgDisplaySize.value.width) return []
  const sx = imgDisplaySize.value.width / screenshot.value.width
  const sy = imgDisplaySize.value.height / screenshot.value.height
  return findData.value.matches.map((r) => ({
    left: r.x * sx,
    top: r.y * sy,
    width: findData.value.templateSize.width * sx,
    height: findData.value.templateSize.height * sy,
    confidence: r.confidence,
  }))
})

function onFindResults(payload: { matches: FindPicProMatch[]; templateSize: { width: number; height: number } }) {
  findData.value = payload
}

// ── 生命周期 ──
onMounted(async () => {
  await fetchDevices()
  if (devices.value.length > 0) {
    selectedDeviceId.value = devices.value[0].id
  }
})

// ── 截屏 ──
async function handleCapture() {
  if (!selectedDeviceId.value) return
  capturing.value = true
  clearSelection()
  try {
    const res = await deviceApi.screenshot(selectedDeviceId.value)
    if (res.success) {
      screenshot.value = res.data
    } else {
      alert('message' in res ? res.message : '截屏失败')
    }
  } catch {
    alert('截屏请求失败')
  } finally {
    capturing.value = false
  }
}

function onImageLoad(e: Event) {
  const img = e.target as HTMLImageElement
  imgDisplaySize.value = { width: img.clientWidth, height: img.clientHeight }
}
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

/* 滑动轨迹线动画 */
.swipe-path-animate {
  animation: swipe-dash 0.6s ease-out forwards;
}
@keyframes swipe-dash {
  from { stroke-dashoffset: 200; opacity: 0.3; }
  to   { stroke-dashoffset: 0;   opacity: 1; }
}
</style>
