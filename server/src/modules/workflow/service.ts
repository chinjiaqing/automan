// ─────────────────────────────────────────────
// WorkflowService — 工作流运行服务
// 职责：管理工作流启动/停止/状态查询，通过 DeviceSession 管理设备级会话
// ─────────────────────────────────────────────

import type { Workflow, WorkflowRunInfo, BatchRunWorkflowResponse, BatchRunItem, DeviceRunStatusInfo } from '@automan/shared/types.js'
import { WorkflowRunState, DeviceRunStatus } from '@automan/shared/types.js'
import { WorkflowActor, type WorkflowActorConfig } from './workflow.actor.js'
import { ScreenshotDispatcher, type DeviceScreenshotInfo } from './screenshot.dispatcher.js'
import { DeviceSession } from './device.session.js'
import { db, workflows, devices } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import { logger } from '../../core/logger.js'
import { eventBus, EventBusEvent } from '../../core/event-bus.js'

export class WorkflowService {
  private actors = new Map<string, WorkflowActor>()
  private dispatcher = new ScreenshotDispatcher()
  /** 设备级会话缓存：每个设备一个 DeviceSession，多工作流共享 */
  private deviceSessions = new Map<string, DeviceSession>()

  /**
   * 启动工作流
   * @returns 运行实例信息
   */
  async startWorkflow(workflowId: string, deviceId: string, screenshotInterval?: number): Promise<WorkflowRunInfo> {
    // 加载工作流
    const wfRow = db.select().from(workflows).where(eq(workflows.id, workflowId)).get()
    if (!wfRow) throw new Error(`工作流 ${workflowId} 不存在`)

    const workflow: Workflow = {
      id: wfRow.id,
      name: wfRow.name,
      deviceId: wfRow.deviceId ?? undefined,
      nodes: JSON.parse(wfRow.nodesJson),
      edges: JSON.parse(wfRow.edgesJson),
      createdAt: wfRow.createdAt,
      updatedAt: wfRow.updatedAt,
    }

    // 加载设备
    const devRow = db.select().from(devices).where(eq(devices.id, deviceId)).get()
    if (!devRow) throw new Error(`设备 ${deviceId} 不存在`)

    // 检查是否已运行
    for (const actor of this.actors.values()) {
      const info = actor.getInfo()
      if (info.workflowId === workflowId && info.deviceId === deviceId) {
        throw new Error(`工作流 ${workflow.name} 已在设备 ${devRow.name} 上运行`)
      }
    }

    // 设备就绪检测（设备级会话，多工作流共享同一次检测）
    const session = this.getOrCreateDeviceSession({
      deviceId: devRow.id,
      deviceName: devRow.name,
      ldconsolePath: devRow.ldconsolePath,
      instanceIndex: devRow.instanceIndex,
    })
    // 注意：不在此处 await ensureReady()
    // 设备就绪检测由 WorkflowActor 在后台等待，避免阻塞 HTTP 请求
    // 但立即触发检测流程（幂等），让它在后台开始执行
    session.ensureReady().catch(() => { /* actor 侧会处理错误 */ })

    // 创建 Actor
    const runId = crypto.randomUUID()
    const actorConfig: WorkflowActorConfig = {
      runId,
      workflow,
      deviceId,
      ldconsolePath: devRow.ldconsolePath,
      instanceIndex: devRow.instanceIndex,
      session,
    }

    const actor = new WorkflowActor(actorConfig)
    await actor.start()
    this.actors.set(runId, actor)

    // 启动截图调度器（每设备共享）
    const deviceInfo: DeviceScreenshotInfo = {
      id: devRow.id,
      ldconsolePath: devRow.ldconsolePath,
      instanceIndex: devRow.instanceIndex,
    }
    this.dispatcher.start(deviceInfo, screenshotInterval ?? 2000)

    logger.info('WorkflowService', `started: ${workflow.name} on device ${devRow.name} (runId: ${runId})`)
    this.emitDeviceRunStatus(deviceId)

    return {
      runId,
      workflowId,
      deviceId,
      state: WorkflowRunState.IDLE,
      createdAt: Date.now(),
      executionCount: 0,
    }
  }

