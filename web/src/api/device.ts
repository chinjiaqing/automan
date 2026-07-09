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
  GetWordsRequest,
  GetWordsResponse,
  FindStrRequest,
  FindStrResponse,
  AdbClickRequest,
  AdbAreaClickRequest,
  AdbClickResponse,
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

  /** OCR 识字 */
  ocrWords: (data: GetWordsRequest) =>
    api.post<GetWordsResponse>('/api/devices/ocr-words', data),

  /** OCR 找字 */
  ocrFindStr: (data: FindStrRequest) =>
    api.post<FindStrResponse>('/api/devices/ocr-find-str', data),

  /** ADB 单点点击 */
  click: (data: AdbClickRequest) =>
    api.post<AdbClickResponse>('/api/devices/click', data),

  /** ADB 范围随机点击 */
  areaClick: (data: AdbAreaClickRequest) =>
    api.post<AdbClickResponse>('/api/devices/area-click', data),
}

/** 文件系统浏览 */
export const filesystemApi = {
  browse: (path?: string) =>
    api.get<BrowseResponse>(`/api/filesystem/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`),
}
