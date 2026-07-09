import { api } from './index.js'
import type {
  DeviceInfo,
  CreateDeviceRequest,
  DeleteDeviceRequest,
  BrowseResponse,
  LDInstanceInfo,
  ScreenshotResponse,
  FindPicRequest,
  FindPicResponse,
} from '@automan/shared/types.js'

export const deviceApi = {
  /** 查询设备列表 */
  list: () => api.get<DeviceInfo[]>('/api/devices'),

  /** 创建设备 */
  create: (data: CreateDeviceRequest) => api.post<DeviceInfo>('/api/devices/create', data),

  /** 删除设备 */
  remove: (data: DeleteDeviceRequest) => api.post<{ id: string }>('/api/devices/delete', data),

  /** 更新设备名称 */
  update: (data: { id: string; name: string }) =>
    api.post<DeviceInfo>('/api/devices/update', data),

  /** 查询模拟器实例列表 */
  instances: (ldconsolePath: string) =>
    api.post<LDInstanceInfo[]>('/api/devices/instances', { ldconsolePath }),

  /** 设备截屏 */
  screenshot: (deviceId: string) =>
    api.post<ScreenshotResponse>('/api/devices/screenshot', { deviceId }),

  /** 找图（模板匹配） */
  findPic: (data: FindPicRequest) =>
    api.post<FindPicResponse>('/api/devices/find-pic', data),
}

/** 文件系统浏览 */
export const filesystemApi = {
  browse: (path?: string) =>
    api.get<BrowseResponse>(`/api/filesystem/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`),
}
