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

      <!-- ADB 地址 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">ADB 地址</label>
        <InputText
          v-model="form.adbAddress"
          class="w-full"
          placeholder="序列号 / ip:port"
        />
        <p class="text-xs text-gray-400 mt-1">
          雷电模拟器填 127.0.0.1:端口，USB 真机填序列号，WiFi 填 ip:port
        </p>
      </div>

      <!-- 运行效率 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">运行效率</label>
        <div class="flex items-center gap-4">
          <span class="text-xs text-gray-400 w-6 text-right">2</span>
          <Slider v-model="form.screenshotInterval" :min="2" :max="30" :step="1" class="flex-1" />
          <span class="text-xs text-gray-400 w-6">30</span>
          <span class="text-sm font-semibold text-brand-600 w-10 text-center">{{ form.screenshotInterval }}</span>
        </div>
        <p class="text-xs text-gray-400 mt-1.5">值越低效率越高，越容易卡顿</p>
      </div>

      <!-- 操作按钮 -->
      <div class="flex gap-2">
        <Button
          severity="secondary"
          text
          size="small"
          :icon="discovering ? 'pi pi-spinner pi-spin' : 'pi pi-search'"
          :label="discovering ? '扫描中...' : '扫描设备'"
          :disabled="discovering"
          @click="handleDiscover"
        />
        <Button
          severity="secondary"
          text
          size="small"
          :icon="testing ? 'pi pi-spinner pi-spin' : 'pi pi-plug'"
          :label="testing ? '测试中...' : '测试连接'"
          :disabled="testing || !form.adbAddress.trim()"
          @click="handleTestConnection"
        />
      </div>

      <!-- 扫描结果 -->
      <div v-if="discoveredDevices.length > 0">
        <label class="block text-xs text-gray-500 mb-1">扫描结果（点击自动填入地址）</label>
        <div class="border border-gray-200 rounded max-h-36 overflow-y-auto">
          <table class="w-full text-xs">
            <thead class="bg-gray-50 sticky top-0">
              <tr>
                <th class="text-left px-2 py-1 text-gray-500 font-medium">地址</th>
                <th class="text-left px-2 py-1 text-gray-500 font-medium">类型</th>
                <th class="text-left px-2 py-1 text-gray-500 font-medium">状态</th>
                <th class="text-left px-2 py-1 text-gray-500 font-medium">型号</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="d in discoveredDevices"
                :key="d.serial"
                class="cursor-pointer hover:bg-brand-50 transition-colors"
                @click="form.adbAddress = d.serial"
              >
                <td class="px-2 py-1 font-mono">
                  <span
                    class="text-xs font-sans mr-1 rounded px-1 py-0.5"
                    :class="d.transportType === 'emulator' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'"
                  >
                    {{ d.transportType === 'emulator' ? '模拟器' : '真机' }}
                  </span>
                  {{ d.serial }}
                </td>
                <td class="px-2 py-1">{{ d.transportType === 'usb' ? 'USB' : d.transportType === 'emulator' ? '模拟器' : 'WiFi' }}</td>
                <td class="px-2 py-1">
                  <span :class="d.status === 'device' ? 'text-green-600' : 'text-red-500'">
                    {{ d.status === 'device' ? '在线' : d.status }}
                  </span>
                </td>
                <td class="px-2 py-1 text-gray-500">{{ d.model || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 测试结果 -->
      <div v-if="testResult" class="text-sm rounded px-3 py-2" :class="testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'">
        <i :class="testResult.success ? 'pi pi-check-circle mr-1' : 'pi pi-times-circle mr-1'" />
        {{ testResult.message }}
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
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Slider from 'primevue/slider'
import type { DeviceInfo, DiscoveredDevice, TestConnectionResponse } from '@automan/shared/types.js'
import { deviceApi } from '../api/device.js'
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
  adbAddress: '',
  screenshotInterval: 2,
})

// ── 扫描设备 ──
const discovering = ref(false)
const discoveredDevices = ref<DiscoveredDevice[]>([])

async function handleDiscover() {
  discovering.value = true
  discoveredDevices.value = []
  try {
    const res = await deviceApi.discover()
    if (res.success) {
      discoveredDevices.value = res.data
    } else {
      errorMsg.value = 'message' in res ? res.message : '扫描失败'
    }
  } catch {
    errorMsg.value = '扫描设备请求失败'
  } finally {
    discovering.value = false
  }
}

// ── 测试连接 ──
const testing = ref(false)
const testResult = ref<TestConnectionResponse | null>(null)

async function handleTestConnection() {
  testing.value = true
  testResult.value = null
  try {
    const res = await deviceApi.testConnection({ adbAddress: form.value.adbAddress.trim() })
    if (res.success) {
      testResult.value = res.data
    } else {
      errorMsg.value = 'message' in res ? res.message : '测试连接失败'
    }
  } catch {
    errorMsg.value = '测试连接请求失败'
  } finally {
    testing.value = false
  }
}

// 弹窗打开时初始化表单
watch(
  () => props.visible,
  (val) => {
    if (val && props.device) {
      form.value = {
        name: props.device.name,
        adbAddress: props.device.adbAddress,
        screenshotInterval: props.device.screenshotInterval ?? 2,
      }
    } else if (val) {
      form.value = { name: '', adbAddress: '', screenshotInterval: 2 }
      discoveredDevices.value = []
      testResult.value = null
    }
    errorMsg.value = ''
  },
)

// ── 提交 ──
async function handleSubmit() {
  errorMsg.value = ''
  if (!form.value.name.trim()) {
    errorMsg.value = '请输入设备别名'
    return
  }
  if (!form.value.adbAddress.trim()) {
    errorMsg.value = '请输入 ADB 地址'
    return
  }

  submitting.value = true
  try {
    if (isEdit.value && props.device) {
      const res = await renameDevice(props.device.id, form.value.name.trim(), form.value.screenshotInterval)
      if (!res.success) {
        errorMsg.value = 'message' in res ? res.message : '更新失败'
        return
      }
    } else {
      const res = await createDevice({
        name: form.value.name.trim(),
        adbAddress: form.value.adbAddress.trim(),
        screenshotInterval: form.value.screenshotInterval,
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
