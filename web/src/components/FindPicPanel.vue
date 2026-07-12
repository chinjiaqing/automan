<template>
  <div class="flex flex-col gap-3">
    <Button
      text
      severity="secondary"
      class="w-full"
      icon="pi pi-upload"
      :label="templateImage ? '重新上传模板' : '上传目标图片'"
      @click="handleUploadImage"
    />
    <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileSelected" />

    <!-- 模板预览 -->
    <div v-if="templateImage" class="relative bg-gray-50 border border-gray-200 rounded p-1">
      <img :src="templateImage" class="max-h-20 mx-auto block" />
      <Button
        text
        rounded
        severity="secondary"
        size="small"
        icon="pi pi-times"
        class="absolute top-0.5 right-0.5"
        title="移除模板"
        @click="removeTemplate"
      />
    </div>

    <!-- 相似度滑块 -->
    <div>
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs text-gray-500">相似度</span>
        <span class="text-xs font-mono text-brand-600">{{ similarity }}%</span>
      </div>
      <Slider v-model="similarity" :min="30" :max="100" />
    </div>

    <!-- 查找按钮 -->
    <Button
      class="w-full"
      :label="finding ? '查找中...' : '查找'"
      :icon="finding ? 'pi pi-spinner pi-spin' : 'pi pi-search'"
      :disabled="!screenshot || !templateImage || finding"
      @click="handleFindPic"
    />

    <!-- 匹配结果 -->
    <div v-if="findResults.length > 0" class="flex flex-col gap-1">
      <span class="text-xs text-gray-500">匹配结果（{{ findResults.length }} 个，耗时 {{ findElapsed }}ms）：</span>
      <div
        v-for="(r, i) in findResults"
        :key="i"
        class="text-xs bg-gray-50 px-2 py-1 rounded cursor-pointer hover:bg-brand-50 transition-colors"
        @click="emit('highlight', r)"
      >
        #{{ i + 1 }}: ({{ r.x }}, {{ r.y }}) 置信度 {{ r.confidence }} <span class="text-brand-500">[{{ r.method }}]</span>
      </div>
    </div>
    <div v-else-if="findDone" class="text-xs text-gray-400 text-center py-2">
      未找到匹配结果
    </div>
    <div v-else class="text-xs text-gray-400 text-center py-2">
      上传模板图片后点击查找
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Button from 'primevue/button'
import Slider from 'primevue/slider'
import type { ScreenshotResponse, FindPicProMatch } from '@automan/shared/types.js'
import type { Selection } from '../composables/useSelection.js'
import { deviceApi } from '../api/device.js'

const props = defineProps<{
  screenshot: ScreenshotResponse | null
  selection: Selection | null
}>()

const emit = defineEmits<{
  /** 匹配结果更新（父组件用于渲染高亮覆盖层） */
  'update:results': [payload: { matches: FindPicProMatch[]; templateSize: { width: number; height: number } }]
  /** 点击某个匹配结果 */
  highlight: [match: FindPicProMatch]
}>()

const fileInput = ref<HTMLInputElement>()
const templateImage = ref('')
const similarity = ref(80)
const finding = ref(false)
const findDone = ref(false)
const findElapsed = ref(0)
const findResults = ref<FindPicProMatch[]>([])
const templateSize = ref({ width: 0, height: 0 })

// 结果变化时通知父组件
watch([findResults, templateSize], () => {
  emit('update:results', { matches: findResults.value, templateSize: templateSize.value })
}, { deep: true })

// 切换截图时清空结果
watch(() => props.screenshot, () => {
  findResults.value = []
  findDone.value = false
})

function removeTemplate() {
  templateImage.value = ''
  findResults.value = []
}

function handleUploadImage() {
  fileInput.value?.click()
}

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  const file = input.files[0]
  const reader = new FileReader()
  reader.onload = (ev) => {
    templateImage.value = ev.target?.result as string
    findResults.value = []
    findDone.value = false
    const img = new Image()
    img.onload = () => {
      templateSize.value = { width: img.width, height: img.height }
    }
    img.src = templateImage.value
  }
  reader.readAsDataURL(file)
  input.value = ''
}

async function handleFindPic() {
  if (!props.screenshot || !templateImage.value) return
  finding.value = true
  findDone.value = false
  try {
    const region: [number, number, number, number] = props.selection
      ? [props.selection.x1, props.selection.y1, props.selection.x2, props.selection.y2]
      : [0, 0, 0, 0]
    const res = await deviceApi.findPicPro({
      image: props.screenshot.image,
      template: templateImage.value,
      threshold: similarity.value / 100,
      region,
    })
    if (res.success) {
      findResults.value = res.data.matches
      findElapsed.value = res.data.elapsed
    } else {
      alert('message' in res ? res.message : '找图失败')
      findResults.value = []
    }
  } catch {
    alert('找图请求失败')
    findResults.value = []
  } finally {
    finding.value = false
    findDone.value = true
  }
}
</script>
