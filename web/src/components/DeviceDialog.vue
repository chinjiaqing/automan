<template>
  <Dialog
    :visible="visible"
    :header="isEdit ? '编辑设备' : '添加设备'"
    :modal="true"
    :style="{ width: '520px' }"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="flex flex-col gap-4 pt-2">
      <!-- 别名 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">设备别名</label>
        <InputText
          v-model="form.name"
          class="w-full"
          placeholder="如：大号专用"
          maxlength="30"
        />
      </div>

      <!-- 模拟器路径选择器 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">ldconsole.exe 路径</label>
        <div class="flex gap-2">
          <InputText
            v-model="form.ldconsolePath"
            class="flex-1"
            placeholder="点击下方按钮浏览选择"
            readonly
          />
          <Button severity="secondary" text icon="pi pi-folder" label="浏览" @click="openBrowser" />
        </div>
        <p v-if="pathStatus === 'valid'" class="text-xs text-green-600 mt-1 flex items-center gap-1">
          <i class="pi pi-check-circle" />
          路径有效，已加载实例列表
        </p>
        <p v-else-if="pathStatus === 'invalid'" class="text-xs text-red-500 mt-1 flex items-center gap-1">
          <i class="pi pi-times-circle" />
          路径无效，请重新选择 ldconsole.exe
        </p>
      </div>

      <!-- 实例选择 -->
      <div v-if="instances.length > 0">
        <label class="block text-sm font-medium text-gray-700 mb-1">选择模拟器实例</label>
        <div class="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
          <label
            v-for="inst in instances"
            :key="inst.index"
            class="flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-brand-50 border border-gray-200"
            :class="{ 'bg-brand-50 border-brand-400': form.instanceIndex === inst.index }"
          >
            <input
              v-model.number="form.instanceIndex"
              type="radio"
              :value="inst.index"
              class="accent-brand-600"
            />
            <i
              class="pi text-sm"
              :class="inst.running ? 'pi-circle-fill text-green-500' : 'pi-circle text-gray-400'"
            />
            <span class="text-sm">{{ inst.name }}</span>
            <span class="text-xs text-gray-400 ml-auto">
              {{ inst.running ? '运行中' : '已停止' }}
            </span>
          </label>
        </div>
      </div>
      <div v-else-if="instancesLoading" class="text-sm text-gray-400 flex items-center gap-2">
        <i class="pi pi-spinner pi-spin" />
        正在加载实例列表...
      </div>

      <!-- 错误提示 -->
      <p v-if="errorMsg" class="text-sm text-red-500 flex items-center gap-1">
        <i class="pi pi-exclamation-circle" />
        {{ errorMsg }}
      </p>
    </div>

    <template #footer>
      <Button severity="secondary" text label="取消" @click="$emit('update:visible', false)" />
      <Button :label="submitting ? '提交中...' : (isEdit ? '保存' : '创建')" :disabled="submitting" :icon="submitting ? 'pi pi-spinner pi-spin' : undefined" @click="handleSubmit" />
    </template>
  </Dialog>

  <!-- 文件浏览器弹窗 -->
  <Dialog
    v-model:visible="browserVisible"
    header="选择 ldconsole.exe"
    :modal="true"
    :style="{ width: '560px' }"
  >
    <div class="flex flex-col gap-2" style="min-height: 320px">
      <!-- 当前路径 -->
      <div class="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded">
        <i class="pi pi-folder-open text-brand-500" />
        <span class="truncate">{{ browserPath || '请选择磁盘' }}</span>
      </div>

      <!-- 返回上级 -->
      <Button
        v-if="browserParent !== null"
        text
        severity="secondary"
        size="small"
        icon="pi pi-arrow-up"
        label="返回上级"
        @click="navigateTo(browserParent!)"
      />

      <!-- 文件列表 -->
      <div class="flex-1 overflow-y-auto border border-gray-200 rounded">
        <div
          v-for="entry in browserEntries"
          :key="entry.path"
          class="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors hover:bg-brand-50 text-sm"
          @click="handleBrowserClick(entry)"
        >
          <i
            class="pi"
            :class="entry.isDirectory ? 'pi-folder text-yellow-500' : 'pi-file text-gray-500'"
          />
          <span :class="{ 'font-medium': !entry.isDirectory }">{{ entry.name }}</span>
        </div>
        <div v-if="browserLoading" class="p-4 text-center text-sm text-gray-400">
          <i class="pi pi-spinner pi-spin mr-1" />
          加载中...
        </div>
        <div v-else-if="browserEntries.length === 0" class="p-4 text-center text-sm text-gray-400">
          目录为空
        </div>
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import type { DeviceInfo, FileEntry, LDInstanceInfo } from '@automan/shared/types.js'
import { deviceApi, filesystemApi } from '../api/device.js'
import { useDevices } from '../composables/useDevices.js'

