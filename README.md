# 凹凸曼 — 低代码自动化脚本编排引擎

> 基于截图驱动的可视化工作流编辑器 + 自动化执行引擎  
> 支持多设备并发、实时看板、节点编排、WebSocket 实时通信

---

## 项目概述

凹凸曼（Automan）是一个面向自动化任务（游戏养号、UI 自动化、RPA 流程）的全栈系统：

- **可视化编排**：拖拽节点构建工作流（识图、OCR、点击、条件判断、循环、随机等待等）
- **截图驱动**：设备每 2 秒自动截屏，工作流以截图为输入自动执行
- **触发方式**：立即模式（每次截图自动执行）/ 定时模式（cron 指定时间点触发）
- **停止条件**：成功 N 次后停止 / 失败 N 次后停止（0=不限）
- **三值结束语义**：结束（成功）/ 结束（失败）/ 结束（中性不计数）
- **实时看板**：截图 + 执行结果叠加标注（识别框、点击波纹、文字区域），支持画布点击触发模拟器 ADB 点击
- **多设备并发**：每个设备独立运行多工作流，busy 锁防并发
- **设备级会话**：同一设备多工作流共享 DeviceSession，设备检测只做一次
- **应用控制**：支持启动/关闭/重启应用、检测应用运行状态节点
- **数据引用与算术**：`{{nodeId.key}}` 引用上游输出，支持内嵌算术（如 `{{ref}} + 100`）
- **坐标安全钗制**：所有 region/坐标参数自动 clamp 到 `[0, maxWidth/Height]`
- **脚本导入/导出/复制**：JSON 文件导入导出、一键复制脚本（含全部节点）
- **全局 Toast 反馈**：PrimeVue Toast 统一操作成功/失败提示
- **登录缓存重连**：localStorage 缓存服务器地址，刷新页自动尝试 WS 重连
- **勾选快照持久化**：per-device 勾选列表存入 DB，刷新页面自动恢复
- **实时状态同步**：设备运行状态 + 工作流 FlowState 通过 WebSocket 实时推送

---

## 技术栈

| 层 | 技术 |
|---|------|
| **前端** | Vue 3 + TypeScript + PrimeVue + UnoCSS + Vue Flow |
| **后端** | Fastify + TypeScript + Drizzle ORM |
| **数据库** | SQLite (better-sqlite3) |
| **图像处理** | sharp (压缩) + OpenCV/Python (识图/OCR) |
| **通信** | WebSocket (实时) + REST API |
| **设备控制** | ADB (雷电模拟器) |
| **构建** | pnpm workspace (monorepo) + Vite |

---

## 项目结构

