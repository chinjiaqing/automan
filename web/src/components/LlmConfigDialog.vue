<template>
  <Dialog v-model:visible="visible" :modal="true" :style="{ width: '420px' }">
    <template #header>
      <div class="flex items-center gap-2">
        <span class="text-base font-semibold">LLM API 配置</span>
        <span class="text-xs text-gray-400">（仅本地缓存）</span>
      </div>
    </template>

    <div class="flex flex-col gap-4">
      <div>
        <label class="block text-sm text-gray-600 mb-1.5">API 地址</label>
        <InputText class="w-full" v-model="form.apiUrl" placeholder="https://api.openai.com/v1/chat/completions" size="small" @input="onFormChange" />
      </div>
      <div>
        <label class="block text-sm text-gray-600 mb-1.5">API Key</label>
        <InputText class="w-full" v-model="form.apiKey" type="password" placeholder="sk-..." size="small" @input="onFormChange" />
      </div>
      <div>
        <label class="block text-sm text-gray-600 mb-1.5">模型</label>
        <InputText class="w-full" v-model="form.model" placeholder="gpt-4o-mini" size="small" @input="onFormChange" />
      </div>

      <!-- 测试状态 -->
      <div v-if="testStatus" class="flex items-center gap-2 text-sm" :class="testStatus === 'success' ? 'text-green-600' : 'text-red-500'">
        <i :class="`pi ${testStatus === 'success' ? 'pi-check-circle' : 'pi-times-circle'}`" />
        {{ testMessage }}
      </div>
    </div>

    <template #footer>
      <Button severity="secondary" text label="取消" @click="visible = false" />
      <Button
        :label="testing ? '测试中...' : '测试连接'"
        :loading="testing"
        :disabled="!canTest || testing"
        outlined
        @click="handleTest"
      />
      <Button label="保存" :disabled="testStatus !== 'success'" @click="handleSave" />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { getApiBase } from '../api/index.js'
import type { LlmConfig } from '../composables/useAiChat.js'

const props = defineProps<{
  modelValue: boolean
  config: LlmConfig
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [config: LlmConfig]
}>()

const visible = ref(props.modelValue)
watch(() => props.modelValue, (v) => { visible.value = v })
watch(visible, (v) => emit('update:modelValue', v))

const form = ref<LlmConfig>({ ...props.config })
watch(() => props.config, (c) => {
  form.value = { ...c }
  // 如果已有配置，打开弹窗时自动标记已测试
  if (c.apiUrl && c.apiKey && c.model) {
    testStatus.value = 'success'
    testMessage.value = '当前配置可用'
  } else {
    testStatus.value = ''
    testMessage.value = ''
  }
})

// ── 测试连接 ──
const testing = ref(false)
const testStatus = ref<'success' | 'fail' | ''>('')
const testMessage = ref('')

const canTest = computed(() => !!form.value.apiUrl && !!form.value.apiKey && !!form.value.model)

function onFormChange() {
  // 表单变化时重置测试状态
  testStatus.value = ''
  testMessage.value = ''
}

async function handleTest() {
  if (!canTest.value) return
  testing.value = true
  testStatus.value = ''
  testMessage.value = ''

  try {
    const baseUrl = getApiBase()
    const res = await fetch(`${baseUrl}/api/ai/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: form.value, messages: [] }),
    })

    const data = await res.json()
    if (data.success) {
      testStatus.value = 'success'
      testMessage.value = data.message ?? '连接成功'
    } else {
      testStatus.value = 'fail'
      testMessage.value = data.message ?? '连接失败'
    }
  } catch (err) {
    testStatus.value = 'fail'
    testMessage.value = err instanceof Error ? err.message : '网络请求失败'
  } finally {
    testing.value = false
  }
}

function handleSave() {
  if (testStatus.value !== 'success') return
  emit('save', { ...form.value })
  visible.value = false
}
</script>