  /**
   * 批量启动工作流（设备级）
   * 创建设备会话 + fire-and-forget ensureReady，Actor 在 onScreenshot 中等待设备就绪
   * HTTP 请求立即返回，不阻塞
   */
  async batchStartWorkflows(
    deviceId: string,
    workflowIds: string[],
    screenshotInterval?: number,
  ): Promise<BatchRunWorkflowResponse> {
    logger.info('WorkflowService', `batchStart: deviceId=${deviceId}, workflows=${workflowIds.length}`)

    // 加载设备
    const devRow = db.select().from(devices).where(eq(devices.id, deviceId)).get()
    if (!devRow) throw new Error(`设备 ${deviceId} 不存在`)

    // 创建设备会话（幂等）
    const session = this.getOrCreateDeviceSession({
      deviceId: devRow.id,
      deviceName: devRow.name,
      ldconsolePath: devRow.ldconsolePath,
      instanceIndex: devRow.instanceIndex,
    })

    // 注意：不在此处 await ensureReady()！
    // 设备就绪检测由 WorkflowActor 在 onScreenshot 中后台等待
    // 避免阻塞 HTTP 请求（模拟器冷启动可能需 70s+）
    session.ensureReady().catch(() => { /* actor 侧会处理错误 */ })

    const deviceInfo: DeviceScreenshotInfo = {
      id: devRow.id,
      ldconsolePath: devRow.ldconsolePath,
      instanceIndex: devRow.instanceIndex,
    }
    // 启动截图调度器（幂等，subscribers++）
    this.dispatcher.start(deviceInfo, screenshotInterval ?? 2000)

    const items: BatchRunItem[] = []

    // 为每个工作流创建 Actor
    for (const workflowId of workflowIds) {
      try {
        // 加载工作流
        const wfRow = db.select().from(workflows).where(eq(workflows.id, workflowId)).get()
        if (!wfRow) throw new Error(`工作流 ${workflowId} 不存在`)

        const workflow: Workflow = {
          id: wfRow.id,
          name: wfRow.name,
          deviceId: wfRow.deviceId ?? undefined,
          nodes: JSON.parse(wfRow.nodesJson),
          edges: JSON.parse(wfRow.edgesJson),
          createdAt: wfRow.createdAt,
          updatedAt: wfRow.updatedAt,
        }

        // 检查是否已运行
        let alreadyRunning = false
        for (const actor of this.actors.values()) {
          const info = actor.getInfo()
          if (info.workflowId === workflowId && info.deviceId === deviceId) {
            alreadyRunning = true
            break
          }
        }
        if (alreadyRunning) {
          items.push({ workflowId, workflowName: workflow.name, runId: null, success: false, error: '已在运行中' })
          continue
        }

        const runId = crypto.randomUUID()
        const actorConfig: WorkflowActorConfig = {
          runId,
          workflow,
          deviceId,
          ldconsolePath: devRow.ldconsolePath,
          instanceIndex: devRow.instanceIndex,
          session,
        }

        const actor = new WorkflowActor(actorConfig)
        await actor.start()
        this.actors.set(runId, actor)

        logger.info('WorkflowService', `started: ${workflow.name} on device ${devRow.name} (runId: ${runId})`)
        items.push({ workflowId, workflowName: workflow.name, runId, success: true })
      } catch (err) {
        items.push({ workflowId, runId: null, success: false, error: err instanceof Error ? err.message : String(err) })
      }
    }

    this.emitDeviceRunStatus(deviceId)

    const successCount = items.filter((i) => i.success).length
    const failCount = items.length - successCount
    logger.info('WorkflowService', `batchStart done: ${successCount} succeeded, ${failCount} failed`)

    return { deviceId, items }
  }

  /**
   * 获取或创建设备会话（幂等）
   * 同一设备复用同一 DeviceSession，多工作流共享就绪检测
   */
  private getOrCreateDeviceSession(cfg: {
    deviceId: string
    deviceName: string
    ldconsolePath: string
    instanceIndex: number
  }): DeviceSession {
    if (!this.deviceSessions.has(cfg.deviceId)) {
      const session = new DeviceSession(cfg)
      this.deviceSessions.set(cfg.deviceId, session)
      logger.info('WorkflowService', `created DeviceSession for ${cfg.deviceName}`)
    }
    return this.deviceSessions.get(cfg.deviceId)!
  }

  /** 停止工作流 */
  async stopWorkflow(runId: string): Promise<void> {
    const actor = this.actors.get(runId)
    if (!actor) {
      // 已被停止，不抛错，避免前端并行停止时报错
      logger.warn('WorkflowService', `stopWorkflow: runId ${runId} not found (already stopped?)`)
      return
    }

    const info = actor.getInfo()
    await actor.stop()
    this.actors.delete(runId)

    // 检查该设备是否还有其他工作流运行
    const hasOther = [...this.actors.values()].some(
      (a) => a.getInfo().deviceId === info.deviceId,
    )
    if (!hasOther) {
      this.dispatcher.stop(info.deviceId)
      // 设备无工作流时销毁会话
      const session = this.deviceSessions.get(info.deviceId)
      if (session) {
        session.destroy()
        this.deviceSessions.delete(info.deviceId)
      }
    }

    logger.info('WorkflowService', `stopped: runId ${runId} (device: ${info.deviceId})`)
    this.emitDeviceRunStatus(info.deviceId)
  }

