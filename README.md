# Automan — 低代码自动化工作流引擎

> 基于截图驱动的可视化工作流编辑器 + 自动化执行引擎  
> 支持多设备并发、实时看板、节点编排、WebSocket 实时通信

---

## 项目概述

Automan 是一个面向自动化任务（游戏养号、UI 自动化、RPA 流程）的全栈系统：

- **可视化编排**：拖拽节点构建工作流（识图、OCR、点击、条件判断、循环等）
- **截图驱动**：设备每 2 秒自动截屏，工作流以截图为输入自动执行
- **实时看板**：截图 + 执行结果叠加标注（识别框、点击波纹、文字区域）
- **多设备并发**：每个设备独立运行多工作流，busy 锁防并发

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
│   └── src/
│       ├── app.ts            # Fastify 应用入口 + EventBus → WS 桥接
│       ├── server.ts         # 启动文件
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
│       │       ├── engine.ts           # 节点执行引擎
│       │       ├── workflow.actor.ts   # 工作流 Actor
│       │       ├── screenshot.dispatcher.ts  # 截图调度器 (sharp 压缩)
│       │       ├── service.ts          # 工作流运行服务
│       │       └── refResolver.ts      # 变量引用解析
│       ├── libs/             # Python 脚本封装
│       │   ├── find-pic-pro.ts/py    # SIFT 找图
│       │   ├── find-pic.ts/py        # 模板匹配找图
│       │   ├── ocr.ts/py             # OCR 识字/找字
│       │   └── adb-click.ts          # ADB 点击
│       ├── routes/           # REST API 路由
│       └── plugins/          # Fastify 插件
│
├── web/                      # 前端应用
│   └── src/
│       ├── views/
│       │   ├── HomeView.vue    # 首页：三栏布局 (设备/工作流/日志+看板)
│       │   ├── FlowView.vue    # 工作流编辑器 (纯可视化画布)
│       │   ├── CanvasView.vue  # 画板：截图框选 + 找图/OCR 调试
│       │   └── LoginView.vue   # 登录页
│       ├── components/
│       │   ├── ExecutionViewer.vue   # 实时看板 (截图+注解叠加)
│       │   ├── LogPanel.vue          # 日志面板
│       │   ├── WorkflowListPanel.vue # 工作流列表
│       │   ├── FindPicPanel.vue      # 找图调试面板
│       │   └── flow/                 # 工作流节点组件
│       ├── composables/
│       │   ├── useWorkflowRun.ts  # 工作流运行状态 (模块级单例)
│       │   ├── useDevices.ts      # 设备管理
│       │   └── useWebSocket.ts    # WebSocket 封装
│       └── flow/               # 节点类型定义
│
└── shared/                   # 共享类型 + 工具
    └── src/
        └── types.ts          # 全局类型定义
```

---

## 核心架构

### 双层循环执行模型

```
外层（系统级）：每 2s 截屏 → ScreenshotDispatcher (sharp 720px 压缩) → EventBus
                                                            ↓
