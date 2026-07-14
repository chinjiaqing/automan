// ─────────────────────────────────────────────
// 设备路由模块
// 职责：设备 CRUD + 截屏/点击/滑动 + 设备发现/连接测试
// 统一使用 POST/GET + ApiResponse 格式
// ─────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { db, devices } from '../db/index.js'
import { config, ADB_PATH } from '../config.js'
import { eq } from 'drizzle-orm'
import type {
  CreateDeviceRequest,
  DeleteDeviceRequest,
  DeviceInfo,
  ScreenshotRequest,
  FindPicRequest,
  FindPicProRequest,
  GetWordsRequest,
  FindStrRequest,
  AdbClickRequest,
  AdbAreaClickRequest,
  AdbSwipeRequest,
  DiscoveredDevice,
  TestConnectionRequest,
  TestConnectionResponse,
} from '@automan/shared/types.js'
import { DeviceStatus } from '@automan/shared/types.js'
import { AdbService } from '../modules/device/adb.service.js'
import { computeScaleFactor, toActualPoint, toActualRegion } from '../modules/device/coordinate.js'
import { findPic, findPicPro, getWords, findStr, adbClick, adbAreaClick, adbSwipe } from '../libs/index.js'

/** 将 DB Row 转为 DeviceInfo */
function toDeviceInfo(row: typeof devices.$inferSelect): DeviceInfo {
  return {
    id: row.id,
    name: row.name,
    adbAddress: row.adbAddress,
    screenshotInterval: row.screenshotInterval,
    status: row.status as DeviceStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const adbService = new AdbService()

export async function deviceRoutes(app: FastifyInstance): Promise<void> {
  // ── 查询设备列表 ───────────────────────────
  app.get('/api/devices', async () => {
    const rows = db.select().from(devices).all()
    return { success: true as const, data: rows.map(toDeviceInfo) }
  })

  // ── 创建设备 ───────────────────────────────
  app.post<{ Body: CreateDeviceRequest }>('/api/devices/create', async (request, reply) => {
    const { name, adbAddress, screenshotInterval } = request.body

    // 基础校验
    if (!name || !adbAddress) {
      return reply.status(400).send({
        success: false,
        code: 'INVALID_PARAMS',
        message: 'name、adbAddress 均为必填',
      })
    }

    // 截图间隔校验：整数 2-30，默认 2
    const interval = Math.max(2, Math.min(30, Math.round(screenshotInterval ?? 2)))

    // 唯一性校验：不允许重复 adbAddress
    const existing = db
      .select()
      .from(devices)
      .where(eq(devices.adbAddress, adbAddress))
      .get()
    if (existing) {
      return reply.status(409).send({
        success: false,
        code: 'DUPLICATE',
        message: `设备 ${adbAddress} 已绑定`,
      })
    }

    const now = Date.now()
    const id = crypto.randomUUID()

    db.insert(devices)
      .values({
        id,
        name,
        adbAddress,
        screenshotInterval: interval,
        status: DeviceStatus.STOPPED,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    const row = db.select().from(devices).where(eq(devices.id, id)).get()!
    app.log.info(`Device created: ${name} [${adbAddress}]`)
    return { success: true as const, data: toDeviceInfo(row) }
  })

  // ── 删除设备 ───────────────────────────────
  app.post<{ Body: DeleteDeviceRequest }>('/api/devices/delete', async (request, reply) => {
    const { id } = request.body
    if (!id) {
      return reply.status(400).send({
        success: false,
        code: 'INVALID_PARAMS',
        message: 'id 为必填',
      })
    }

    const existing = db.select().from(devices).where(eq(devices.id, id)).get()
    if (!existing) {
      return reply.status(404).send({
        success: false,
        code: 'NOT_FOUND',
        message: `设备 ${id} 不存在`,
      })
    }

    db.delete(devices).where(eq(devices.id, id)).run()
    app.log.info(`Device deleted: ${existing.name}`)
    return { success: true as const, data: { id } }
  })

  // ── 更新设备（重命名）────────────────────────
  app.post<{ Body: { id: string; name: string; screenshotInterval?: number } }>(
    '/api/devices/update',
    async (request, reply) => {
      const { id, name, screenshotInterval } = request.body
      if (!id || !name) {
        return reply.status(400).send({
          success: false,
          code: 'INVALID_PARAMS',
          message: 'id 和 name 均为必填',
        })
      }

      const existing = db.select().from(devices).where(eq(devices.id, id)).get()
      if (!existing) {
        return reply.status(404).send({
          success: false,
          code: 'NOT_FOUND',
          message: `设备 ${id} 不存在`,
        })
      }

      const updateData: Record<string, unknown> = { name, updatedAt: Date.now() }
      if (screenshotInterval !== undefined) {
        updateData.screenshotInterval = Math.max(2, Math.min(30, Math.round(screenshotInterval)))
      }

      db.update(devices)
        .set(updateData)
        .where(eq(devices.id, id))
        .run()

      const row = db.select().from(devices).where(eq(devices.id, id)).get()!
      app.log.info(`Device updated: ${name}`)
      return { success: true as const, data: toDeviceInfo(row) }
    },
  )

  // ── 扫描已连接设备 ────────────────────────────
  app.post('/api/devices/discover', async (_request, reply) => {
    try {
      const adbPath = ADB_PATH
      const discovered = await adbService.listDevices(adbPath)
      return { success: true as const, data: discovered }
    } catch (err) {
      return reply.status(500).send({
        success: false,
        code: 'DISCOVER_FAILED',
        message: err instanceof Error ? err.message : '设备扫描失败',
      })
    }
  })

  // ── 测试连接 ──────────────────────────────────
  app.post<{ Body: TestConnectionRequest }>(
    '/api/devices/test-connection',
    async (request, reply) => {
      const { adbAddress } = request.body
      if (!adbAddress) {
        return reply.status(400).send({
          success: false,
          code: 'INVALID_PARAMS',
          message: 'adbAddress 为必填',
        })
      }

      try {
        const adbPath = ADB_PATH
        const connected = await adbService.connect(adbPath, adbAddress)
        if (!connected) {
          const resp: TestConnectionResponse = {
            success: false,
            message: `无法连接到 ${adbAddress}，请确认设备在线且 USB 调试已开启`,
          }
          return { success: true as const, data: resp }
        }

        const size = await adbService.getScreenSize(adbPath, adbAddress)
        const resp: TestConnectionResponse = {
          success: true,
          screenSize: size ?? undefined,
          message: size
            ? `连接成功，分辨率: ${size.width}x${size.height}`
            : '连接成功，无法获取分辨率',
        }
        return { success: true as const, data: resp }
      } catch (err) {
        return reply.status(500).send({
          success: false,
          code: 'TEST_CONNECTION_FAILED',
          message: err instanceof Error ? err.message : '测试连接失败',
        })
      }
    },
  )

  // ── 设备截屏 ──────────────────────────────────
  app.post<{ Body: ScreenshotRequest }>(
    '/api/devices/screenshot',
    async (request, reply) => {
      const { deviceId } = request.body
      if (!deviceId) {
        return reply.status(400).send({
          success: false,
          code: 'INVALID_PARAMS',
          message: 'deviceId 为必填',
        })
      }

      // 查询设备信息
      const device = db.select().from(devices).where(eq(devices.id, deviceId)).get()
      if (!device) {
        return reply.status(404).send({
          success: false,
          code: 'NOT_FOUND',
          message: `设备 ${deviceId} 不存在`,
        })
      }

      try {
        const adbPath = ADB_PATH
        const rawBuffer = await adbService.screencap(adbPath, device.adbAddress)

        // 读取原始分辨率
        const rawMeta = await sharp(rawBuffer).metadata()
        const originalWidth = rawMeta.width ?? 0
        const originalHeight = rawMeta.height ?? 0

        // resize 按最长边 1280（支持横屏/竖屏）
        const { data: resizedBuffer, info } = await sharp(rawBuffer)
          .resize({
            width: config.resolution.width,
            height: config.resolution.width,
            fit: 'inside',
            withoutEnlargement: false,
          })
          .png({ compressionLevel: 6 })
          .toBuffer({ resolveWithObject: true })

        const base64 = resizedBuffer.toString('base64')
        const dataUrl = `data:image/png;base64,${base64}`

        return {
          success: true as const,
          data: {
            image: dataUrl,
            width: info.width,
            height: info.height,
            originalWidth,
            originalHeight,
            timestamp: Date.now(),
          },
        }
      } catch (err) {
        return reply.status(500).send({
          success: false,
          code: 'SCREENSHOT_FAILED',
          message: err instanceof Error ? err.message : '截屏失败',
        })
      }
    },
  )
  // ── 找图（模板匹配）──────────────────────────
  // 图片 base64 可能较大，单独设置 bodyLimit 为 20MB
  app.post<{ Body: FindPicRequest }>(
    '/api/devices/find-pic',
    { bodyLimit: 20 * 1024 * 1024 },
    async (request, reply) => {
      const { image, template, threshold, maxResults, region } = request.body
      if (!image || !template) {
        return reply.status(400).send({
          success: false,
          code: 'INVALID_PARAMS',
          message: 'image 和 template 均为必填',
        })
      }

      try {
        const result = await findPic({
          image,
          template,
          threshold,
          maxResults,
          region,
        })
        return { success: true as const, data: result }
      } catch (err) {
        return reply.status(500).send({
          success: false,
          code: 'FIND_PIC_FAILED',
          message: err instanceof Error ? err.message : '找图失败',
        })
      }
    },
  )

  // ── 找图 Pro（SIFT + FLANN + RANSAC）────────────────────
  app.post<{ Body: FindPicProRequest }>(
    '/api/devices/find-pic-pro',
    { bodyLimit: 20 * 1024 * 1024 },
    async (request, reply) => {
      const { image, template, threshold, maxResults, region, scales, minFeatures } = request.body
      if (!image || !template) {
        return reply.status(400).send({
          success: false,
          code: 'INVALID_PARAMS',
          message: 'image 和 template 均为必填',
        })
      }

      try {
        const result = await findPicPro({
          image,
          template,
          threshold,
          maxResults,
          region,
          scales,
          minFeatures,
        })
        return { success: true as const, data: result }
      } catch (err) {
        return reply.status(500).send({
          success: false,
          code: 'FIND_PIC_PRO_FAILED',
          message: err instanceof Error ? err.message : '找图 Pro 失败',
        })
      }
    },
  )

  // ── OCR 识字（getWords）────────────────────────
  app.post<{ Body: GetWordsRequest }>(
    '/api/devices/ocr-words',
    { bodyLimit: 20 * 1024 * 1024 },
    async (request, reply) => {
      const { image, region, color, colorTolerance } = request.body
      if (!image) {
        return reply.status(400).send({
          success: false,
          code: 'INVALID_PARAMS',
          message: 'image 为必填',
        })
      }

      try {
        const result = await getWords({ image, region, color, colorTolerance })
        return { success: true as const, data: result }
      } catch (err) {
        return reply.status(500).send({
          success: false,
          code: 'OCR_WORDS_FAILED',
          message: err instanceof Error ? err.message : 'OCR 识别失败',
        })
      }
    },
  )

  // ── OCR 找字（findStr）────────────────────────
  app.post<{ Body: FindStrRequest }>(
    '/api/devices/ocr-find-str',
    { bodyLimit: 20 * 1024 * 1024 },
    async (request, reply) => {
      const { image, target, region, similarity, color, colorTolerance } = request.body
      if (!image || !target) {
        return reply.status(400).send({
          success: false,
          code: 'INVALID_PARAMS',
          message: 'image 和 target 均为必填',
        })
      }

      try {
        const result = await findStr({ image, target, region, similarity, color, colorTolerance })
        return { success: true as const, data: result }
      } catch (err) {
        return reply.status(500).send({
          success: false,
          code: 'OCR_FIND_STR_FAILED',
          message: err instanceof Error ? err.message : '找字失败',
        })
      }
    },
  )

  // ── ADB 单点点击 ─────────────────────────
  app.post<{ Body: AdbClickRequest }>(
    '/api/devices/click',
    async (request, reply) => {
      const { deviceId, point } = request.body
      if (!deviceId) {
        return reply.status(400).send({
          success: false,
          code: 'INVALID_PARAMS',
          message: 'deviceId 为必填',
        })
      }

      const device = db.select().from(devices).where(eq(devices.id, deviceId)).get()
      if (!device) {
        return reply.status(404).send({
          success: false,
          code: 'NOT_FOUND',
          message: `设备 ${deviceId} 不存在`,
        })
      }

      try {
        const adbPath = ADB_PATH
        await adbService.connect(adbPath, device.adbAddress)
        // 通过 screencap 获取实际像素分辨率（wm size 方向可能与截图不一致）
        const size = await adbService.getScreencapSize(adbPath, device.adbAddress)
          ?? await adbService.getScreenSize(adbPath, device.adbAddress)
        const sf = size ? computeScaleFactor(size.width, size.height) : null
        const [actualX, actualY] = sf ? toActualPoint(point[0], point[1], sf) : point
        const result = await adbClick(adbPath, device.adbAddress, [actualX, actualY])
        return { success: true as const, data: result }
      } catch (err) {
        return reply.status(500).send({
          success: false,
          code: 'ADB_CLICK_FAILED',
          message: err instanceof Error ? err.message : '点击失败',
        })
      }
    },
  )

  // ── ADB 范围随机点击 ─────────────────────
  app.post<{ Body: AdbAreaClickRequest }>(
    '/api/devices/area-click',
    async (request, reply) => {
      const { deviceId, region } = request.body
      if (!deviceId) {
        return reply.status(400).send({
          success: false,
          code: 'INVALID_PARAMS',
          message: 'deviceId 为必填',
        })
      }

      const device = db.select().from(devices).where(eq(devices.id, deviceId)).get()
      if (!device) {
        return reply.status(404).send({
          success: false,
          code: 'NOT_FOUND',
          message: `设备 ${deviceId} 不存在`,
        })
      }

      try {
        const adbPath = ADB_PATH
        await adbService.connect(adbPath, device.adbAddress)
        const size = await adbService.getScreencapSize(adbPath, device.adbAddress)
          ?? await adbService.getScreenSize(adbPath, device.adbAddress)
        const sf = size ? computeScaleFactor(size.width, size.height) : null
        const actualRegion = sf ? toActualRegion(region, sf) : region
        const result = await adbAreaClick(adbPath, device.adbAddress, actualRegion)
        return { success: true as const, data: result }
      } catch (err) {
        return reply.status(500).send({
          success: false,
          code: 'ADB_AREA_CLICK_FAILED',
          message: err instanceof Error ? err.message : '范围点击失败',
        })
      }
    },
  )
  // ── ADB 拟人滑动 ───────────────────────
  app.post<{ Body: AdbSwipeRequest }>(
    '/api/devices/swipe',
    async (request, reply) => {
      const { deviceId, startRegion, endRegion, padding, steps } = request.body
      if (!deviceId || !startRegion || !endRegion) {
        return reply.status(400).send({
          success: false,
          code: 'INVALID_PARAMS',
          message: 'deviceId、startRegion、endRegion 均为必填',
        })
      }

      const device = db.select().from(devices).where(eq(devices.id, deviceId)).get()
      if (!device) {
        return reply.status(404).send({
          success: false,
          code: 'NOT_FOUND',
          message: `设备 ${deviceId} 不存在`,
        })
      }

      try {
        const adbPath = ADB_PATH
        await adbService.connect(adbPath, device.adbAddress)
        const size = await adbService.getScreencapSize(adbPath, device.adbAddress)
          ?? await adbService.getScreenSize(adbPath, device.adbAddress)
        const sf = size ? computeScaleFactor(size.width, size.height) : null
        const actualStart = sf ? toActualRegion(startRegion, sf) : startRegion
        const actualEnd = sf ? toActualRegion(endRegion, sf) : endRegion
        const result = await adbSwipe(adbPath, device.adbAddress, actualStart, actualEnd, { padding, steps })
        return { success: true as const, data: result }
      } catch (err) {
        return reply.status(500).send({
          success: false,
          code: 'ADB_SWIPE_FAILED',
          message: err instanceof Error ? err.message : '滑动失败',
        })
      }
    },
  )
}
