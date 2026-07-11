// ─────────────────────────────────────────────
// WorkflowService — 工作流运行服务
// 职责：管理工作流启动/停止/状态查询
// ─────────────────────────────────────────────

import type { Workflow, WorkflowRunInfo } from '@automan/shared/types.js'
import { WorkflowRunState } from '@automan/shared/types.js'
import { WorkflowActor, type WorkflowActorConfig } from './workflow.actor.js'
import { ScreenshotDispatcher, type DeviceScreenshotInfo } from './screenshot.dispatcher.js'
import { db, workflows, devices } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import { logger } from '../../core/logger.js'

export class WorkflowService {
  private actors = new Map<string, WorkflowActor>()
  private dispatcher = new ScreenshotDispatcher()

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

    // 创建 Actor
    const runId = crypto.randomUUID()
    const actorConfig: WorkflowActorConfig = {
      runId,
      workflow,
      deviceId,
      ldconsolePath: devRow.ldconsolePath,
      instanceIndex: devRow.instanceIndex,
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

    return {
      runId,
      workflowId,
      deviceId,
      state: WorkflowRunState.IDLE,
      createdAt: Date.now(),
      executionCount: 0,
    }
  }

  /** 停止工作流 */
  async stopWorkflow(runId: string): Promise<void> {
    const actor = this.actors.get(runId)
    if (!actor) throw new Error(`运行实例 ${runId} 不存在`)

    const info = actor.getInfo()
    await actor.stop()
    this.actors.delete(runId)

    // 检查该设备是否还有其他工作流运行
    const hasOther = [...this.actors.values()].some(
      (a) => a.getInfo().deviceId === info.deviceId,
    )
    if (!hasOther) {
      this.dispatcher.stop(info.deviceId)
    }

    logger.info('WorkflowService', `stopped: runId ${runId}`)
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
    const ids = [...this.actors.keys()]
    for (const id of ids) {
      try {
        await this.stopWorkflow(id)
      } catch {
        // ignore
      }
    }
    this.dispatcher.stopAll()
  }
}
