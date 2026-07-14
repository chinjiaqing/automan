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
          class="group flex items-center gap-2 px-3 h-10 rounded-md cursor-pointer transition-colors hover:bg-brand-50 mb-0.5"
          :class="{ 'bg-brand-50 text-brand-700': selectedId === device.id }"
          @click="selectedId = device.id"
        >
          <i
            class="pi text-sm"
            :class="getDeviceStatusIcon(device)"
          />
          <span class="flex-1 text-sm truncate">{{ device.name }}</span>
          <span class="text-xs text-gray-400 truncate max-w-20" :title="device.adbAddress">{{ device.adbAddress }}</span>
          <div v-if="!isDeviceActive(device.id)" class="hidden group-hover:flex items-center gap-0.5">
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
      <div class="flex-1 min-w-0 flex flex-col">
        <!-- 实时看板：独立于日志区，受开关控制 -->
        <ExecutionViewer v-if="showViewer" :screenshot="deviceScreenshot" :annotations="deviceAnnotations" :device-id="selectedId" @manual-refresh="handleManualRefresh" />
        <LogPanel
          :logs="logs"
          :checked-count="getCheckedCount(selectedDevice?.id ?? '')"
          :is-running="isRunning"
          :is-paused="isPaused"
          :elapsed="elapsed"
          :show-viewer="showViewer"
          @start="handleStart"
          @stop="handleStop"
          @pause="handlePause"
          @resume="handleResume"
          @clear="clearLogs"
          @toggle-viewer="showViewer = !showViewer"
        />
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
import { DeviceRunStatus } from '@automan/shared/types.js'
import { useDevices } from '../composables/useDevices.js'
import { useWorkflowRun } from '../composables/useWorkflowRun.js'
import DeviceDialog from '../components/DeviceDialog.vue'
import WorkflowListPanel from '../components/WorkflowListPanel.vue'
import LogPanel from '../components/LogPanel.vue'
import ExecutionViewer from '../components/ExecutionViewer.vue'
import { deviceApi } from '../api/device.js'

const { devices, loading, fetchDevices, deleteDevice } = useDevices()
const { logs, isRunning, elapsed, screenshotMap, annotationMap, deviceRunStatusMap, getCheckedCount, startAll, stopAll, pauseDevice, resumeDevice, clearLogs } = useWorkflowRun()

const selectedId = ref('')
const showViewer = ref(true)
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

/** 手动刷新截图 */
async function handleManualRefresh() {
  if (!selectedId.value) return
  try {
    const res = await deviceApi.screenshot(selectedId.value)
    if (!res.success) return
    const data = res.data as { image: string; width: number; height: number; originalWidth: number; originalHeight: number; timestamp: number }
    const m = new Map(screenshotMap.value)
    m.set(selectedId.value, {
      image: data.image,
      width: data.width,
      height: data.height,
      originalWidth: data.originalWidth,
      originalHeight: data.originalHeight,
      timestamp: data.timestamp,
    })
    screenshotMap.value = m
  } catch {
    // 静默失败
  }
}

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

/** 当前设备是否处于暂停状态 */
const isPaused = computed(() => {
  if (!selectedId.value) return false
  return deviceRunStatusMap.value.get(selectedId.value)?.status === DeviceRunStatus.PAUSED
})

/** 设备是否有活跃的工作流（运行中或暂停） */
function isDeviceActive(deviceId: string): boolean {
  const status = deviceRunStatusMap.value.get(deviceId)?.status
  return status === DeviceRunStatus.RUNNING || status === DeviceRunStatus.PAUSED || status === DeviceRunStatus.ERROR
}

/** 设备状态图标：结合模拟器状态 + 工作流运行状态 */
function getDeviceStatusIcon(device: DeviceInfo) {
  const runStatus = deviceRunStatusMap.value.get(device.id)
  if (runStatus?.status === DeviceRunStatus.PAUSED) return 'pi-pause-circle text-blue-500'
  if (runStatus?.status === DeviceRunStatus.RUNNING) return 'pi-circle-fill text-orange-500'
  if (runStatus?.status === DeviceRunStatus.ERROR) return 'pi-circle-fill text-red-500'
  if (device.status === 'running') return 'pi-circle-fill text-green-500'
  return 'pi-circle text-gray-400'
}

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

async function handlePause() {
  if (!selectedDevice.value) return
  await pauseDevice(selectedDevice.value.id)
}

async function handleResume() {
  if (!selectedDevice.value) return
  await resumeDevice(selectedDevice.value.id)
}
</script>

