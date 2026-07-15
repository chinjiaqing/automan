<template>
  <div class="image-value-input">
    <div v-if="isImageValue" class="image-value-input__preview">
      <img :src="modelValue" class="image-value-input__img" />
      <button class="image-value-input__remove" title="移除图片" @click.stop="updateValue('')">
        <i class="pi pi-times" style="font-size: 10px;" />
      </button>
    </div>

    <DataRefInput
      :value="modelValue"
      :placeholder="placeholder ?? '上传图片或引用图片变量'"
      :upstream-nodes="upstreamNodes"
      :variable-nodes="variableNodes"
      @update:modelValue="updateValue"
    />

    <Button
      outlined
      severity="secondary"
      size="small"
      class="w-full mt-1.5"
      :label="isImageValue ? '点击替换图片' : '点击上传图片'"
      :icon="isImageValue ? 'pi pi-pencil' : 'pi pi-upload'"
      @click="fileInput?.click()"
    />
    <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import DataRefInput from './DataRefInput.vue'
import type { OutputPort } from '@automan/shared/types.js'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  upstreamNodes: Array<{ id: string; label: string; type: string; outputs?: OutputPort[] }>
  variableNodes: Array<{ name: string; label: string; nodeId: string; scope?: string }>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const fileInput = ref<HTMLInputElement | null>(null)

const isImageValue = computed(() => /^data:image\/[^;]+;base64,/.test(props.modelValue))

function updateValue(value: string) {
  emit('update:modelValue', value)
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    updateValue(String(reader.result ?? ''))
    input.value = ''
  }
  reader.readAsDataURL(file)
}
</script>

<style scoped>
.image-value-input {
  display: flex;
  flex-direction: column;
}

.image-value-input__preview {
  position: relative;
  display: inline-block;
  max-width: 100%;
  margin-bottom: 6px;
  overflow: visible;
}

.image-value-input__img {
  display: block;
  max-width: 100%;
  max-height: 80px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}

.image-value-input__remove {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ef4444;
  color: white;
  border: 2px solid white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: background 0.15s;
  z-index: 1;
}

.image-value-input__remove:hover {
  background: #dc2626;
}
</style>
