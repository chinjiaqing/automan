<template>
  <div class="exec-viewer relative flex flex-col bg-gray-100">
    <!-- 左上角提示文案 -->
    <div class="absolute top-1.5 left-2 z-10 text-xs text-gray-400 leading-tight select-none">
      <div>
        每2秒刷新，
        <a href="#" class="text-blue-400 hover:text-blue-600 pointer-events-auto" @click.prevent="manualRefresh">手动刷新</a>
      </div>
      <div>点击图片可实时操作模拟器</div>
    </div>
    <!-- 截图 + 注解叠加层 -->
    <div v-if="screenshot" ref="canvasRef" class="exec-viewer__canvas relative select-none mx-auto" @click="onCanvasClick">
      <img
        ref="imgRef"
        :src="screenshot.image"
        class="block w-full"
        style="user-select: none; -webkit-user-drag: none;"
        draggable="false"
      />

      <!-- 注解叠加 -->
      <template v-if="annotations">
        <template v-for="(ann, ai) in annotations.annotations" :key="ai">
        <!-- bbox: 识图匹配框（用模板图片实际尺寸） -->
        <template v-if="ann.type === 'bbox'">
          <div
            v-for="(m, mi) in (ann.data.matches as any[])"
            :key="`bbox-${ai}-${mi}`"
            class="exec-ann exec-ann--bbox"
            :style="bboxStyle(m, ann.data.templateW as number, ann.data.templateH as number)"
          >
            <span class="exec-ann__label">{{ ann.label }} #{{ mi + 1 }} {{ (m.confidence * 100).toFixed(0) }}%</span>
          </div>
        </template>

        <!-- text: OCR 文字匹配框 -->
        <template v-else-if="ann.type === 'text'">
          <div
            v-for="(m, mi) in (ann.data.matches as any[])"
            :key="`text-${ai}-${mi}`"
            class="exec-ann exec-ann--text"
            :style="textStyle(m)"
          >
            <span class="exec-ann__label">{{ m.text }}</span>
          </div>
        </template>

        <!-- click: 点击波纹 -->
        <template v-else-if="ann.type === 'click'">
          <div
            class="exec-ann exec-ann--click"
            :style="pointStyle(ann.data.x as number, ann.data.y as number)"
          >
            <span class="exec-ann__ripple" />
            <span class="exec-ann__ripple exec-ann__ripple--delay" />
          </div>
        </template>

        <!-- area: 范围点击 -->
        <template v-else-if="ann.type === 'area'">
          <div
            class="exec-ann exec-ann--area"
            :style="areaStyle(ann.data.region as number[])"
          >
            <span class="exec-ann__label">{{ ann.label }}</span>
          </div>
          <div
            class="exec-ann exec-ann--click"
            :style="pointStyle(ann.data.clickX as number, ann.data.clickY as number)"
          >
            <span class="exec-ann__ripple" />
          </div>
        </template>
      </template>
      </template>

      <!-- 用户点击反馈波纹 -->
      <template v-if="clickFeedback">
        <div
          class="exec-ann exec-ann--click"
          :style="pointStyle(clickFeedback.x, clickFeedback.y)"
        >
          <span class="exec-ann__ripple" />
          <span class="exec-ann__ripple exec-ann__ripple--delay" />
        </div>
      </template>
    </div>

    <!-- 无截图占位 -->
    <div v-else class="exec-viewer__placeholder">
      <div class="text-center text-gray-400 text-xs">
        <i class="pi pi-image text-2xl mb-1 block" />
        等待设备截图...
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, type CSSProperties } from 'vue'
import { useToast } from 'primevue/usetoast'
import type { VisualAnnotation } from '@automan/shared/types.js'
import { deviceApi } from '../api/device.js'

interface ScreenshotInfo {
  image: string
  width: number
  height: number
  originalWidth: number
  originalHeight: number
}

interface AnnotationInfo {
  annotations: VisualAnnotation[]
  executionCount: number
}

const emit = defineEmits<{
  manualRefresh: []
}>()

function manualRefresh() {
  emit('manualRefresh')
}

const props = defineProps<{
  screenshot: ScreenshotInfo | null
  annotations: AnnotationInfo | null
  deviceId?: string
}>()

const toast = useToast()

/** 画布容器引用 */
const canvasRef = ref<HTMLElement | null>(null)

/** 图片元素引用（用于精确坐标转换） */
const imgRef = ref<HTMLImageElement | null>(null)

/** 用户点击反馈坐标（截图坐标系） */
const clickFeedback = ref<{ x: number; y: number } | null>(null)
let clickFeedbackTimer: ReturnType<typeof setTimeout> | null = null

/** 图片显示尺寸 */
const displayW = ref(0)
const displayH = ref(0)

/** ResizeObserver 跟踪容器宽度变化 */
let ro: ResizeObserver | null = null

onMounted(() => {
  ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const w = entry.contentRect.width
      if (w > 0 && props.screenshot) {
        const aspect = props.screenshot.height / props.screenshot.width
        let h = w * aspect
        if (h > 360) h = 360
        displayW.value = w
        displayH.value = h
      }
    }
  })
})

onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
})

/** 截图变化时观察新容器 */
watch(canvasRef, (el) => {
  if (el && ro) {
    ro.disconnect()
    ro.observe(el)
  }
})

/** 缩放因子：显示像素 / 截图像素（注解坐标基于截图尺寸 = 标准分辨率） */
const sx = computed(() => (displayW.value && props.screenshot ? displayW.value / props.screenshot.width : 1))
const sy = computed(() => (displayH.value && props.screenshot ? displayH.value / props.screenshot.height : 1))

