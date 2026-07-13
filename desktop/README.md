# @automan/desktop

Automan 桌面端：Electron 壳 + Node sidecar。**不把 server 塞进 Electron 进程**——better-sqlite3 无官方 Electron ABI 预编译产物，改用随包便携 Node 跑 server bundle，三种分发形态（tsx 开发 / start.bat 网页版 / 桌面版）共用同一套 Node-ABI 产物。

## 架构

```
Electron 主进程（dist/main.cjs，asar）
 └─ spawn resources/server/bin/automan-server(.exe)   ← 改名的官方 Node
     └─ resources/server/index.mjs                    ← esbuild bundle 的 Fastify server
         ├─ 静态托管 resources/web（web/dist）
         ├─ node_modules/（better-sqlite3 / sharp 原生依赖，pnpm deploy 物化）
         ├─ *.py + drizzle/ + automan.config.json5
         └─ spawn resources/python/python.exe（仅 Windows 内置）/ adb / ldconsole
窗口加载 http://127.0.0.1:<port>/login?port=<port>&autoconnect=1
```

- **端口**：从上次成功端口（settings.json）起递增探测；被占端口若 `/health` 指纹匹配（同数据目录的陈旧 sidecar，上次崩溃残留）则清掉复用，防双开脑裂
- **数据**：`<userData>/data/automan.db`（启动时自动备份 .bak）；日志 `<userData>/logs/server.log`（5MB×3 轮转）
- **退出**：关 stdin → server 优雅关闭（actors/workflows/OCR worker/sqlite 全清）→ 5s 超时 taskkill /T 兜底
- **托盘**：关窗默认最小化到托盘继续挂机；局域网访问开关（重启生效，Windows 会弹防火墙提示）

## 本地开发（macOS/Windows）

```bash
# 前端热更模式：连已有的 tsx watch(3000) + vite(5173)
pnpm dev:server & pnpm dev:web        # 仓库根
AUTOMAN_DEV=1 pnpm --filter @automan/desktop dev

# 整链路模式：跑打包产物
pnpm --filter @automan/desktop build:all
pnpm --filter @automan/desktop dev
```

国内网络先设镜像（Electron 二进制与 NSIS 工具链下载）：

```bash
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

## 出包

| 命令 | 说明 |
|------|------|
| `pnpm --filter @automan/desktop dist:mac` | mac dmg（arm64；本机构建） |
| `pnpm --filter @automan/desktop dist:win` | Windows NSIS（**必须在 Windows 上跑**，先执行 `prepare-python.ps1`） |

CI：推 `v*` tag 触发 `.github/workflows/release.yml`，双平台出包并挂到 **draft** Release。

Windows 侧注意：

- 原生模块 prebuild 与 `pnpm install` 时的 Node ABI 绑定，install / `build:all` / 打包必须用同一个 Node（CI 由 setup-node 统一）
- `prepare-python.ps1` 需要宿主 Python 3.12（与 embeddable 同 minor）；首次构建后把 `out/python/installed-packages.txt` 固化为 `server/src/libs/requirements-lock.txt` 提交
- 升级/卸载时 NSIS 钩子（build/installer.nsh）会 taskkill `automan-server.exe` 进程树，防文件占用

## 分发的已知现实

- **Windows SmartScreen**：未签名安装包会被拦，需「更多信息 → 仍要运行」；杀软可能误报（spawn adb、常驻后台），发布页应附白名单指引。中期方案：代码签名（Azure Trusted Signing / EV）
- **macOS Gatekeeper（Sequoia+）**：右键打开已失效，需 系统设置 → 隐私与安全性 → 仍要打开；mac 版定位「工作流编辑 + 远程控制端」，不内置 Python（找图/OCR 需连 Windows 机器）
- **系统睡眠会中断挂机**，请在系统设置里关闭睡眠（powerSaveBlocker 列入后续版本）

## v1 明确不做

electron-updater 自动更新、代码签名、node_modules 白名单裁剪（保留 pnpm deploy 全量，确定性优先）、LAN 热重启（改为重启应用生效）、旧网页版 `<repo>/data` 数据导入。
