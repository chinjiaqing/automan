// ─────────────────────────────────────────────
// useWorkflowRun — 工作流运行控制 composable
// 职责：管理工作流勾选状态、启动/停止、日志收集、运行计时
// ─────────────────────────────────────────────

import { ref, readonly, computed, onUnmounted } from 'vue'
import { WsMessageType } from '@automan/shared/types.js'
import type { WorkflowStatusPayload, ActorLogPayload, WorkflowVisualPayload, DeviceScreenshotPayload } from '@automan/shared/types.js'
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
const checkedWorkflows = ref<Set<string>>(new Set())
const runningWorkflows = ref<RunningWorkflow[]>([])
const logs = ref<LogEntry[]>([])
const isRunning = ref(false)
const startedAt = ref(0)
const elapsed = ref(0)

/** 每设备最新截图 */
const screenshotMap = ref<Map<string, { image: string; width: number; height: number; originalWidth: number; originalHeight: number; timestamp: number }>>(new Map())

/** 每设备最新可视化注解数据 */
const annotationMap = ref<Map<string, { annotations: WorkflowVisualPayload['annotations']; executionCount: number; timestamp: number }>>(new Map())

let timer: ReturnType<typeof setInterval> | null = null
const { on, off } = useWebSocket()

// ── WS 日志监听 ─────────────────────────────────
function onActorLog(payload: unknown) {
  const p = payload as ActorLogPayload
  appendLog(p.level as LogEntry['level'], `[${p.actorId.slice(0, 8)}] ${p.message}`)
}

function onWorkflowStatus(payload: unknown) {
  const p = payload as WorkflowStatusPayload
  const stateLabel = p.state === 'running' ? '执行中' : p.state === 'error' ? '出错' : '空闲'
  appendLog(p.state === 'error' ? 'error' : 'info', `[${p.workflowId.slice(0, 8)}] #${p.executionCount} ${stateLabel}`)
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
  // 截图也更新（工作流执行后的截图更准确）
  const sm = new Map(screenshotMap.value)
  sm.set(p.deviceId, { image: p.screenshot, width: p.screenshotWidth, height: p.screenshotHeight, originalWidth: p.originalWidth, originalHeight: p.originalHeight, timestamp: p.timestamp })
  screenshotMap.value = sm
  // 更新注解
  const am = new Map(annotationMap.value)
  am.set(p.deviceId, { annotations: p.annotations, executionCount: p.executionCount, timestamp: p.timestamp })
  annotationMap.value = am
  appendLog('info', `[visual] ${p.annotations.length} annotations from #${p.executionCount}`)
}

function appendLog(level: LogEntry['level'], message: string) {
  const now = new Date()
  const time = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  logs.value.push({ time, level, message })
  // 保留最近 500 条
  if (logs.value.length > 500) {
    logs.value = logs.value.slice(-500)
  }
}

// 注册 WS 监听
on(WsMessageType.ACTOR_LOG, onActorLog)
on(WsMessageType.WORKFLOW_STATUS, onWorkflowStatus)
on(WsMessageType.WORKFLOW_VISUAL, onWorkflowVisual)
on(WsMessageType.DEVICE_SCREENSHOT, onDeviceScreenshot)

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

// ── 暴露的接口 ─────────────────────────────────
export function useWorkflowRun() {
  const checkedCount = computed(() => checkedWorkflows.value.size)

  function toggleCheck(workflowId: string) {
    const s = new Set(checkedWorkflows.value)
    if (s.has(workflowId)) {
      s.delete(workflowId)
    } else {
      s.add(workflowId)
    }
    checkedWorkflows.value = s
  }

  function isChecked(workflowId: string): boolean {
    return checkedWorkflows.value.has(workflowId)
  }

  /** 启动所有已勾选的工作流 */
  async function startAll(deviceId: string) {
    const ids = [...checkedWorkflows.value]
    if (ids.length === 0) return

    appendLog('info', `启动 ${ids.length} 个工作流...`)

    for (const wfId of ids) {
      try {
        const res = await workflowApi.run({ workflowId: wfId, deviceId })
        if (res.success) {
          runningWorkflows.value.push({ runId: res.data.runId, workflowId: wfId })
        }
      } catch (err) {
        appendLog('error', `启动失败: ${String(err)}`)
      }
    }

    isRunning.value = true
    startTimer()
  }

  /** 停止所有运行中的工作流 */
  async function stopAll() {
    appendLog('info', `停止 ${runningWorkflows.value.length} 个工作流...`)

    for (const rw of runningWorkflows.value) {
      try {
        await workflowApi.stop({ runId: rw.runId })
      } catch {
        // ignore
      }
    }

    runningWorkflows.value = []
    isRunning.value = false
    stopTimer()
    appendLog('info', '已全部停止')
  }

  function clearLogs() {
    logs.value = []
  }

  onUnmounted(() => {
    off(WsMessageType.ACTOR_LOG, onActorLog)
    off(WsMessageType.WORKFLOW_STATUS, onWorkflowStatus)
    off(WsMessageType.WORKFLOW_VISUAL, onWorkflowVisual)
    off(WsMessageType.DEVICE_SCREENSHOT, onDeviceScreenshot)
    stopTimer()
  })

  return {
    checkedWorkflows: readonly(checkedWorkflows),
    checkedCount,
    runningWorkflows: readonly(runningWorkflows),
    isRunning: readonly(isRunning),
    elapsed: readonly(elapsed),
    logs: readonly(logs),
    screenshotMap,
    annotationMap,
    formatElapsed,
    toggleCheck,
    isChecked,
    startAll,
    stopAll,
    clearLogs,
  }
}