```
automan/
├── server/                   # 后端服务
│   ├── automan.config.json5  # 应用配置（分辨率、截图间隔等）
│   └── src/
│       ├── app.ts            # Fastify 应用入口 + EventBus → WS 桥接
│       ├── server.ts         # 启动文件
│       ├── config.ts         # JSON5 配置加载器
│       ├── core/
│       │   ├── event-bus.ts  # 全局事件总线
│       │   └── logger.ts     # 日志封装
│       ├── db/
│       │   ├── schema.ts     # Drizzle Schema (devices, workflows)
│       │   ├── index.ts      # 数据库连接
│       │   └── migrate.ts    # 自动迁移
│       ├── modules/
│       │   ├── actor/        # Actor 基类 + 管理器
│       │   ├── device/       # ADB 服务封装
│       │   ├── task/         # 任务 Actor 系统
│       │   ├── ws/           # WebSocket 网关 + 分发
│       │   └── workflow/     # 工作流引擎核心
│       │       ├── engine.ts           # 节点执行引擎 (三值 success 语义)
│       │       ├── workflow.actor.ts   # 工作流 Actor (6 态状态机 + 计数)
│       │       ├── device.session.ts   # 设备级会话 (多工作流共享)
│       │       ├── screenshot.dispatcher.ts  # 截图调度器 (sharp 压缩)
│       │       ├── cron.manager.ts     # 动态 cron 管理 (node-cron)
│       │       ├── service.ts          # 工作流运行服务
│       │       └── refResolver.ts      # 变量引用解析
│       ├── libs/             # Python 脚本封装
│       │   ├── adb-app.ts           # ADB 应用控制 (monkey/am/pidof)
│       │   ├── find-pic-pro.ts/py    # SIFT 找图
│       │   ├── find-pic.ts/py        # 模板匹配找图
│       │   ├── ocr.ts/py             # OCR 识字/找字
│       │   └── adb-click.ts          # ADB 点击
│       ├── routes/           # REST API 路由
│       └── plugins/          # Fastify 插件
│
├── web/                      # 前端应用
│   ├── public/
│   │   └── logo.png          # 品牌 Logo
│   └── src/
│       ├── views/
│       │   ├── HomeView.vue    # 首页：三栏布局 (设备/工作流/日志+看板)
│       │   ├── FlowView.vue    # 工作流编辑器 (脚本列表+画布+配置面板)
│       │   ├── CanvasView.vue  # 画板：截图框选 + 找图/OCR 调试
│       │   └── LoginView.vue   # 登录页
│       ├── components/
│       │   ├── ExecutionViewer.vue   # 实时看板 (截图+注解+画布点击)
│       │   ├── LogPanel.vue          # 日志面板
│       │   ├── WorkflowListPanel.vue # 工作流列表 + 运行配置表单
│       │   ├── FindPicPanel.vue      # 找图调试面板
│       │   ├── OcrPanel.vue          # OCR 调试面板
│       │   ├── AppHeader.vue         # 顶部导航栏
│       │   └── flow/                 # 工作流节点组件 (含 EndSuccess/EndFail)
│       ├── composables/
│       │   ├── useWorkflowRun.ts  # 工作流运行状态 (模块级单例)
│       │   ├── useDevices.ts      # 设备管理
│       │   ├── useSelection.ts    # 截图框选逻辑
│       │   └── useWebSocket.ts    # WebSocket 封装
│       └── flow/               # 节点类型定义
│
├── shared/                   # 共享类型 + 工具
│   └── src/
│       └── types.ts          # 全局类型定义
│
└── docs/                     # 文档
    ├── 开发前必读.md           # 开发约束与规范
    └── 坐标与尺寸问题分析.md    # 坐标系统技术文档
```

---

## 核心架构

### 设备级会话（DeviceSession）

```
┌─────────────────────────────────────────────────────────────┐
│ 设备 A (DeviceSession)                                         │
│  ├─ 模拟器启动 + ADB 连接 + 分辨率校准 (ensureReady, 幂等) │
│  ├─ 工作流 1 (WorkflowActor) → 订阅截图 → 执行引擎       │
│  ├─ 工作流 2 (WorkflowActor) → 订阅截图 → 执行引擎       │
│  └─ ScreenshotDispatcher (每 2s 截屏 → EventBus)            │
└─────────────────────────────────────────────────────────────┘
```

同一设备的多个工作流共享同一个 DeviceSession：
- 设备检测（模拟器启动、ADB 连接、分辨率校准）只执行一次
- 截图调度器按设备维度运行，所有工作流订阅同一截图事件
- busy 锁在 WorkflowActor 层，每个工作流独立防止自身并发

### 工作流状态机（FlowState）

```
idle → pending → processing → success/fail → idle (循环)
                             → completed (达到上限，终态)
```

- **立即模式**：每次截图到达自动执行（idle 不阻塞）
- **定时模式**：cron 信号设置 pending → 下次截图执行 → 完成后 autoPending 自动回到 pending
- **三值结束语义**：`endSuccess` → success=true, `endFail` → success=false, `end` → undefined（中性不计数）
- **计数停止**：successCount ≥ maxSuccessCount 或 failCount ≥ maxFailCount 时进入 completed 终态

### 双层循环执行模型

