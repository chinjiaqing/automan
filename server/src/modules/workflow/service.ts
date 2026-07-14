// ─────────────────────────────────────────────
// WorkflowService — 工作流运行服务
// 职责：管理工作流启动/停止/状态查询，通过 DeviceSession 管理设备级会话
// ─────────────────────────────────────────────

import type { Workflow, WorkflowRunInfo, BatchRunWorkflowResponse, BatchRunItem, DeviceRunStatusInfo, WorkflowRunConfig } from '@automan/shared/types.js'
import { WorkflowRunState, DeviceRunStatus } from '@automan/shared/types.js'
import { WorkflowActor, type WorkflowActorConfig } from './workflow.actor.js'
import { ScreenshotDispatcher, type DeviceScreenshotInfo } from './screenshot.dispatcher.js'
import { DeviceSession } from './device.session.js'
import { CronManager } from './cron.manager.js'
import { db, workflows, devices, workflowRunConfigs } from '../../db/index.js'
import { eq, and } from 'drizzle-orm'
import { logger } from '../../core/logger.js'
import { eventBus, EventBusEvent } from '../../core/event-bus.js'
import { ADB_PATH } from '../../config.js'

export class WorkflowService {
  private actors = new Map<string, WorkflowActor>()
  private dispatcher = new ScreenshotDispatcher()
  /** 设备级会话缓存：每个设备一个 DeviceSession，多工作流共享 */
  private deviceSessions = new Map<string, DeviceSession>()
  /** 动态 cron 任务管理器 */
  private cronManager = new CronManager()
  /** 手动暂停的设备集合 */
  private pausedDevices = new Set<string>()

  constructor() {
    // cron 的生命周期由设备级 start/stop 控制，completed 不触发任何销毁
    // 定时工作流达标后，cron 回调会自动重置计数并重新进入 pending

    // 截图智能启停：所有状态变更统一通过 WORKFLOW_STATE 事件驱动
    eventBus.on(EventBusEvent.WORKFLOW_STATE, (payload: any) => {
      if (payload?.deviceId) {
        this.syncDispatcher(payload.deviceId)
      }
    })
  }

  /** 截图启停唯一决策点：根据设备下所有 actor 状态决定是否需要截图 */
  private syncDispatcher(deviceId: string): void {
    // 手动暂停期间不自动恢复
    if (this.pausedDevices.has(deviceId)) return

    const deviceActors = [...this.actors.values()].filter(
      (a) => a.getInfo().deviceId === deviceId,
    )
    if (deviceActors.length === 0) return

    // cancelled 的 actor（设备级错误/达标自动停止）不再需要截图
    const needScreenshot = deviceActors.some((a) => {
      const info = a.getInfo()
      return info.flowState !== 'completed' && !info.cancelled
    })

    if (needScreenshot) {
      this.dispatcher.resume(deviceId)
    } else {
      this.dispatcher.pause(deviceId)
    }

    // 所有 actor 都不再需要截图时，自动清理已完成/已取消的 actor
    if (!needScreenshot) {
      for (const actor of deviceActors) {
        const info = actor.getInfo()
        if (info.cancelled || info.flowState === 'completed') {
          this.cronManager.unregister(info.deviceId, info.workflowId)
          actor.stop() // fire-and-forget：已取消的 actor 无需等待
          this.actors.delete(info.runId)
          logger.info('WorkflowService', `auto-cleaned actor ${info.runId} (cancelled=${info.cancelled}, flowState=${info.flowState})`)
        }
      }
      // 与 stopWorkflow 保持一致：stop 调度器 + 销毁设备会话
      this.dispatcher.stop(deviceId)
      const session = this.deviceSessions.get(deviceId)
      if (session) {
        session.destroy()
        this.deviceSessions.delete(deviceId)
      }
      this.emitDeviceRunStatus(deviceId)
    }
  }

  /** 从 DB 加载运行配置，不存在则返回默认配置 */
  private loadRunConfig(deviceId: string, workflowId: string): WorkflowRunConfig {
    const row = db.select().from(workflowRunConfigs)
      .where(and(eq(workflowRunConfigs.deviceId, deviceId), eq(workflowRunConfigs.workflowId, workflowId)))
      .get()
    if (row) {
      try {
        return JSON.parse(row.configJson) as WorkflowRunConfig
      } catch {
        // JSON 解析失败，用默认
      }
    }
    return {
      workflowId,
      deviceId,
      triggerMode: 'immediate',
      scheduleTimes: [],
      maxSuccessCount: 0,
      maxFailCount: 0,
    }
  }

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
    const adbPath = ADB_PATH
    const session = this.getOrCreateDeviceSession({
      deviceId: devRow.id,
      deviceName: devRow.name,
      adbPath,
      adbTarget: devRow.adbAddress,
    })
    // ★ 设备预检测：连接 ADB + 探测分辨率，失败则拒绝启动
    await session.ensureReady()