内层（工作流级）：WorkflowActor 收到截图 → Engine 逐节点执行 → busy 锁防并发
```

### 坐标空间统一

所有用户可见的坐标均基于**原始设备分辨率**：

- 画板框选 → 原始坐标
- 工作流参数 (region/click) → 原始坐标
- 引擎内部 → 自动缩放 region 到压缩空间，结果缩放回原始空间
- 看板标注 → `displayW / originalWidth` 缩放渲染

### WebSocket 实时通信

```
Engine 注解 → WorkflowActor.emitVisual() → EventBus → app.ts → WS 广播 → 前端
ScreenshotDispatcher → SCREENSHOT_READY → app.ts → WS 广播 → 前端 (底图实时更新)
```

---

## 工作流节点

| 类型 | 节点 | 说明 |
|------|------|------|
| 流程 | start / end | 开始/结束 |
| 流程 | condition | 条件判断 (支持 `{{nodeId.key}}` 引用) |
| 流程 | loop | 循环 (back edge + 自动标记) |
| 动作 | findPic | SIFT/多尺度模板匹配 |
| 动作 | ocrWords | OCR 全图识字 |
| 动作 | ocrFindStr | OCR 找指定文字 |
| 动作 | click | 坐标点击 |
| 动作 | areaClick | 区域随机点击 |
| 动作 | delay | 延时等待 |
| 数据 | variable | 变量 (local/session/input 三种作用域) |
| 数据 | counter | 计数器 |
| 数据 | math | 数学运算 |

---

## 首页三栏布局

```
┌─ 设备列表 ─┬─ 工作流列表 ─┬─ 操作按钮 (通栏) ──────────┐
│  设备 A    │  ☑ 工作流1   │ [开始] [停止]  已运行 00:05 │
│  设备 B ●  │  ☐ 工作流2   ├─ 实时看板 ─────────────────┤
│            │  ☑ 工作流3   │  [截图 + 识别框/点击波纹]    │
│            │              ├─ 日志滚动区 ────────────────┤
│            │              │  07-10 02:00 [info] ...      │
└────────────┴──────────────┴──────────────────────────────┘
```

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
- [x] 截图压缩 (sharp, 720px max width)
- [x] 实时看板 (截图 + 注解叠加)
- [x] 设备管理 (CRUD + 雷电模拟器集成)
- [x] 三栏布局首页
- [x] 画板调试工具 (框选坐标 + 找图/OCR 测试)
- [x] WebSocket 实时日志/状态推送
- [x] 三层变量作用域 (local/session/input)
- [x] 坐标空间统一 (原始分辨率基准)

## 待实现

- [ ] 工作流持久化运行 (断点续跑)
- [ ] 模板图片独立文件存储 (当前 base64 内嵌 JSON)
- [ ] 定时触发 (cron)
- [ ] 多用户/权限管理
- [ ] 脚本热更新
# 🤖 Automan（奥特曼）自动化任务系统

> 一个基于 **Actor 模型** 的自动化养号 / 游戏任务执行引擎
> 支持多任务并发执行、实时日志回显、任务调度与控制

---

## 📌 1. 项目描述

Automan 是一个面向自动化任务（如游戏养号、副本执行、剧情流程）的后端系统，核心目标是：

* ✅ 支持多任务并发执行（多账号 / 多设备）
* ✅ 每个任务独立运行（Actor 模型）
* ✅ 主线程负责统一调度与设备控制（截图 / 点击 / 弹窗处理）
* ✅ 子任务专注业务逻辑（副本 / 剧情 / 操作流程）
* ✅ 提供 WebSocket 实时通信（前端 UI 可实时查看日志与状态）
* ✅ 支持任务启动 / 停止 / 控制 / 状态回传

---

## 🧠 核心架构设计

```text
               ┌──────────────┐
               │   Frontend UI │
               │ (任务控制面板) │
               └──────┬───────┘
                      │ WebSocket
               ┌──────▼───────┐
               │   WS Gateway  │
               └──────┬───────┘
                      │
               ┌──────▼────────┐
               │ Dispatcher     │
               │ (消息分发层)    │
               └──────┬────────┘
                      │
               ┌──────▼────────┐
               │ ActorManager   │
               │ (任务调度中心)  │
               └──────┬────────┘
                      │
        ┌─────────────▼─────────────┐
        │       Task Actors          │
        │ (每个任务一个独立 Actor)    │
        └─────────────┬─────────────┘
                      │
               ┌──────▼───────┐
               │ Device Layer  │
               │ (截图 / 点击)  │
               └──────────────┘