```
外层（系统级）：每 2s 截屏 → ScreenshotDispatcher (sharp 1280px 压缩) → EventBus
                                                              ↓
内层（工作流级）：WorkflowActor 收到截图 → busy 锁检查 → Engine 逐节点执行
```

**busy 锁机制**：收到截图后立即设置 `busy = true`（在 `await ensureReady()` 之前），执行完成后才释放。执行期间到达的截图被直接丢弃，避免排队堆积。

### 坐标空间统一

所有截图强制 resize 到 **标准分辨率 1280×720**（横屏模式），配置于 `automan.config.json5`。

- 截图空间 = 标准分辨率空间，**无需任何坐标转换**
- 画板框选 → 标准分辨率坐标
- 工作流参数 (region/click) → 标准分辨率坐标
- 引擎内部 → 直接使用标准分辨率坐标
- 看板标注 → `displayW / screenshot.width` 缩放渲染

### 数据引用系统

所有节点的参数支持 `{{nodeId.outputKey}}` 引用上游输出：

```
findPic → matchX=100, matchY=200
    ↓
data: set value = {{findPic_1.matchX}} + 100  → value=200
    ↓
areaClick: region = {{data_1.value}}, ...  → 解析为 200, ...
```

- **完整引用** `{{ref}}` → 返回原始类型（数字/布尔）
- **内嵌算术** `{{ref}} + 100` / `{{ref}} * 2 - 50` → 递归下降解析器，支持 `+-*/` 和括号
- **坐标安全钗制**：`clampRegion` / `clampPoint` 自动限制到 `[0, maxW]` / `[0, maxH]`

### WebSocket 实时通信

```
Engine 注解 → WorkflowActor.emitVisual() → EventBus → app.ts → WS 广播 → 前端
ScreenshotDispatcher → SCREENSHOT_READY → app.ts → WS 广播 → 前端 (底图实时更新)
```

---

## 工作流节点

| 类型 | 节点 | 说明 |
|------|------|------|
| 流程 | start / end | 开始 / 结束（中性，不计数） |
| 流程 | endSuccess | 结束（成功），触发 successCount++ |
| 流程 | endFail | 结束（失败），触发 failCount++ |
| 流程 | condition | 条件判断 (支持 `{{nodeId.key}}` 引用，输出 `result`) |
| 流程 | loop | 循环 (back edge + 自动标记) |
| 动作 | findPic | SIFT/多尺度模板匹配 (region 支持引用) |
| 动作 | ocrWords | OCR 全图识字 |
| 动作 | ocrFindStr | OCR 找指定文字 |
| 动作 | click | 坐标点击 (x/y 支持引用) |
| 动作 | areaClick | 区域随机点击 (region 支持引用) |
| 动作 | delay | 延时等待 |
| 动作 | randomDelay | 随机等待 (left~right 范围，输出 actualMs) |
| 应用 | launchApp | 启动应用 (monkey) |
| 应用 | killApp | 关闭应用 (am force-stop) |
| 应用 | restartApp | 重启应用 (kill + delay + launch) |
| 应用 | appRunning | 检测应用是否运行 (pidof) |
| 数据 | variable | 变量 (local/session/input 三种作用域) |

---

## 页面布局

### 登录页（LoginView）

品牌 Logo + 服务器地址/端口输入，连接成功后缓存到 localStorage，刷新页面自动从缓存尝试 WS 重连（3s 超时），失败才跳转登录页。

### 首页（HomeView）— 设备与工作流运行控制

```
┌─ 设备列表 ─┬─ 工作流列表 + 配置 ─┬─ 操作按钮 (通屏) ──────────┐
│  设备 A ● │  ☑ 工作流1          │ [开始] [停止]  已运行 00:05 │
│  设备 B   │  ☐ 工作流2          ├─ 实时看板 ─────────────────┤
│            │  ☑ 工作流3          │  [截图 + 识别框/点击波纹]    │
│            │  ── 运行配置 ──     │  (画布点击可触发 ADB 点击)   │
│            │  触发: ●立即 ○定时  ├─ 日志滚动区 ────────────────┤
│            │  成功上限: [2]      │  07-13 00:21 [info] ...      │
│            │  失败上限: [2]      │                              │
│            │  [保存设置]         │                              │
└────────────┴────────────────────┴──────────────────────────────┘
```