const props = defineProps<{
  visible: boolean
  device: DeviceInfo | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: []
}>()

const { createDevice, renameDevice } = useDevices()

const isEdit = computed(() => !!props.device)
const submitting = ref(false)
const errorMsg = ref('')

const form = ref({
  name: '',
  ldconsolePath: '',
  instanceIndex: -1,
})

const pathStatus = ref<'unknown' | 'valid' | 'invalid'>('unknown')
const instances = ref<LDInstanceInfo[]>([])
const instancesLoading = ref(false)

// ── 文件浏览器状态 ──
const browserVisible = ref(false)
const browserPath = ref('')
const browserParent = ref<string | null>(null)
const browserEntries = ref<FileEntry[]>([])
const browserLoading = ref(false)

// 弹窗打开时初始化表单
watch(
  () => props.visible,
  (val) => {
    if (val && props.device) {
      form.value = {
        name: props.device.name,
        ldconsolePath: props.device.ldconsolePath,
        instanceIndex: props.device.instanceIndex,
      }
      // 编辑模式：自动加载实例列表
      if (props.device.ldconsolePath) {
        loadInstances(props.device.ldconsolePath).catch(() => {
          errorMsg.value = '加载实例列表失败'
        })
      }
    } else if (val) {
      form.value = { name: '', ldconsolePath: '', instanceIndex: -1 }
      instances.value = []
      pathStatus.value = 'unknown'
    }
    errorMsg.value = ''
  },
)

// ── 加载实例列表 ──
async function loadInstances(path: string) {
  instancesLoading.value = true
  pathStatus.value = 'unknown'
  try {
    const res = await deviceApi.instances(path)
    if (res.success) {
      instances.value = res.data
      pathStatus.value = 'valid'
      // 如果当前未选择实例，默认选第一个
      if (form.value.instanceIndex < 0 && res.data.length > 0) {
        form.value.instanceIndex = res.data[0].index
      }
    } else {
      instances.value = []
      pathStatus.value = 'invalid'
    }
  } catch {
    instances.value = []
    pathStatus.value = 'invalid'
  } finally {
    instancesLoading.value = false
  }
}

// ── 文件浏览器 ──
async function openBrowser() {
  browserVisible.value = true
  browserLoading.value = true
  browserEntries.value = []
  browserPath.value = ''
  browserParent.value = null
  // 从根目录（磁盘列表）开始
  await navigateTo('')
}

async function navigateTo(path: string) {
  browserLoading.value = true
  try {
    const res = await filesystemApi.browse(path || undefined)
    if (res.success) {
      browserPath.value = res.data.currentPath
      browserParent.value = res.data.parentPath
      browserEntries.value = res.data.entries
    } else {
      errorMsg.value = 'message' in res ? res.message : '浏览失败'
    }
  } catch {
    errorMsg.value = '浏览文件系统失败'
  } finally {
    browserLoading.value = false
  }
}

function handleBrowserClick(entry: FileEntry) {
  if (entry.isDirectory) {
    navigateTo(entry.path)
  } else if (entry.name.toLowerCase() === 'ldconsole.exe') {
    // 选中 ldconsole.exe
    form.value.ldconsolePath = entry.path
    browserVisible.value = false
    // 自动加载实例列表
    loadInstances(entry.path)
  }
}

// ── 提交 ──
async function handleSubmit() {
  errorMsg.value = ''
  if (!form.value.name.trim()) {
    errorMsg.value = '请输入设备别名'
    return
  }
  if (!form.value.ldconsolePath) {
    errorMsg.value = '请选择 ldconsole.exe 路径'
    return
  }
  if (!isEdit.value && form.value.instanceIndex < 0) {
    errorMsg.value = '请选择一个模拟器实例'
    return
  }

  submitting.value = true
  try {
    if (isEdit.value && props.device) {
      const res = await renameDevice(props.device.id, form.value.name.trim())
      if (!res.success) {
        errorMsg.value = 'message' in res ? res.message : '更新失败'
        return
      }
    } else {
      const res = await createDevice({
        name: form.value.name.trim(),
        ldconsolePath: form.value.ldconsolePath,
        instanceIndex: form.value.instanceIndex,
      })
      if (!res.success) {
        errorMsg.value = 'message' in res ? res.message : '创建失败'
        return
      }
    }
    emit('saved')
  } catch {
    errorMsg.value = '网络请求失败'
  } finally {
    submitting.value = false
  }
}
</script>
