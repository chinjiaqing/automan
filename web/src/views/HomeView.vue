<template>
  <div class="h-full flex">
    <!-- 第一栏：设备列表 -->
    <aside class="w-60 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
      <div class="px-4 pt-4 pb-2 flex items-center justify-between">
        <span class="text-sm font-semibold text-gray-500 uppercase tracking-wider">设备列表</span>
        <Button text size="small" icon="pi pi-plus" label="添加" @click="openCreate" />
      </div>

      <nav class="flex-1 overflow-y-auto px-2">
        <template v-if="devices.length === 0 && !loading">
          <div class="text-sm text-gray-400 px-3 py-8 text-center">
            <i class="pi pi-inbox text-3xl text-gray-300 mb-2 block" />暂无设备
          </div>
        </template>

        <div
          v-for="device in devices"
          :key="device.id"
          class="group flex items-center gap-2 px-3 py-2.5 rounded-md cursor-pointer transition-colors hover:bg-brand-50 mb-0.5"
          :class="{ 'bg-brand-50 text-brand-700': selectedId === device.id }"
          @click="selectedId = device.id"
        >
          <i
            class="pi text-sm"
            :class="device.status === 'running' ? 'pi-circle-fill text-green-500' : 'pi-circle text-gray-400'"
          />
          <span class="flex-1 text-sm truncate">{{ device.name }}</span>
          <div class="hidden group-hover:flex items-center gap-0.5">
            <Button text rounded severity="secondary" size="small" icon="pi pi-pencil" title="重命名" @click.stop="openEdit(device)" />
            <Button text rounded severity="danger" size="small" icon="pi pi-trash" title="删除" @click.stop="confirmDelete(device)" />
          </div>
        </div>
      </nav>
    </aside>

    <!-- 第二栏 + 第三栏（选中设备后显示） -->
    <template v-if="selectedDevice">
      <!-- 第二栏：工作流列表 -->
      <div class="w-56 flex-shrink-0">
        <WorkflowListPanel :device-id="selectedDevice.id" />
      </div>

      <!-- 第三栏：操作按钮 + 看板 + 日志 -->
      <div class="flex-1 min-w-0">
        <LogPanel
          :logs="logs"
          :checked-count="checkedCount"
          :is-running="isRunning"
          :elapsed="elapsed"
          @start="handleStart"
          @stop="handleStop"
          @clear="clearLogs"
        >
          <!-- 实时看板：在操作按钮下方、日志上方 -->
          <ExecutionViewer :screenshot="deviceScreenshot" :annotations="deviceAnnotations" />
        </LogPanel>
      </div>
    </template>

    <!-- 未选中设备占位 -->
    <main v-else class="flex-1 flex items-center justify-center bg-gray-50">
      <div class="text-center text-gray-400">
        <i class="pi pi-mobile text-5xl mb-3 block" />
        <p>选择设备开始配置</p>
      </div>
    </main>

    <!-- 新增/编辑弹窗 -->
    <DeviceDialog v-model:visible="dialogVisible" :device="editDevice" @saved="onSaved" />

    <!-- 删除确认弹窗 -->
    <Dialog v-model:visible="deleteVisible" header="确认删除" :modal="true" :style="{ width: '380px' }">
      <p class="text-sm text-gray-600 mb-4">
        确定要删除设备「{{ deleteTarget?.name }}」吗？此操作不可撤销。
      </p>
      <template #footer>
        <Button severity="secondary" text label="取消" @click="deleteVisible = false" />
        <Button severity="danger" label="删除" @click="handleDelete" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import type { DeviceInfo } from '@automan/shared/types.js'
import { useDevices } from '../composables/useDevices.js'
import { useWorkflowRun } from '../composables/useWorkflowRun.js'
import DeviceDialog from '../components/DeviceDialog.vue'
import WorkflowListPanel from '../components/WorkflowListPanel.vue'
import LogPanel from '../components/LogPanel.vue'
import ExecutionViewer from '../components/ExecutionViewer.vue'

const { devices, loading, fetchDevices, deleteDevice } = useDevices()
const { logs, checkedCount, isRunning, elapsed, screenshotMap, annotationMap, startAll, stopAll, clearLogs } = useWorkflowRun()

const selectedId = ref('')
const selectedDevice = computed(() => devices.value.find((d) => d.id === selectedId.value))

/** 当前设备的最新截图 */
const deviceScreenshot = computed(() => {
  if (!selectedId.value) return null
  return screenshotMap.value.get(selectedId.value) ?? null
})

/** 当前设备的最新注解 */
const deviceAnnotations = computed(() => {
  if (!selectedId.value) return null
  return annotationMap.value.get(selectedId.value) ?? null
})

onMounted(async () => {
  await fetchDevices()
  // 默认选中第一个设备
  if (devices.value.length > 0 && !selectedId.value) {
    selectedId.value = devices.value[0].id
  }
})

// ── 新增/编辑弹窗 ──
const dialogVisible = ref(false)
const editDevice = ref<DeviceInfo | null>(null)

function openCreate() {
  editDevice.value = null
  dialogVisible.value = true
}

function openEdit(device: DeviceInfo) {
  editDevice.value = device
  dialogVisible.value = true
}

function onSaved() {
  dialogVisible.value = false
}

// ── 删除确认 ──
const deleteVisible = ref(false)
const deleteTarget = ref<DeviceInfo | null>(null)

function confirmDelete(device: DeviceInfo) {
  deleteTarget.value = device
  deleteVisible.value = true
}

async function handleDelete() {
  if (deleteTarget.value) {
    await deleteDevice(deleteTarget.value.id)
    if (selectedId.value === deleteTarget.value.id) {
      selectedId.value = ''
    }
  }
  deleteVisible.value = false
}

// ── 运行控制 ──
async function handleStart() {
  if (!selectedDevice.value) return
  await startAll(selectedDevice.value.id)
}

async function handleStop() {
  await stopAll()
}
</script>

