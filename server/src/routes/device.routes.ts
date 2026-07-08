// ─────────────────────────────────────────────
// 设备路由模块
// 职责：设备绑定/解绑、模拟器控制、应用控制、截屏
// ─────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import type { DeviceManager } from '../modules/device/device.service.js'

export async function deviceRoutes(app: FastifyInstance, dm: DeviceManager): Promise<void> {
  // ── 设备查询 / 绑定 / 解绑 ─────────────────

  // 查询模拟器可用实例列表（传入 ldconsole 路径）
  app.get<{ Querystring: { path?: string } }>('/api/devices', async (request) => {
    const ldconsolePath = request.query.path
    if (!ldconsolePath) {
      return { devices: dm.listDevices(), instances: [] }
    }
    const instances = await dm.listInstances(ldconsolePath)
    return { devices: dm.listDevices(), instances }
  })

  // 绑定设备
  app.post<{ Body: { name: string; ldconsolePath: string; instanceIndex: number } }>(
    '/api/devices/bind',
    async (request) => {
      const device = await dm.bindDevice(request.body)
      return { device }
    },
  )

  // 解绑设备
  app.delete<{ Params: { id: string } }>('/api/devices/:id', async (request) => {
    dm.unbindDevice(request.params.id)
    return { success: true }
  })

  // ── 模拟器控制 ─────────────────────────────

  // 启动模拟器
  app.post<{ Params: { id: string } }>('/api/devices/:id/launch', async (request) => {
    await dm.launchDevice(request.params.id)
    return { deviceId: request.params.id, action: 'launch' }
  })

  // 关闭模拟器
  app.post<{ Params: { id: string } }>('/api/devices/:id/quit', async (request) => {
    await dm.quitDevice(request.params.id)
    return { deviceId: request.params.id, action: 'quit' }
  })

  // 重启模拟器
  app.post<{ Params: { id: string } }>('/api/devices/:id/reboot', async (request) => {
    await dm.rebootDevice(request.params.id)
    return { deviceId: request.params.id, action: 'reboot' }
  })

  // 刷新设备状态
  app.post<{ Params: { id: string } }>('/api/devices/:id/refresh', async (request) => {
    const state = await dm.refreshDeviceState(request.params.id)
    return { deviceId: request.params.id, state }
  })

  // 查询模拟器实例列表（需传入 ldconsolePath）
  app.post<{ Body: { ldconsolePath: string } }>('/api/devices/instances', async (request) => {
    const instances = await dm.listInstances(request.body.ldconsolePath)
    return { instances }
  })

  // ── 应用控制 ───────────────────────────────

  // 启动应用
  app.post<{ Params: { id: string }; Body: { packageName: string } }>(
    '/api/devices/:id/app/start',
    async (request) => {
      await dm.startApp(request.params.id, request.body.packageName)
      return { deviceId: request.params.id, action: 'app:start', packageName: request.body.packageName }
    },
  )

  // 关闭应用
  app.post<{ Params: { id: string }; Body: { packageName: string } }>(
    '/api/devices/:id/app/stop',
    async (request) => {
      await dm.stopApp(request.params.id, request.body.packageName)
      return { deviceId: request.params.id, action: 'app:stop', packageName: request.body.packageName }
    },
  )

  // 重启应用
  app.post<{ Params: { id: string }; Body: { packageName: string } }>(
    '/api/devices/:id/app/restart',
    async (request) => {
      await dm.restartApp(request.params.id, request.body.packageName)
      return { deviceId: request.params.id, action: 'app:restart', packageName: request.body.packageName }
    },
  )

  // ── 截屏 ───────────────────────────────────

  // 截取设备当前画面，返回 base64 data URI
  app.post<{ Params: { id: string } }>('/api/devices/:id/screenshot', async (request) => {
    const pngBuf = await dm.screenshot(request.params.id)
    return { screenshot: `data:image/png;base64,${pngBuf.toString('base64')}` }
  })
}