- 默认选中第一个设备
- 设备状态指示器：● 绿色=运行中、● 橙色=空闲、● 红色=错误、○ 灰色=未运行
- 勾选快照自动保存到 DB，刷新页面自动恢复上次勾选状态
- **运行配置**：触发方式（立即/定时）、定时时间（DatePicker 时间选择器）、成功/失败上限
- **FlowState 实时展示**：空闲/等待/执行中/成功/失败/已完成
- **实时看板**：截图 + 注解叠加，点击画布可触发模拟器 ADB 点击（含坐标缩放转换）
- **Toast 反馈**：保存配置成功/失败时 PrimeVue Toast 全局提示

### Flow 编辑器（FlowView）— 纯可视化画布

```
┌─ 脚本列表 ─┬─ 节点面板 ─┬─ [名称]   [复制][导出][保存][删除] ─┬─ 配置面板 ─┐
│ [导入][新建]│            │                                    │             │
│            │            │         VueFlow 画布                │             │
│  - 脚本A ● │            │                                    │             │
│  - 脚本B   │            │                                    │             │
└────────────┴────────────┴────────────────────────────────────┴─────────────┘
```

- 左侧脚本列表（240px），导入/新建按钮为 primary 样式
- 工具栏：名称可编辑、复制/导出/保存/删除按钮（flex-shrink-0 防挤压）
- 导入：上传 JSON 文件自动创建并选中
- 导出：下载 `{name, nodes, edges}` 格式 JSON
- 复制：弹窗预填「原名+随机后缀」，确认后复制全部节点并选中新脚本
- 未选中脚本时显示空占位

### 画板（CanvasView）— 截图调试

- 截图框选 + 坐标复制
- 取色工具（吸管 + 复制色值）
- 找图/OCR 在线测试
- ADB 点击/范围点击

---

## 前端 UI 规范

- **组件库**：所有 UI 组件优先使用 PrimeVue（Button、Dialog、InputText、Select、Slider、SelectButton 等）
- **主题**：PrimeVue Aura 预设 + 自定义 brand 色（blue-600 系列 #2563eb）
- **布局**：UnoCSS 用于布局工具类（flex、padding、margin、gap 等）
- **图标**：primeicons CSS 类（`<i class="pi pi-xxx" />`）
- **UnoCSS shortcuts 已清除**：不再使用 `btn-primary`/`btn-ghost`/`btn-danger`/`input-base`

---

## 配置文件

`server/automan.config.json5`（JSON5 格式，支持注释和尾逗号）：

```json5
{
  // 标准分辨率（横屏模式）
  resolution: {
    width: 1280,
    height: 720,
  },
  // 截图调度配置
  screenshot: {
    interval: 2000,  // 截图间隔（ms）
  },
}
```

---

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/workflows/run` | 启动单个工作流 |
| POST | `/api/workflows/run-batch` | 批量启动（设备级，一次 ensureReady） |
| POST | `/api/workflows/stop` | 停止工作流 |
| POST | `/api/workflows/stop-all` | 停止所有工作流 |
| GET | `/api/workflows/running` | 查询运行中工作流 |
| GET | `/api/workflows/checked` | 查询所有设备勾选快照 |
| GET | `/api/workflows/checked/:deviceId` | 查询单设备勾选快照 |
| POST | `/api/workflows/checked-save` | 保存勾选快照 (upsert) |
| POST | `/api/workflows/run-config` | 保存运行配置 |
| GET | `/api/workflows/run-config/:deviceId/:workflowId` | 获取单个运行配置 |
| GET | `/api/workflows/run-configs/:deviceId` | 获取设备所有运行配置 |
| GET | `/api/workflows/device-status` | 查询所有设备运行状态 |
| GET | `/api/workflows/device-status/:deviceId` | 查询单设备运行状态 |

---

## 开发

```bash
# 安装依赖
pnpm install

