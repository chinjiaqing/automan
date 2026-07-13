// electron-builder afterPack 钩子
// extraResources 在遍历层硬排除 node_modules，sidecar 的原生依赖
// （better-sqlite3 / sharp）必须在此手动补拷进 resources/server/。
const { cpSync, existsSync } = require('node:fs')
const { join } = require('node:path')

exports.default = async function afterPack(context) {
  const src = join(__dirname, '..', 'out', 'server', 'node_modules')
  if (!existsSync(src)) {
    throw new Error(`[after-pack] ${src} 不存在，请先运行 pnpm prune:modules`)
  }
  const resourcesDir =
    context.electronPlatformName === 'darwin'
      ? join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources',
        )
      : join(context.appOutDir, 'resources')
  const dest = join(resourcesDir, 'server', 'node_modules')
  cpSync(src, dest, { recursive: true })
  console.log(`  • [after-pack] server node_modules → ${dest}`)
}
