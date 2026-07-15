<template>
  <div class="io-editor">
    <!-- 输入参数 -->
    <div class="io-editor__section">
      <div class="io-editor__header">
        <span class="text-xs font-semibold text-gray-600">输入参数</span>
        <Button size="small" text icon="pi pi-plus" @click="addParam('inputs')" />
      </div>
      <div v-for="(p, i) in inputs" :key="p.name" class="io-editor__row">
        <div class="io-editor__label-col">
          <InputText size="small" v-model="p.label" class="io-editor__label" @update:modelValue="emitUpdate" />
          <span class="io-editor__var">{{ p.name }}</span>
        </div>
        <InputText size="small" v-model="p.defaultValue" placeholder="默认值" class="io-editor__default"
          @update:modelValue="emitUpdate" />
        <Select size="small" v-model="p.type" :options="typeOptions" option-label="label" option-value="value"
          class="io-editor__type" @update:modelValue="emitUpdate" />
        <Button size="small" text severity="danger" icon="pi pi-times" @click="removeParam('inputs', i)" />
      </div>
      <div v-if="inputs.length === 0" class="text-xs text-gray-400 text-center py-2">无输入参数</div>
    </div>

    <!-- 输出参数 -->
    <div class="io-editor__section">
      <div class="io-editor__header">
        <span class="text-xs font-semibold text-gray-600">输出参数</span>
        <Button size="small" text icon="pi pi-plus" @click="addParam('outputs')" />
      </div>
      <div v-for="(p, i) in outputs" :key="p.name" class="io-editor__row">
        <div class="io-editor__label-col">
          <InputText size="small" v-model="p.label" class="io-editor__label" @update:modelValue="emitUpdate" />
          <span class="io-editor__var">{{ p.name }}</span>
        </div>
        <InputText size="small" v-model="p.defaultValue" placeholder="默认值" class="io-editor__default"
          @update:modelValue="emitUpdate" />
        <Select size="small" v-model="p.type" :options="typeOptions" option-label="label" option-value="value"
          class="io-editor__type" @update:modelValue="emitUpdate" />
        <Button size="small" text severity="danger" icon="pi pi-times" @click="removeParam('outputs', i)" />
      </div>
      <div v-if="outputs.length === 0" class="text-xs text-gray-400 text-center py-2">无输出参数</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import type { FragmentParam } from '@automan/shared/types.js'

const props = defineProps<{
  inputs: FragmentParam[]
  outputs: FragmentParam[]
}>()

const emit = defineEmits<{
  'update:inputs': [value: FragmentParam[]]
  'update:outputs': [value: FragmentParam[]]
}>()

// Local copies for v-model editing
const inputs = ref<FragmentParam[]>(JSON.parse(JSON.stringify(props.inputs ?? [])))
const outputs = ref<FragmentParam[]>(JSON.parse(JSON.stringify(props.outputs ?? [])))

watch(() => props.inputs, (v) => {
  inputs.value = JSON.parse(JSON.stringify(v ?? []))
}, { deep: true })

watch(() => props.outputs, (v) => {
  outputs.value = JSON.parse(JSON.stringify(v ?? []))
}, { deep: true })

const typeOptions = [
  { label: '字符串', value: 'string' },
  { label: '数字', value: 'number' },
  { label: '图片', value: 'image' },
]

/** 随机生成变量名，如 input_ax1jak */
function generateVarName(prefix: 'input' | 'output'): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return `${prefix}_${s}`
}

function addParam(which: 'inputs' | 'outputs') {
  const prefix = which === 'inputs' ? 'input' : 'output'
  const labelPrefix = which === 'inputs' ? '入参' : '出参'
  const list = which === 'inputs' ? inputs.value : outputs.value
  const param: FragmentParam = {
    name: generateVarName(prefix),
    type: 'string',
    label: `${labelPrefix}${list.length + 1}`,
  }
  if (which === 'inputs') {
    inputs.value.push(param)
  } else {
    outputs.value.push(param)
  }
  emitUpdate()
}

function removeParam(which: 'inputs' | 'outputs', idx: number) {
  if (which === 'inputs') {
    inputs.value.splice(idx, 1)
  } else {
    outputs.value.splice(idx, 1)
  }
  emitUpdate()
}

function emitUpdate() {
  emit('update:inputs', inputs.value)
  emit('update:outputs', outputs.value)
}
</script>

<style scoped>
.io-editor {
  display: flex;
  gap: 20px;
}

.io-editor__section {
  flex: 1;
  min-width: 0;
}

.io-editor__header {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}

.io-editor__row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 6px;
}

.io-editor__label-col {
  flex: 2;
  min-width: 0;
}

.io-editor__label {
  width: 100%;
}

.io-editor__var {
  display: block;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.4;
  margin-top: 2px;
  padding-left: 2px;
  font-family: monospace;
}

.io-editor__default {
  flex: 1;
  min-width: 0;
  margin-top: 1px;
}

.io-editor__type {
  flex: 1;
  min-width: 0;
  margin-top: 1px;
}
</style>
