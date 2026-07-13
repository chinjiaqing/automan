// ─────────────────────────────────────────────
// useWorkflowRun — 工作流运行控制 composable
// 职责：管理工作流勾选状态（per-device）、启动/停止、日志收集、运行计时、设备运行状态
// ─────────────────────────────────────────────

import { ref, readonly } from 'vue'
import { WsMessageType, DeviceRunStatus } from '@automan/shared/types.js'
import type { WorkflowStatusPayload, ActorLogPayload, WorkflowVisualPayload, DeviceScreenshotPayload, DeviceLogPayload, DeviceRunStatusPayload, DeviceRunStatusInfo } from '@automan/shared/types.js'
import { workflowApi } from '../api/workflow.js'
import { useWebSocket } from './useWebSocket.js'

/** 日志条目 */
export interface LogEntry {
  time: string // MM-DD HH:mm:ss
  level: 'info' | 'error' | 'warn' | 'debug'
  message: string
}

/** 运行中的工作流实例 */
interface RunningWorkflow {
  runId: string
  workflowId: string
}

// ── 模块级单例状态 ──────────────────────────────

/** 勾选状态：per-device → Map<deviceId, Set<workflowId>> */
const checkedMap = ref<Map<string, Set<string>>>(new Map())

const runningWorkflows = ref<RunningWorkflow[]>([])
const logs = ref<LogEntry[]>([])
const isRunning = ref(false)
const startedAt = ref(0)
const elapsed = ref(0)

/** 每设备最新截图 */
const screenshotMap = ref<Map<string, { image: string; width: number; height: number; originalWidth: number; originalHeight: number; timestamp: number }>>(new Map())

/** 每设备最新可视化注解数据 */
const annotationMap = ref<Map<string, { annotations: WorkflowVisualPayload['annotations']; executionCount: number; timestamp: number }>>(new Map())

/** 设备运行状态映射（WS 实时 + REST 恢复） */
const deviceRunStatusMap = ref<Map<string, DeviceRunStatusInfo>>(new Map())

/** 每个工作流的 flowState + 计数（来自 WS WORKFLOW_STATUS 推送） */
const workflowFlowStateMap = ref<Map<string, { flowState: string; successCount: number; failCount: number }>>(new Map())

let timer: ReturnType<typeof setInterval> | null = null
const { on, off } = useWebSocket()

// ── 勾选快照自动保存（防抖）─────────────────
let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSaveChecked(deviceId: string) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const ids = [...(checkedMap.value.get(deviceId) ?? [])]
    workflowApi.saveChecked({ deviceId, workflowIds: ids }).catch(() => { /* ignore */ })
  }, 500)
}

// ── WS 日志监听 ─────────────────────────────────
function onActorLog(payload: unknown) {
  const p = payload as ActorLogPayload
  appendLog(p.level as LogEntry['level'], `[${p.actorId.slice(0, 8)}] ${p.message}`)
}

function onWorkflowStatus(payload: unknown) {
  const p = payload as WorkflowStatusPayload
  const stateLabel = p.state === 'running' ? '执行中' : p.state === 'error' ? '出错' : '空闲'
  appendLog(p.state === 'error' ? 'error' : 'info', `[${p.workflowId.slice(0, 8)}] #${p.executionCount} ${stateLabel}`)

  // 更新 flowState 计数
  if (p.flowState) {
    const m = new Map(workflowFlowStateMap.value)
    m.set(p.workflowId, {
      flowState: p.flowState,
      successCount: p.successCount ?? 0,
      failCount: p.failCount ?? 0,
    })
    workflowFlowStateMap.value = m
  }
}

function onDeviceScreenshot(payload: unknown) {
  const p = payload as DeviceScreenshotPayload
  const m = new Map(screenshotMap.value)
  m.set(p.deviceId, { image: p.image, width: p.width, height: p.height, originalWidth: p.originalWidth, originalHeight: p.originalHeight, timestamp: p.timestamp })
  screenshotMap.value = m
  // 截图更新后清除旧注解，避免坐标不匹配
  const am = new Map(annotationMap.value)
  am.delete(p.deviceId)
  annotationMap.value = am
}

