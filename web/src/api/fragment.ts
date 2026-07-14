import { api } from './index.js'
import type {
  Fragment,
  FragmentGroup,
  CreateFragmentRequest,
  SaveFragmentRequest,
  CreateFragmentGroupRequest,
  UpdateFragmentGroupRequest,
} from '@automan/shared/types.js'

export const fragmentApi = {
  // ── 片段分组 ──────────────────────────────
  /** 查询所有分组 */
  listGroups: () => api.get<FragmentGroup[]>('/api/fragment-groups'),

  /** 创建分组 */
  createGroup: (data: CreateFragmentGroupRequest) =>
    api.post<FragmentGroup>('/api/fragment-groups', data),

  /** 更新分组 */
  updateGroup: (data: UpdateFragmentGroupRequest) =>
    api.post<FragmentGroup>('/api/fragment-groups/update', data),

  /** 删除分组 */
  deleteGroup: (id: string) =>
    api.post<{ id: string }>('/api/fragment-groups/delete', { id }),

  // ── 片段 ──────────────────────────────────
  /** 查询所有片段 */
  list: () => api.get<Fragment[]>('/api/fragments'),

  /** 创建片段 */
  create: (data: CreateFragmentRequest) =>
    api.post<Fragment>('/api/fragments', data),

  /** 获取单个片段 */
  get: (id: string) => api.get<Fragment>(`/api/fragments/${id}`),

  /** 保存片段 */
  save: (id: string, data: SaveFragmentRequest) =>
    api.post<Fragment>(`/api/fragments/${id}/save`, data),

  /** 删除片段 */
  remove: (id: string) =>
    api.post<{ id: string }>(`/api/fragments/${id}/delete`),
}
