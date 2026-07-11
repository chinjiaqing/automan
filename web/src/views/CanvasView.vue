<template>
  <div class="h-full flex">
    <!-- 左侧操作区 -->
    <div class="w-60 flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto p-4 flex flex-col gap-4">
      <!-- 设备选择 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">当前设备</label>
        <select v-model="selectedDeviceId" class="input-base">
          <option value="">请选择设备</option>
          <option v-for="d in devices" :key="d.id" :value="d.id">{{ d.name }}</option>
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

      <!-- 框选坐标（常显） -->
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
        <button
          v-if="selection"
          class="btn-ghost w-full mt-2 flex items-center justify-center gap-1 text-xs py-1.5"
          @click="saveSelection"
        >
          <i class="pi pi-save text-xs" />
          保存选区图片
        </button>
      </div>

      <!-- Tab: 找图 / OCR -->
      <div class="flex flex-col">
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
        <div class="flex border border-gray-200 rounded overflow-hidden">
          <button
            v-for="ct in clickTabs"
            :key="ct.key"
            class="flex-1 py-1.5 text-xs text-center transition-colors"
            :class="activeClickTab === ct.key
              ? 'bg-brand-500 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'"
            @click="activeClickTab = ct.key"
          >
            <i :class="`pi ${ct.icon} mr-1`" />
            {{ ct.label }}
          </button>
        </div>

        <!-- 单点点击 -->
        <div v-if="activeClickTab === 'click'" class="flex items-center gap-2">
          <input
            v-model="clickPoint"
            type="text"
            placeholder="[x, y]"
            class="input-base text-sm flex-1 font-mono"
          />
          <button
            class="btn-primary px-3 py-1.5 text-xs flex items-center gap-1"
            :disabled="!selectedDeviceId || clickLoading"
            @click="handleClick"
          >
            <i :class="clickLoading ? 'pi pi-spinner pi-spin' : 'pi pi-bullseye'" />
            点击
          </button>
        </div>

        <!-- 范围点击 -->
        <div v-if="activeClickTab === 'area'" class="flex items-center gap-2">
          <input
            v-model="clickArea"
            type="text"
            placeholder="[x1, y1, x2, y2]"
            class="input-base text-sm flex-1 font-mono"
          />
          <button
            class="btn-primary px-3 py-1.5 text-xs flex items-center gap-1"
            :disabled="!selectedDeviceId || clickLoading"
            @click="handleAreaClick"
          >
            <i :class="clickLoading ? 'pi pi-spinner pi-spin' : 'pi pi-bullseye'" />
            点击
          </button>
        </div>
      </div>
    </div>

    <!-- 右侧截屏区 -->
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
          <button
            class="w-6 h-6 flex items-center justify-center rounded transition-colors"
            :class="colorCopied ? 'text-green-500' : 'hover:bg-gray-200 text-gray-400'"
            title="复制颜色值"
            @click="copyColor"
          >
            <i :class="colorCopied ? 'pi pi-check' : 'pi pi-copy'" class="text-[11px]" />
          </button>
          <div class="w-px h-4 bg-gray-200 mx-0.5" />
          <button
            class="w-7 h-7 flex items-center justify-center rounded-md transition-all cursor-crosshair"
            :class="eyedropperActive ? 'bg-brand-500 text-white scale-110' : 'hover:bg-gray-200 text-gray-500'"
            title="屏幕取色"
            @click="pickColor"
          >
            <i class="pi pi-palette text-xs" />
          </button>
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
</style>
