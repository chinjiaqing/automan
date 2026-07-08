import { ref } from 'vue'
import type { DeviceInfo, CreateDeviceRequest } from '@automan/shared/types.js'
import { deviceApi } from '../api/device.js'

const devices = ref<DeviceInfo[]>([])
const loading = ref(false)

export function useDevices() {
  async function fetchDevices() {
    loading.value = true
    try {
      const res = await deviceApi.list()
      if (res.success) {
        devices.value = res.data
      }
    } finally {
      loading.value = false
    }
  }

  async function createDevice(data: CreateDeviceRequest) {
    const res = await deviceApi.create(data)
    if (res.success) {
      devices.value.push(res.data)
    }
    return res
  }

  async function deleteDevice(id: string) {
    const res = await deviceApi.remove({ id })
    if (res.success) {
      devices.value = devices.value.filter((d) => d.id !== id)
    }
    return res
  }

  async function renameDevice(id: string, name: string) {
    const res = await deviceApi.update({ id, name })
    if (res.success) {
      const idx = devices.value.findIndex((d) => d.id === id)
      if (idx !== -1) {
        devices.value[idx] = res.data
      }
    }
    return res
  }

  return {
    devices,
    loading,
    fetchDevices,
    createDevice,
    deleteDevice,
    renameDevice,
  }
}