/** bbox 尺寸：用模板图片实际尺寸，无则回退固定 40px */
function bboxStyle(m: { x: number; y: number }, templateW?: number, templateH?: number): CSSProperties {
  const w = (templateW ?? 40) * sx.value
  const h = (templateH ?? 40) * sy.value
  const x = m.x * sx.value
  const y = m.y * sy.value
  return {
    left: `${x}px`,
    top: `${y}px`,
    width: `${w}px`,
    height: `${h}px`,
  }
}

function textStyle(m: { x: number; y: number; w: number; h: number }): CSSProperties {
  return {
    left: `${m.x * sx.value}px`,
    top: `${m.y * sy.value}px`,
    width: `${(m.w || 40) * sx.value}px`,
    height: `${(m.h || 40) * sy.value}px`,
  }
}

function pointStyle(x: number, y: number): CSSProperties {
  const px = x * sx.value
  const py = y * sy.value
  return {
    left: `${px}px`,
    top: `${py}px`,
  }
}

function areaStyle(region: number[]): CSSProperties {
  const [x1, y1, x2, y2] = region
  return {
    left: `${x1 * sx.value}px`,
    top: `${y1 * sy.value}px`,
    width: `${(x2 - x1) * sx.value}px`,
    height: `${(y2 - y1) * sy.value}px`,
  }
}

/**
 * 画布点击事件处理
 * 将显示像素坐标转换为截图坐标，并调用 ADB 点击接口
 * 处理 object-fit: contain 可能产生的 letterbox 偏移
 */
async function onCanvasClick(event: MouseEvent) {
  if (!props.deviceId || !props.screenshot || !canvasRef.value || !imgRef.value) return

  // 1. 获取 img 元素在 canvas 容器内的实际显示区域
  const canvasRect = canvasRef.value.getBoundingClientRect()
  const imgRect = imgRef.value.getBoundingClientRect()

  // 2. 计算点击相对于 img 内容区域的偏移
  //    （imgRect 已反映 object-fit: contain 的居中偏移）
  const relX = event.clientX - imgRect.left
  const relY = event.clientY - imgRect.top

  // 3. 点击在图片范围外则忽略
  if (relX < 0 || relX > imgRect.width || relY < 0 || relY > imgRect.height) return

  // 4. 转换为截图坐标系
  const realX = Math.round(relX / imgRect.width * props.screenshot.width)
  const realY = Math.round(relY / imgRect.height * props.screenshot.height)

  // 5. 显示点击反馈波纹
  clickFeedback.value = { x: realX, y: realY }
  if (clickFeedbackTimer) clearTimeout(clickFeedbackTimer)
  clickFeedbackTimer = setTimeout(() => {
    clickFeedback.value = null
  }, 1200)

  // 6. 调用 ADB 点击
  try {
    const res = await deviceApi.click({ deviceId: props.deviceId, point: [realX, realY] })
    if (res.success) {
      toast.add({ severity: 'info', summary: `点击 (${realX}, ${realY})`, life: 1500 })
    } else {
      toast.add({ severity: 'warn', summary: '点击失败', detail: (res as any).message ?? '', life: 3000 })
    }
  } catch (err) {
    toast.add({ severity: 'error', summary: '点击请求失败', detail: err instanceof Error ? err.message : String(err), life: 3000 })
  }
}
</script>

<style scoped>
.exec-viewer {
  border-bottom: 1px solid #e5e7eb;
}

.exec-viewer__canvas {
  max-height: 360px;
  overflow: hidden;
}

.exec-viewer__canvas img {
  max-height: 360px;
  object-fit: contain;
}

.exec-viewer__placeholder {
  height: 360px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
}

/* ── 注解通用 ── */
.exec-ann {
  position: absolute;
  pointer-events: none;
  z-index: 5;
}

/* bbox: 绿色匹配框 */
.exec-ann--bbox {
  border: 2px solid #22c55e;
  background: rgba(34, 197, 94, 0.12);
  border-radius: 2px;
}

/* text: 蓝色文字区域 */
.exec-ann--text {
  border: 2px solid #3b82f6;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 2px;
}

/* area: 橙色范围框 */
.exec-ann--area {
  border: 2px dashed #f59e0b;
  background: rgba(245, 158, 11, 0.08);
  border-radius: 3px;
}

/* click: 波纹中心点 */
.exec-ann--click {
  width: 0;
  height: 0;
  z-index: 6;
}

.exec-ann__ripple {
  position: absolute;
  width: 32px;
  height: 32px;
  margin-left: -16px;
  margin-top: -16px;
  border-radius: 50%;
  border: 2px solid #ef4444;
  animation: ripple 1.2s ease-out infinite;
}

.exec-ann__ripple--delay {
  animation-delay: 0.4s;
}

@keyframes ripple {
  0% {
    transform: scale(0.3);
    opacity: 1;
  }
  100% {
    transform: scale(2);
    opacity: 0;
  }
}

/* 标签 */
.exec-ann__label {
  position: absolute;
  top: -16px;
  left: 0;
  font-size: 10px;
  line-height: 1;
  padding: 1px 4px;
  border-radius: 2px;
  white-space: nowrap;
  color: white;
}

.exec-ann--bbox .exec-ann__label {
  background: #22c55e;
}

.exec-ann--text .exec-ann__label {
  background: #3b82f6;
}

.exec-ann--area .exec-ann__label {
  background: #f59e0b;
}
</style>