  /** 获取运行实例信息 */
  getRunInfo(runId: string): WorkflowRunInfo | undefined {
    const actor = this.actors.get(runId)
    if (!actor) return undefined

    const info = actor.getInfo()
    return {
      runId: info.runId,
      workflowId: info.workflowId,
      deviceId: info.deviceId,
      state: info.busy ? WorkflowRunState.RUNNING : WorkflowRunState.IDLE,
      createdAt: Date.now(),
      executionCount: info.executionCount,
    }
  }

  /** 列出所有运行中的工作流 */
  listRuns(): WorkflowRunInfo[] {
    return [...this.actors.values()].map((actor) => {
      const info = actor.getInfo()
      return {
        runId: info.runId,
        workflowId: info.workflowId,
        deviceId: info.deviceId,
        state: info.busy ? WorkflowRunState.RUNNING : WorkflowRunState.IDLE,
        createdAt: Date.now(),
        executionCount: info.executionCount,
      }
    })
  }

  /** 停止指定设备上所有工作流 */
  async stopByDevice(deviceId: string): Promise<void> {
    const toStop = [...this.actors.entries()].filter(
      ([, a]) => a.getInfo().deviceId === deviceId,
    )
    for (const [runId] of toStop) {
      await this.stopWorkflow(runId)
    }
  }

  /** 停止所有工作流 */
  async stopAll(): Promise<void> {
    const totalActors = this.actors.size
    logger.info('WorkflowService', `stopAll: stopping ${totalActors} workflows...`)
    const deviceIds = new Set<string>()
    const ids = [...this.actors.keys()]
    for (const id of ids) {
      const actor = this.actors.get(id)
      if (actor) deviceIds.add(actor.getInfo().deviceId)
      try {
        await this.stopWorkflow(id)
      } catch {
        // ignore
      }
    }
    this.dispatcher.stopAll()
    // 销毁所有设备会话
    for (const session of this.deviceSessions.values()) {
      session.destroy()
    }
    this.deviceSessions.clear()
    // 发出所有受影响设备的状态变更
    for (const deviceId of deviceIds) {
      this.emitDeviceRunStatus(deviceId)
    }
  }

  /** 获取所有设备的运行状态 */
  getDeviceRunStatuses(): DeviceRunStatusInfo[] {
    const deviceMap = new Map<string, { runIds: string[]; hasError: boolean }>()

    for (const actor of this.actors.values()) {
      const info = actor.getInfo()
      if (!deviceMap.has(info.deviceId)) {
        deviceMap.set(info.deviceId, { runIds: [], hasError: false })
      }
      const entry = deviceMap.get(info.deviceId)!
      entry.runIds.push(info.runId)
      // actor state 检测（通过 getInfo）
      if (info.state === 'error') entry.hasError = true
    }

    return [...deviceMap.entries()].map(([deviceId, entry]) => ({
      deviceId,
      status: entry.hasError ? DeviceRunStatus.ERROR : DeviceRunStatus.RUNNING,
      activeWorkflowCount: entry.runIds.length,
      runIds: entry.runIds,
      updatedAt: Date.now(),
    }))
  }

  /** 获取单个设备的运行状态 */
  getDeviceRunStatus(deviceId: string): DeviceRunStatusInfo | null {
    const deviceActors = [...this.actors.values()].filter(
      (a) => a.getInfo().deviceId === deviceId,
    )
    if (deviceActors.length === 0) {
      return {
        deviceId,
        status: DeviceRunStatus.IDLE,
        activeWorkflowCount: 0,
        runIds: [],
        updatedAt: Date.now(),
      }
    }
    const runIds = deviceActors.map((a) => a.getInfo().runId)
    const hasError = deviceActors.some((a) => a.getInfo().state === 'error')
    return {
      deviceId,
      status: hasError ? DeviceRunStatus.ERROR : DeviceRunStatus.RUNNING,
      activeWorkflowCount: runIds.length,
      runIds,
      updatedAt: Date.now(),
    }
  }

  /** 发出设备运行状态变更事件 */
  private emitDeviceRunStatus(deviceId: string) {
    const status = this.getDeviceRunStatus(deviceId)
    if (status) {
      eventBus.emit(EventBusEvent.DEVICE_RUN_STATUS, status)
    }
  }
}