# 启动后端 (开发模式)
cd server && pnpm dev

# 启动前端 (开发模式)
cd web && pnpm dev
```

### 环境变量

- `LOG_LEVEL`：日志级别 (默认 info)
- `PORT`：后端端口 (默认 3000)

### 数据库

SQLite，文件位于 `F:\workspace\data\automan.db`（项目根目录上层 `data/`）。  
使用 Drizzle ORM，自动迁移。

---

## 已实现功能

- [x] Actor 模型 + EventBus 事件驱动
- [x] 低代码工作流编辑器 (Vue Flow)
- [x] 截图驱动执行引擎 (双层循环)
- [x] SIFT + 多尺度模板匹配 (Python/OpenCV)
- [x] OCR 识字/找字 (Python)
- [x] 截图压缩 (sharp, 1280px 标准分辨率)
- [x] 实时看板 (截图 + 注解叠加)
- [x] 设备管理 (CRUD + 雷电模拟器集成)
- [x] 首页三栏布局 (默认选中首设备)
- [x] Flow 编辑器脚本列表 + 工具栏
- [x] 画板调试工具 (框选坐标 + 找图/OCR 测试 + 取色器)
- [x] WebSocket 实时日志/状态推送
- [x] 三层变量作用域 (local/session/input)
- [x] 坐标空间统一 (标准分辨率 1280px 基准，无转换)
- [x] JSON5 配置文件
- [x] PrimeVue UI 全面统一 (Button/InputText/Select/Slider/SelectButton/Dialog)
- [x] 品牌 Logo + 中文名“凹凸曼”
- [x] 设备级批量启动 (batchRun API, 一次 ensureReady + 并行启动)
- [x] DeviceSession 设备级会话 (多工作流共享, 幂等就绪检测)
- [x] 应用控制节点 (launchApp/killApp/restartApp/appRunning)
- [x] 勾选快照持久化 (per-device, DB 存储, 防抖自动保存)
- [x] 设备运行状态 WS 实时同步 (DEVICE_RUN_STATUS 事件)
- [x] busy 锁修复 (busy 在 ensureReady 前设置, 截图丢弃而非排队)

- [x] 定时触发 (CronManager + node-cron, 多时间点调度)
- [x] 工作流运行配置 (触发方式/定时时间/停止条件, DB 持久化)
- [x] 6 态状态机 (idle/pending/processing/success/fail/completed)
- [x] 三值结束语义 (endSuccess/endFail/end 中性不计数)
- [x] 成功/失败计数 + 自动停止 (达到上限进入 completed 终态)
- [x] autoPending 机制 (定时模式 neutral end 后自动继续)
- [x] 全局 Toast 反馈 (PrimeVue ToastService)
- [x] 画布点击触发 ADB 点击 (坐标转换 + letterbox 偏移处理)
- [x] 数据引用 + 内嵌算术 (`{{ref}} + 100`，递归下降解析器)
- [x] 坐标安全钗制 (clampRegion/clampPoint 自动限制到配置最大值)
- [x] 随机等待节点 (randomDelay: left~right 范围随机，输出 actualMs)
- [x] 脚本导入/导出/复制 (JSON 文件 + 一键复制含全部节点)
- [x] 登录缓存 + WS 自动重连 (localStorage 缓存, 3s 超时)
- [x] 条件节点输出存储 (condition.result 可被下游引用)
- [x] region/坐标字段支持引用 (coord-ref 类型 + DataRefInput)
- [x] 点击节点 x/y 支持引用 (data-input 类型)

## 待实现

- [ ] 模板图片独立文件存储 (当前 base64 内嵌 JSON)
- [ ] ADB click 坐标转换 (设备分辨率 ≠ 标准分辨率时)
- [ ] 分辨率不匹配告警机制
- [ ] 工作流持久化运行 (断点续跑)
- [ ] 多用户/权限管理
