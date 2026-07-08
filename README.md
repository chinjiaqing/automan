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
