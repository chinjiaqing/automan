import { api } from './index.js'
import type {
  Workflow,
  CreateWorkflowRequest,
  SaveWorkflowRequest,
  RunWorkflowRequest,
  StopWorkflowRequest,
  WorkflowRunInfo,
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

  /** 启动工作流 */
  run: (data: RunWorkflowRequest) =>
    api.post<WorkflowRunInfo>('/api/workflows/run', data),

  /** 停止工作流 */
  stop: (data: StopWorkflowRequest) =>
    api.post<{ runId: string }>('/api/workflows/stop', data),

  /** 查询运行中的工作流 */
  running: () => api.get<WorkflowRunInfo[]>('/api/workflows/running'),
}
