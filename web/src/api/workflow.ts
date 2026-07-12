import { api } from './index.js'
import type {
  Workflow,
  CreateWorkflowRequest,
  SaveWorkflowRequest,
  RunWorkflowRequest,
  StopWorkflowRequest,
  WorkflowRunInfo,
  BatchRunWorkflowRequest,
  BatchRunWorkflowResponse,
  SaveCheckedWorkflowsRequest,
  CheckedWorkflowsSnapshot,
  DeviceRunStatusInfo,
  SaveRunConfigRequest,
  WorkflowRunConfig,
} from '@automan/shared/types.js'

export const workflowApi = {
  /** 查询工作流列表 */
  list: () => api.get<Workflow[]>('/api/workflows'),

  /** 创建工作流 */
  create: (data: CreateWorkflowRequest) =>
    api.post<Workflow>('/api/workflows', data),

  /** 获取单个工作流 */
  get: (id: string) => api.get<Workflow>(`/api/workflows/${id}`),

  /** 保存工作流（nodes + edges） */
  save: (id: string, data: SaveWorkflowRequest) =>
    api.post<Workflow>(`/api/workflows/${id}/save`, data),

  /** 删除工作流 */
  remove: (id: string) => api.post<{ id: string }>(`/api/workflows/${id}/delete`),

  /** 启动工作流（单个，向后兼容） */
  run: (data: RunWorkflowRequest) =>
    api.post<WorkflowRunInfo>('/api/workflows/run', data),

  /** 批量启动工作流（设备级） */
  batchRun: (data: BatchRunWorkflowRequest) =>
    api.post<BatchRunWorkflowResponse>('/api/workflows/run-batch', data),

  /** 停止工作流 */
  stop: (data: StopWorkflowRequest) =>
    api.post<{ runId: string }>('/api/workflows/stop', data),

  /** 查询运行中的工作流 */
  running: () => api.get<WorkflowRunInfo[]>('/api/workflows/running'),

  /** 保存勾选快照 */
  saveChecked: (data: SaveCheckedWorkflowsRequest) =>
    api.post<CheckedWorkflowsSnapshot>('/api/workflows/checked-save', data),

  /** 查询单设备勾选快照 */
  getChecked: (deviceId: string) =>
    api.get<CheckedWorkflowsSnapshot>(`/api/workflows/checked/${deviceId}`),

  /** 查询所有设备勾选快照 */
  getAllChecked: () =>
    api.get<CheckedWorkflowsSnapshot[]>('/api/workflows/checked'),

  /** 查询所有设备运行状态 */
  getDeviceStatuses: () =>
    api.get<DeviceRunStatusInfo[]>('/api/workflows/device-status'),

  /** 保存运行配置（upsert） */
  saveRunConfig: (data: SaveRunConfigRequest) =>
    api.post<WorkflowRunConfig>('/api/workflows/run-config', data),

  /** 查询单个运行配置 */
  getRunConfig: (deviceId: string, workflowId: string) =>
    api.get<WorkflowRunConfig>(`/api/workflows/run-config/${deviceId}/${workflowId}`),

  /** 查询设备下所有运行配置 */
  getRunConfigs: (deviceId: string) =>
    api.get<WorkflowRunConfig[]>(`/api/workflows/run-configs/${deviceId}`),
}
