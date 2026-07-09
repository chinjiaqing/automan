// ─────────────────────────────────────────────
// 设备路由模块
// 职责：设备 CRUD（list / create / delete）
// 统一使用 POST/GET + ApiResponse 格式
// ─────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import { db, devices } from '../db/index.js'
import { eq } from 'drizzle-orm'
import type {
  CreateDeviceRequest,
  DeleteDeviceRequest,
  DeviceInfo,
  ListInstancesRequest,
  ScreenshotRequest,
  FindPicRequest,
  GetWordsRequest,
  FindStrRequest,
} from '@automan/shared/types.js'
import { DeviceStatus } from '@automan/shared/types.js'
import { LDPlayerService } from '../modules/device/ldplayer.service.js'
import { AdbService } from '../modules/device/adb.service.js'
import { findPic, getWords, findStr } from '../libs/index.js'

/** 将 DB Row 转为 DeviceInfo */
function toDeviceInfo(row: typeof devices.$inferSelect): DeviceInfo {
  return {
    id: row.id,
    name: row.name,
    ldconsolePath: row.ldconsolePath,
    instanceIndex: row.instanceIndex,
    status: row.status as DeviceStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const ldPlayer = new LDPlayerService()
const adbService = new AdbService()

export async function deviceRoutes(app: FastifyInstance): Promise<void> {
  // ── 查询设备列表 ───────────────────────────
  app.get('/api/devices', async () => {
    const rows = db.select().from(devices).all()
    return { success: true as const, data: rows.map(toDeviceInfo) }
  })

  // ── 创建设备 ───────────────────────────────
  app.post<{ Body: CreateDeviceRequest }>('/api/devices/create', async (request, reply) => {
    const { name, ldconsolePath, instanceIndex } = request.body

    // 基础校验
    if (!name || !ldconsolePath || instanceIndex === undefined) {
      return reply.status(400).send({
        success: false,
        code: 'INVALID_PARAMS',
        message: 'name、ldconsolePath、instanceIndex 均为必填',
      })
    }

    // 检查是否已绑定相同实例
    const existing = db
      .select()
      .from(devices)
      .where(eq(devices.ldconsolePath, ldconsolePath))
      .all()
    const duplicate = existing.find((d) => d.instanceIndex === instanceIndex)
    if (duplicate) {
      return reply.status(409).send({
        success: false,
        code: 'DUPLICATE_INSTANCE',
        message: `实例 ${instanceIndex} 已在设备「${duplicate.name}」中绑定`,
      })
    }

    const now = Date.now()
    const id = crypto.randomUUID()

    db.insert(devices)
      .values({
        id,
        name,
        ldconsolePath,
        instanceIndex,
        status: DeviceStatus.STOPPED,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    const row = db.select().from(devices).where(eq(devices.id, id)).get()!
    app.log.info(`Device created: ${name} [index=${instanceIndex}]`)
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
  app.post<{ Body: { id: string; name: string } }>(
    '/api/devices/update',
    async (request, reply) => {
      const { id, name } = request.body
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

      db.update(devices)
        .set({ name, updatedAt: Date.now() })
        .where(eq(devices.id, id))
        .run()

      const row = db.select().from(devices).where(eq(devices.id, id)).get()!
      app.log.info(`Device updated: ${name}`)
      return { success: true as const, data: toDeviceInfo(row) }
    },
  )

  // ── 查询模拟器实例列表 ────────────────────────
  app.post<{ Body: ListInstancesRequest }>(
    '/api/devices/instances',
    async (request, reply) => {
      const { ldconsolePath } = request.body
      if (!ldconsolePath) {
        return reply.status(400).send({
          success: false,
          code: 'INVALID_PARAMS',
          message: 'ldconsolePath 为必填',
        })
      }

      const valid = await ldPlayer.validatePath(ldconsolePath)
      if (!valid) {
        return reply.status(400).send({
          success: false,
          code: 'INVALID_PATH',
          message: 'ldconsole 路径无效或无法执行',
        })
      }

      const instances = await ldPlayer.listInstancesParsed(ldconsolePath)
      return { success: true as const, data: instances }
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
        const pngBuffer = await adbService.screencap(device.ldconsolePath, device.instanceIndex)
        const base64 = pngBuffer.toString('base64')
        const dataUrl = `data:image/png;base64,${base64}`

        // 解析 PNG 尺寸（从 IHDR chunk 读取）
        const { width, height } = parsePngSize(pngBuffer)

        return {
          success: true as const,
          data: {
            image: dataUrl,
            width,
            height,
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

  // ── OCR 识字（getWords）────────────────────────
  app.post<{ Body: GetWordsRequest }>(
    '/api/devices/ocr-words',
    { bodyLimit: 20 * 1024 * 1024 },
    async (request, reply) => {
      const { image, region, color } = request.body
      if (!image) {
        return reply.status(400).send({
          success: false,
          code: 'INVALID_PARAMS',
          message: 'image 为必填',
        })
      }

      try {
        const result = await getWords({ image, region, color })
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
      const { image, target, region, similarity, color } = request.body
      if (!image || !target) {
        return reply.status(400).send({
          success: false,
          code: 'INVALID_PARAMS',
          message: 'image 和 target 均为必填',
        })
      }

      try {
        const result = await findStr({ image, target, region, similarity, color })
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
}

/** 从 PNG Buffer 解析图片尺寸 */
function parsePngSize(buffer: Buffer): { width: number; height: number } {
  // PNG IHDR chunk 从第 16 字节开始：4字节 width + 4字节 height
  if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)
    return { width, height }
  }
  return { width: 0, height: 0 }
}
