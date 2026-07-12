<template>
  <div class="flex flex-col gap-3">
    <!-- 模式切换：识字 / 找字 -->
    <SelectButton
      v-model="mode"
      :options="modeOptions"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      size="small"
    />

    <!-- 找字：目标文字输入 -->
    <div v-if="mode === 'find'" class="flex flex-col gap-2">
      <InputText
        v-model="target"
        placeholder="要查找的文字..."
        size="small"
      />
      <div>
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs text-gray-500">相似度</span>
          <span class="text-xs font-mono text-brand-600">{{ similarity }}%</span>
        </div>
        <Slider v-model="similarity" :min="50" :max="100" />
      </div>
    </div>

    <!-- 颜色过滤 -->
    <div>
      <span class="text-xs text-gray-500 block mb-1">颜色过滤</span>
      <div class="relative">
        <InputText
          v-model="selectedColor"
          placeholder="如 red、#FF0000、0,0,255..."
          size="small"
          class="w-full pr-7"
        />
        <Button
          v-if="selectedColor"
          text
          rounded
          severity="secondary"
          size="small"
          icon="pi pi-times"
          class="absolute right-1 top-1/2 -translate-y-1/2"
          @click="selectedColor = ''"
        />
      </div>
      <div class="flex gap-1.5 mt-1.5">
        <Button text size="small" severity="secondary" label="#ffffff" class="text-[10px] font-mono" @click="selectedColor = 'white'" />
        <Button text size="small" severity="secondary" label="#000000" class="text-[10px] font-mono" @click="selectedColor = 'black'" />
      </div>
      <!-- 颜色偏差滑块 -->
      <div v-if="selectedColor" class="mt-2">
        <div class="flex items-center justify-between mb-1">
          <span class="text-[10px] text-gray-400">颜色偏差</span>
          <span class="text-[10px] font-mono text-brand-600">{{ colorTolerance }}</span>
        </div>
        <Slider v-model="colorTolerance" :min="5" :max="100" />
        <div class="flex justify-between text-[9px] text-gray-300">
          <span>精确</span>
          <span>宽松</span>
        </div>
      </div>
    </div>

    <!-- 执行按钮 -->
    <Button
      class="w-full"
      :label="loading ? '识别中...' : (mode === 'words' ? (selection ? '识别选区' : '识别全图') : '查找文字')"
      :icon="loading ? 'pi pi-spinner pi-spin' : 'pi pi-search'"
      :disabled="!screenshot || loading || (mode === 'find' && !target)"
      @click="handleOcr"
    />

    <!-- 结果展示 -->
    <!-- 识字结果 -->
    <div v-if="mode === 'words' && wordsResult" class="flex flex-col gap-1">
      <span class="text-xs text-gray-500">
        识别结果（{{ wordsResult.words.length }} 个文字块，{{ wordsResult.elapsed }}ms）
      </span>
      <div class="max-h-48 overflow-y-auto flex flex-col gap-0.5">
        <div
          v-for="(w, i) in wordsResult.words"
          :key="i"
          class="text-xs bg-gray-50 px-2 py-1 rounded hover:bg-brand-50 transition-colors cursor-pointer"
          :title="`位置 (${w.x},${w.y}) ${w.w}x${w.h} 置信度 ${w.confidence}`"
          @click="emit('highlight-word', w)"
        >
          <span class="font-medium">{{ w.text }}</span>
          <span class="text-gray-400 ml-1">({{ w.confidence }})</span>
        </div>
      </div>
    </div>

    <!-- 找字结果 -->
    <div v-if="mode === 'find' && findResult" class="flex flex-col gap-1">
      <span class="text-xs text-gray-500">
        匹配结果（{{ findResult.matches.length }} 个，{{ findResult.elapsed }}ms）
      </span>
      <div class="max-h-48 overflow-y-auto flex flex-col gap-0.5">
        <div
          v-for="(m, i) in findResult.matches"
          :key="i"
          class="text-xs bg-gray-50 px-2 py-1 rounded hover:bg-brand-50 transition-colors cursor-pointer"
          :title="`位置 (${m.x},${m.y}) ${m.w}x${m.h} 相似度 ${m.similarity}`"
          @click="emit('highlight-word', m)"
        >
          <span class="font-medium">{{ m.text }}</span>
          <span class="text-brand-600 ml-1">相似 {{ m.similarity }}</span>
        </div>
      </div>
      <div v-if="findResult.matches.length === 0" class="text-xs text-gray-400 text-center py-2">
        未找到匹配文字
        <div v-if="findResult.allWords?.length" class="mt-1 text-left">
          <span class="text-gray-500">OCR 识别到：</span>
          <div v-for="(w, i) in findResult.allWords" :key="i" class="text-gray-400">· {{ w }}</div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!wordsResult && !findResult && !loading" class="text-xs text-gray-400 text-center py-2">
      {{ selection ? '已框选区域，点击按钮识别' : '未框选将识别全图' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import SelectButton from 'primevue/selectbutton'
import Slider from 'primevue/slider'
import type {
  ScreenshotResponse,
  OcrWord,
  GetWordsResponse,
  FindStrResponse,
  OcrColor,
} from '@automan/shared/types.js'
import type { Selection } from '../composables/useSelection.js'
import { deviceApi } from '../api/device.js'

const props = defineProps<{
  screenshot: ScreenshotResponse | null
  selection: Selection | null
}>()

const emit = defineEmits<{
  /** 点击某个文字块（父组件可用于高亮） */
  'highlight-word': [word: OcrWord]
}>()

const modeOptions = [
  { label: '识字', value: 'words' },
  { label: '找字', value: 'find' },
]
const mode = ref<'words' | 'find'>('words')
const target = ref('')
const similarity = ref(80)
const selectedColor = ref('')
const colorTolerance = ref(50)
const loading = ref(false)
const wordsResult = ref<GetWordsResponse | null>(null)
const findResult = ref<FindStrResponse | null>(null)


// 切换截图时清空结果
watch(() => props.screenshot, () => {
  wordsResult.value = null
  findResult.value = null
})

// 切换模式时清空结果
watch(mode, () => {
  wordsResult.value = null
  findResult.value = null
})

async function handleOcr() {
  if (!props.screenshot) return
  loading.value = true
  wordsResult.value = null
  findResult.value = null

  const region: [number, number, number, number] = props.selection
    ? [props.selection.x1, props.selection.y1, props.selection.x2, props.selection.y2]
    : [0, 0, 0, 0]

  const color = (selectedColor.value as OcrColor) || undefined

  try {
    if (mode.value === 'words') {
      const res = await deviceApi.ocrWords({
        image: props.screenshot!.image,
        region,
        color,
        colorTolerance: colorTolerance.value,
      })
      if (res.success) {
        wordsResult.value = res.data
      } else {
        alert('message' in res ? res.message : 'OCR 识别失败')
      }
    } else {
      if (!target.value) return
      const res = await deviceApi.ocrFindStr({
        image: props.screenshot!.image,
        target: target.value,
        region,
        similarity: similarity.value / 100,
        color,
        colorTolerance: colorTolerance.value,
      })
      if (res.success) {
        findResult.value = res.data
      } else {
        alert('message' in res ? res.message : '找字失败')
      }
    }
  } catch {
    alert('请求失败')
  } finally {
    loading.value = false
  }
}
</script>
