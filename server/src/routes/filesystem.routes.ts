// ─────────────────────────────────────────────
// 文件系统浏览路由
// 职责：提供本地文件系统目录浏览能力（仅供选择 ldconsole.exe 路径）
// ─────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import { readdirSync, statSync } from 'node:fs'
import { resolve, join, dirname, sep } from 'node:path'
import type { BrowseResponse, FileEntry } from '@automan/shared/types.js'

export async function filesystemRoutes(app: FastifyInstance): Promise<void> {
  // ── 浏览目录 ─────────────────────────────────
  app.get<{ Querystring: { path?: string } }>(
    '/api/filesystem/browse',
    async (request, reply) => {
      const queryPath = request.query.path

      // 无路径参数 → 返回可用磁盘列表（Windows）
      if (!queryPath || queryPath === '') {
        const drives = getWindowsDrives()
        return {
          success: true as const,
          data: {
            currentPath: '',
            parentPath: null,
            entries: drives.map((d) => ({
              name: d,
              path: d + sep,
              isDirectory: true,
            })),
          } satisfies BrowseResponse,
        }
      }

      const targetPath = resolve(queryPath)

      // 安全检查：确保路径存在且为目录
      try {
        const stat = statSync(targetPath)
        if (!stat.isDirectory()) {
          return reply.status(400).send({
            success: false,
            code: 'NOT_DIRECTORY',
            message: `${targetPath} 不是目录`,
          })
        }
      } catch {
        return reply.status(400).send({
          success: false,
          code: 'PATH_NOT_FOUND',
          message: `路径不存在: ${targetPath}`,
        })
      }

      // 读取目录内容
      const entries: FileEntry[] = []
      try {
        const items = readdirSync(targetPath)
        for (const name of items) {
          // 跳过隐藏文件和系统文件
          if (name.startsWith('.') || name === '$Recycle.Bin' || name === 'System Volume Information') {
            continue
          }
          const fullPath = join(targetPath, name)
          try {
            const itemStat = statSync(fullPath)
            // 只返回目录和 .exe 文件
            if (itemStat.isDirectory() || (itemStat.isFile() && name.toLowerCase().endsWith('.exe'))) {
              entries.push({
                name,
                path: fullPath,
                isDirectory: itemStat.isDirectory(),
              })
            }
          } catch {
            // 跳过无权限访问的条目
          }
        }
      } catch {
        return reply.status(403).send({
          success: false,
          code: 'ACCESS_DENIED',
          message: `无法读取目录: ${targetPath}`,
        })
      }

      // 排序：目录在前，文件在后
      entries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      // 计算父路径
      const parentPath = dirname(targetPath)
      const isRoot = parentPath === targetPath // Windows 根目录（如 C:\）

      return {
        success: true as const,
        data: {
          currentPath: targetPath,
          parentPath: isRoot ? null : parentPath,
          entries,
        } satisfies BrowseResponse,
      }
    },
  )
}

/** 获取 Windows 可用磁盘驱动器 */
function getWindowsDrives(): string[] {
  const drives: string[] = []
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code)
    try {
      statSync(`${letter}:\\`)
      drives.push(`${letter}:`)
    } catch {
      // 磁盘不存在
    }
  }
  return drives
}