function onWorkflowVisual(payload: unknown) {
  const p = payload as WorkflowVisualPayload
  const sm = new Map(screenshotMap.value)
  sm.set(p.deviceId, { image: p.screenshot, width: p.screenshotWidth, height: p.screenshotHeight, originalWidth: p.originalWidth, originalHeight: p.originalHeight, timestamp: p.timestamp })
  screenshotMap.value = sm
  const am = new Map(annotationMap.value)
  am.set(p.deviceId, { annotations: p.annotations, executionCount: p.executionCount, timestamp: p.timestamp })
  annotationMap.value = am
  appendLog('info', `[visual] ${p.annotations.length} annotations from #${p.executionCount}`)
}

/** 设备级日志（模拟器启动、分辨率校准等） */
function onDeviceLog(payload: unknown) {
  const p = payload as DeviceLogPayload
  appendLog(p.level, p.message)
}

/** 设备运行状态变更（WS 实时推送） */
function onDeviceRunStatus(payload: unknown) {
  const p = payload as DeviceRunStatusPayload
  const m = new Map(deviceRunStatusMap.value)
  m.set(p.deviceId, {
    deviceId: p.deviceId,
    status: p.status,
    activeWorkflowCount: p.activeWorkflowCount,
    runIds: p.runIds,
    updatedAt: p.updatedAt,
  })
  deviceRunStatusMap.value = m

  // 当所有设备都 idle 时，停止计时
  const allIdle = [...m.values()].every((s) => s.status === DeviceRunStatus.IDLE)
  if (allIdle && isRunning.value) {
    isRunning.value = false
    stopTimer()
    runningWorkflows.value = []
    appendLog('info', '所有设备任务已结束')
  }
}

function appendLog(level: LogEntry['level'], message: string) {
  const now = new Date()
  const time = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  logs.value.push({ time, level, message })
  if (logs.value.length > 500) {
    logs.value = logs.value.slice(-500)
  }
}

// 注册 WS 监听
on(WsMessageType.ACTOR_LOG, onActorLog)
on(WsMessageType.WORKFLOW_STATUS, onWorkflowStatus)
on(WsMessageType.WORKFLOW_VISUAL, onWorkflowVisual)
on(WsMessageType.DEVICE_SCREENSHOT, onDeviceScreenshot)
on(WsMessageType.DEVICE_LOG, onDeviceLog)
on(WsMessageType.DEVICE_RUN_STATUS, onDeviceRunStatus)

// ── 计时器 ─────────────────────────────────────
function startTimer() {
  startedAt.value = Date.now()
  elapsed.value = 0
  timer = setInterval(() => {
    elapsed.value = Date.now() - startedAt.value
  }, 1000)
}