```

---

## ⚙️ 2. 技术栈

### 🧱 基础框架

* **Fastify**：高性能 Node.js Web 框架
* **TypeScript**：类型安全 + 可维护性
* **ESM（type: module）**

---

### 🔌 核心插件

| 插件                   | 作用            |
| -------------------- | ------------- |
| `@fastify/websocket` | WebSocket 通信  |
| `tsx`                | TS 直接运行（开发环境） |
| `prettier`           | 代码格式化         |

---

### 🧠 架构核心

* **Actor 模型（核心设计）**
* **事件驱动（Event Bus）**
* **任务调度系统（Task Scheduler）**
* **WS 实时通信（日志 / 状态回显）**

---

### 🚀 进阶扩展（后续可接入）

* `worker_threads` → 多线程 Actor
* `child_process` → 多进程隔离
* `bullmq` → 分布式任务队列
* `redis` → 状态共享 / 分布式锁
* `pino` → 高性能日志系统

---

## 📂 项目目录结构

```bash
src/
├── app.ts                # Fastify 应用入口
├── server.ts             # 启动文件
│
├── plugins/              # 插件层
│   ├── ws.ts             # WebSocket 注册
│   ├── logger.ts         # 日志插件
│
├── modules/              # 业务模块
│
│   ├── ws/               # WebSocket模块
│   │   ├── ws.gateway.ts     # 连接管理
│   │   ├── ws.dispatcher.ts  # 消息分发
│   │   ├── ws.types.ts       # 类型定义
│
│   ├── actor/            # Actor系统（核心）
│   │   ├── actor.base.ts     # Actor基类
│   │   ├── task.actor.ts     # 任务Actor
│   │   ├── actor.manager.ts  # Actor调度中心
│
│   ├── task/             # 任务系统
│   │   ├── task.service.ts
│   │   ├── task.controller.ts
│   │   ├── task.types.ts
│
│   ├── device/           # 设备操作层
│   │   ├── device.service.ts # 截图 / 点击
│
├── core/                 # 核心能力
│   ├── event-bus.ts      # 事件总线
│   ├── logger.ts         # 日志封装
│   ├── context.ts        # 全局上下文
│
├── infra/                # 基础设施
│   ├── queue/            # 队列系统
│   ├── storage/          # DB / Redis
│
├── utils/                # 工具函数
│   ├── sleep.ts
│   ├── retry.ts
```

---

## 🔥 核心模块说明

### 1️⃣ Actor 系统（核心）

每个任务是一个独立 Actor：

* 独立执行逻辑
* 独立生命周期
* 可接收控制消息（暂停 / 停止 / 修改行为）

```ts
class TaskActor {
  start()
  stop()
  receive(msg)
}
```

---

### 2️⃣ ActorManager（调度中心）

负责：

* 创建任务
* 管理 Actor 生命周期
* 路由消息到指定 Actor

---

### 3️⃣ WebSocket 通信

采用三层结构：

| 层            | 职责   |
| ------------ | ---- |
| Gateway      | 管理连接 |
| Dispatcher   | 分发消息 |
| ActorManager | 执行业务 |

---

### 4️⃣ Device 层（执行器）

统一封装：

* 截图
* 点击
* UI识别
* 弹窗处理

👉 所有 Actor 不直接操作设备，而是调用 Device

---

## 📡 WS 消息协议（示例）

```json
{
  "type": "task:start",
  "taskId": "123"
}
```

```json
{
  "type": "actor:send",
  "actorId": "123",
  "payload": {}
}
```

---

## ⚠️ 技术要点 & 注意事项

### ❗ 1. 不要把 WS 写在 route 里

必须拆分：

* ws.plugin
* ws.gateway
* ws.dispatcher

否则后期必炸

---

### ❗ 2. Actor 必须“隔离”

不要共享状态：

```ts
❌ 全局变量共享
✅ Actor 内部状态独立
```

---

### ❗ 3. 任务必须可控

必须支持：

* 启动
* 停止
* 暂停（可选）
* 状态查询

---

### ❗ 4. 避免 while(true) 阻塞

必须：

```ts
await sleep()
```

或：

* 使用队列
* 使用调度器

---

### ❗ 5. 日志必须可回传

建议：

* Actor → EventBus → WS → 前端

---

### ❗ 6. 后续必须做的优化

* ✅ 多线程 Actor（worker_threads）
* ✅ 任务隔离（child_process）
* ✅ 崩溃自动重启
* ✅ 分布式支持

---

## 🚀 后续规划

* [ ] Actor 多线程化
* [ ] 任务持久化（数据库）
* [ ] UI 控制台（任务监控面板）
* [ ] 脚本热更新（动态加载任务逻辑）
* [ ] 自动化策略系统（AI决策）

---

## 🧩 总结

Automan 并不是简单的“任务执行器”，而是一个：

> 🎯 **可扩展的自动化控制引擎（Automation Engine）**

核心优势：

* Actor 解耦
* 高并发任务处理
* 实时可观测（WS）
* 易扩展（插件化 / 多进程）

---

## 💬 最后

这个项目如果继续往下做，可以演化成：

* 自动化测试平台
* 云控系统
* RPA 引擎
* 游戏脚本平台

👉 已经不是“小工具”，是**系统级产品**了
