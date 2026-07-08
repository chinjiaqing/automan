<template>
  <aside class="w-60 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
    <!-- 标题 + 添加按钮 -->
    <div class="px-4 pt-4 pb-2 flex items-center justify-between">
      <span class="text-sm font-semibold text-gray-500 uppercase tracking-wider">设备列表</span>
      <button
        class="text-xs text-brand-600 hover:text-brand-700 transition-colors cursor-pointer flex items-center gap-0.5"
        @click="openCreate"
      >
        <i class="pi pi-plus text-xs" />
        添加
      </button>
    </div>

    <!-- 设备列表 -->
    <nav class="flex-1 overflow-y-auto px-2">
      <template v-if="devices.length === 0 && !loading">
        <div class="text-sm text-gray-400 px-3 py-8 text-center">
          <i class="pi pi-inbox text-3xl text-gray-300 mb-2 block" />
          暂无设备
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
          <button
            class="p-1 rounded hover:bg-gray-200 transition-colors"
            title="重命名"
            @click.stop="openEdit(device)"
          >
            <i class="pi pi-pencil text-xs text-gray-500" />
          </button>
          <button
            class="p-1 rounded hover:bg-red-100 transition-colors"
            title="删除"
            @click.stop="confirmDelete(device)"
          >
            <i class="pi pi-trash text-xs text-red-500" />
          </button>
        </div>
      </div>
    </nav>

    <!-- 设备弹窗 -->
    <DeviceDialog
      v-model:visible="dialogVisible"
      :device="editDevice"
      @saved="onSaved"
    />

    <!-- 删除确认弹窗 -->
    <Dialog
      v-model:visible="deleteVisible"
      header="确认删除"
      :modal="true"
      :style="{ width: '380px' }"
    >
      <p class="text-sm text-gray-600 mb-4">
        确定要删除设备「{{ deleteTarget?.name }}」吗？此操作不可撤销。
      </p>
      <template #footer>
        <button class="btn-ghost" @click="deleteVisible = false">取消</button>
        <button class="btn-danger" @click="handleDelete">删除</button>
      </template>
    </Dialog>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Dialog from 'primevue/dialog'
import type { DeviceInfo } from '@automan/shared/types.js'
import { useDevices } from '../composables/useDevices.js'
import DeviceDialog from './DeviceDialog.vue'

const { devices, loading, deleteDevice } = useDevices()

const selectedId = ref('')

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
</script>