function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** 格式化运行时长 HH:mm:ss */
function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0')
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0')
  const s = String(totalSec % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

// ── 状态恢复（页面加载时调用）────────────────
let restored = false

async function restoreState() {
  if (restored) return
  restored = true

  // 1. 恢复勾选快照
  try {
    const checkedRes = await workflowApi.getAllChecked()
    if (checkedRes.success && Array.isArray(checkedRes.data)) {
      const m = new Map<string, Set<string>>()
      for (const snap of checkedRes.data) {
        m.set(snap.deviceId, new Set(snap.workflowIds))
      }
      checkedMap.value = m
    }
  } catch {
    // ignore — 恢复失败不影响正常使用
  }

  // 2. 恢复设备运行状态
  try {
    const statusRes = await workflowApi.getDeviceStatuses()
    if (statusRes.success && Array.isArray(statusRes.data)) {
      const m = new Map<string, DeviceRunStatusInfo>()
      for (const info of statusRes.data) {
        m.set(info.deviceId, info)
      }
      deviceRunStatusMap.value = m

      // 如果有设备在运行，恢复运行状态
      const running = statusRes.data.filter((s) => s.status !== DeviceRunStatus.IDLE)
      if (running.length > 0) {
        const runs: RunningWorkflow[] = []
        for (const info of running) {
          for (const runId of info.runIds) {
            runs.push({ runId, workflowId: '' })
          }
        }
        runningWorkflows.value = runs
        isRunning.value = true
        startTimer()
      }
    }
  } catch {
    // ignore
  }
}

// ── 暴露的接口 ─────────────────────────────────
export function useWorkflowRun() {
  // 懒加载恢复状态（首次调用时触发，而非模块加载时）
  restoreState()
  /** 获取指定设备的已勾选数量 */
  function getCheckedCount(deviceId: string): number {
    return checkedMap.value.get(deviceId)?.size ?? 0
  }

  /** 切换指定设备的某个工作流勾选状态 */
  function toggleCheck(workflowId: string, deviceId: string) {
    const m = new Map(checkedMap.value)
    let deviceSet = m.get(deviceId)
    if (!deviceSet) {
      deviceSet = new Set<string>()
      m.set(deviceId, deviceSet)
    } else {
      // 需要 clone 触发响应式
      deviceSet = new Set(deviceSet)
    }

    if (deviceSet.has(workflowId)) {
      deviceSet.delete(workflowId)
    } else {
      deviceSet.add(workflowId)
    }
    m.set(deviceId, deviceSet)
    checkedMap.value = m

    // 防抖保存快照
    scheduleSaveChecked(deviceId)
  }

  /** 检查指定设备下某个工作流是否已勾选 */
  function isChecked(workflowId: string, deviceId: string): boolean {
    return checkedMap.value.get(deviceId)?.has(workflowId) ?? false
  }

  /** 获取指定设备的已勾选工作流 ID 列表 */
  function getCheckedIds(deviceId: string): string[] {
    return [...(checkedMap.value.get(deviceId) ?? [])]
  }

  /** 批量启动指定设备上已勾选的工作流（单次批量 API） */
  async function startAll(deviceId: string) {
    const ids = getCheckedIds(deviceId)
    if (ids.length === 0) return

    appendLog('info', `启动 ${ids.length} 个工作流...`)

    // 乐观更新：立即设置运行状态，给用户即时反馈
    isRunning.value = true
    startTimer()

    // 保存勾选快照
    scheduleSaveChecked(deviceId)

    try {
      const res = await workflowApi.batchRun({ deviceId, workflowIds: ids })
      if (res.success) {
        for (const item of res.data.items) {
          if (item.success && item.runId) {
            runningWorkflows.value.push({ runId: item.runId, workflowId: item.workflowId })
          } else if (!item.success) {
            appendLog('error', `启动失败 [${item.workflowName ?? item.workflowId}]: ${item.error}`)
          }
        }
      } else {
        // 服务器返回错误，回滚乐观更新
        isRunning.value = false
        stopTimer()
        appendLog('error', `批量启动失败: ${(res as any).message ?? '未知错误'}`)
      }
    } catch (err) {
      // 网络错误，回滚乐观更新
      isRunning.value = false
      stopTimer()
      appendLog('error', `批量启动请求失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** 停止所有运行中的工作流（并行发起请求） */
  async function stopAll() {
    const toStop = [...runningWorkflows.value]
    if (toStop.length === 0) {
      isRunning.value = false
      stopTimer()
      return
    }

    appendLog('info', `停止 ${toStop.length} 个工作流...`)

    // 立即清空状态，避免重复点击触发
    runningWorkflows.value = []
    isRunning.value = false
    stopTimer()

    // 并行发起所有停止请求
    const results = await Promise.allSettled(
      toStop.map((rw) => workflowApi.stop({ runId: rw.runId })),
    )

    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length > 0) {
      appendLog('warn', `${failed.length} 个停止请求未成功`)
    }

    appendLog('info', '已全部停止')
  }

  function clearLogs() {
    logs.value = []
  }

  /** 暂停设备截图 */
  async function pauseDevice(deviceId: string) {
    try {
      await workflowApi.pause({ deviceId })
      appendLog('info', `设备 ${deviceId} 已暂停`)
    } catch (err) {
      appendLog('error', `暂停失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** 恢复设备截图 */
  async function resumeDevice(deviceId: string) {
    try {
      await workflowApi.resume({ deviceId })
      appendLog('info', `设备 ${deviceId} 已恢复`)
    } catch (err) {
      appendLog('error', `恢复失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // WS 监听器是模块级单例，不应在组件卸载时移除
  // 它们在模块加载时注册，整个应用生命周期有效

  return {
    checkedMap: readonly(checkedMap),
    runningWorkflows: readonly(runningWorkflows),
    isRunning: readonly(isRunning),
    elapsed: readonly(elapsed),
    logs: readonly(logs),
    screenshotMap,
    annotationMap,
    deviceRunStatusMap: readonly(deviceRunStatusMap),
    workflowFlowStateMap: readonly(workflowFlowStateMap),
    formatElapsed,
    getCheckedCount,
    toggleCheck,
    isChecked,
    getCheckedIds,
    startAll,
    stopAll,
    pauseDevice,
    resumeDevice,
    clearLogs,
    restoreState,
  }
}