    // 加载运行配置
    const runConfig = this.loadRunConfig(deviceId, workflowId)

    // 创建 Actor
    const runId = crypto.randomUUID()
    const actorConfig: WorkflowActorConfig = {
      runId,
      workflow,
      deviceId,
      session,
      runConfig,
    }

    const actor = new WorkflowActor(actorConfig)
    await actor.start()
    this.actors.set(runId, actor)

    // 定时模式：注册 cron
    if (runConfig.triggerMode === 'scheduled' && runConfig.scheduleTimes.length > 0) {
      this.cronManager.register(deviceId, workflowId, runConfig.scheduleTimes, () => actor.markPending())
    }

    // 启动截图调度器（每设备共享）
    const deviceInfo: DeviceScreenshotInfo = {
      id: devRow.id,
      adbPath,
      adbTarget: devRow.adbAddress,
    }
    // 优先用设备配置的截图间隔（秒转毫秒），否则用请求参数，最后默认 2000ms
    const intervalMs = devRow.screenshotInterval * 1000 || screenshotInterval || 2000
    this.dispatcher.start(deviceInfo, intervalMs)

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
   * 创建设备会话 + await ensureReady 预检测，设备连接失败则拒绝启动
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
    const adbPath = ADB_PATH
    const session = this.getOrCreateDeviceSession({
      deviceId: devRow.id,
      deviceName: devRow.name,
      adbPath,
      adbTarget: devRow.adbAddress,
    })

    // ★ 设备预检测：连接 ADB + 探测分辨率，失败则拒绝启动
    await session.ensureReady()

    const deviceInfo: DeviceScreenshotInfo = {
      id: devRow.id,
      adbPath,
      adbTarget: devRow.adbAddress,
    }
    // 启动截图调度器（幂等，subscribers++）
    const intervalMs = devRow.screenshotInterval * 1000 || screenshotInterval || 2000
    this.dispatcher.start(deviceInfo, intervalMs)

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
        const runConfig = this.loadRunConfig(deviceId, workflowId)
        const actorConfig: WorkflowActorConfig = {
          runId,
          workflow,
          deviceId,
          session,
          runConfig,
        }

        const actor = new WorkflowActor(actorConfig)
        await actor.start()
        this.actors.set(runId, actor)

        // 定时模式：注册 cron
        if (runConfig.triggerMode === 'scheduled' && runConfig.scheduleTimes.length > 0) {
          this.cronManager.register(deviceId, workflowId, runConfig.scheduleTimes, () => actor.markPending())
        }

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
    adbPath: string
    adbTarget: string
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

    // 注销 cron
    this.cronManager.unregister(info.deviceId, info.workflowId)

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
    // 注销所有 cron
    this.cronManager.unregisterAll()
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
      status: this.resolveDeviceStatus(deviceId, entry.hasError),
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
      status: this.resolveDeviceStatus(deviceId, hasError),
      activeWorkflowCount: runIds.length,
      runIds,
      updatedAt: Date.now(),
    }
  }

  /** 解析设备状态：手动暂停 > 错误 > 运行中 */
  private resolveDeviceStatus(deviceId: string, hasError: boolean): DeviceRunStatus {
    if (this.pausedDevices.has(deviceId)) return DeviceRunStatus.PAUSED
    if (hasError) return DeviceRunStatus.ERROR
    return DeviceRunStatus.RUNNING
  }

  /** 手动暂停设备截图 */
  pauseDevice(deviceId: string): void {
    this.pausedDevices.add(deviceId)
    this.dispatcher.pause(deviceId)
    logger.info('WorkflowService', `device ${deviceId} paused by user`)
    this.emitDeviceRunStatus(deviceId)
  }

  /** 手动恢复设备截图 */
  resumeDevice(deviceId: string): void {
    this.pausedDevices.delete(deviceId)
    this.syncDispatcher(deviceId)
    logger.info('WorkflowService', `device ${deviceId} resumed by user`)
    this.emitDeviceRunStatus(deviceId)
  }

  /** 发出设备运行状态变更事件 */
  private emitDeviceRunStatus(deviceId: string) {
    const status = this.getDeviceRunStatus(deviceId)
    if (status) {
      eventBus.emit(EventBusEvent.DEVICE_RUN_STATUS, status)
    }
  }
}
