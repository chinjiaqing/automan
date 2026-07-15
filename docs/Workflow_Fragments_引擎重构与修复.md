# Workflow / Fragments 引擎重构与修复

> 本文档对应需求：对 Workflow 执行引擎与 Fragment（片段）系统进行流程审查，并修复 16 项问题。
> 审查报告源文件：`.qoder/plans/Workflow_Fragments_流程审查_98639d47.md`
> 实施日期：2026-07-15

---

## 1. 背景

审查发现引擎存在三类问题：

1. **功能缺陷**：循环体、片段内不支持 `call`（片段调用），链路断裂。
2. **架构问题**：`execute()`、`execLoop()`、`executeFragment()` 三处重复编写每种节点的执行逻辑，新增节点需改 3 个地方，是最大维护风险。
3. **流程闭环/数据引用问题**：删除无引用检查、截图调度器计数脱耦、`resolveRegion` 不传变量等。

本次改造以"统一节点执行入口"为核心，一次性解决架构问题并顺带修复全部功能/闭环缺陷。

---

## 2. 核心重构：统一节点执行入口 `executeNode`

原 `engine.ts` 中 `execute()`、`execLoop()`、`executeFragment()` 各自 `switch(node.type)` 实现节点逻辑，约 3 倍重复代码。

重构后：

```
execute()            ─┐
execLoop()           ─┤ 全部委托给
executeFragment()    ─┘        ↓
                    executeNode(node, ctx, emit, adj, nodeMap, steps, fragmentOutputs?)
```

- `executeNode` 是**唯一**编写节点执行逻辑的地方，新增节点类型只需在其 `switch` 加一个 `case`。
- 返回值统一为 `NodeExecResult.action`：`continue | end | endSuccess | endFail | return | done | error`。
- 上层（`execute` / `execLoop` / `executeFragment`）只根据 `action` 决定控制流，不再关心节点内部细节。

```ts
// engine.ts
private async executeNode(
  node, ctx, emit, adj, nodeMap, steps,
  fragmentOutputs?,          // 片段输出定义，供 return 节点解析返回值
): Promise<NodeExecResult>
```

涉及文件：`server/src/modules/workflow/engine.ts`

---

## 3. 片段（Fragment）调用机制

### 3.1 调用链路（支持任意嵌套）

```
execCall（call 节点）
  ├─ 加载片段定义 fragmentLoader(fragmentId)
  ├─ 递归深度校验（> MAX_CALL_DEPTH=10 报错）
  ├─ 变量/输出隔离（见 3.3 / 3.4）
  └─ executeFragment（片段内部流程）
        └─ executeNode（共用入口）
              ├─ loop  ⇒ execLoop  ⇒ executeNode …（循环体也走统一入口）
              └─ call  ⇒ execCall（片段调用片段，形成递归）
```

由此打通三类原本断裂的链路：

| 链路 | 状态 |
|------|------|
| 循环体 → `call` 片段 | ✅ 已支持 |
| 片段 → `call` 其它片段（嵌套） | ✅ 已支持 |
| 片段 → `loop` → `call` 片段 | ✅ 已支持 |

### 3.2 `return` 节点（含嵌套在 loop 内）

- 片段内 `return` 节点通过 `ctx.inFragment` 识别。
- `executeNode` 的 `return` 分支在 **return 节点处**直接计算 `returnValues`（依赖透传的 `fragmentOutputs`）。
- 当 `return` 嵌套在 `loop` 体内被触发时，返回值随 `action: 'return'` 向上透传，`executeFragment` 优先使用透传的 `result.returnValues`，**不会**因当前 `innerNode` 变成 loop 节点而丢失输出。

> 这是本次修复的一个回归点：重构初期 `executeNode` 的 `return` 分支未携带 `returnValues`，导致"loop 内 return"返回值丢失，已修正。

### 3.3 输出隔离（防 ID 碰撞）

`execCall` 执行片段期间使用**独立的** `ctx.outputs`：

```ts
const savedOutputs = { ...ctx.outputs }
ctx.outputs = {}              // 片段内部节点写入独立空间
const execResult = await this.executeFragment(...)
ctx.outputs = savedOutputs   // 恢复父级
ctx.outputs[callNode.id] = execResult.returnValues ?? {}  // 仅 call 节点结果合并回父级
```

片段内部节点 ID 即使与父工作流相同也不会污染父级数据。

### 3.4 变量隔离

```ts
const savedVars = { ...ctx.variables }   // 浅拷贝
// 注入片段声明：outputs 默认值 + inputs 实参（从父级 savedOutputs/savedVars 解析）
ctx.inFragment = true
...
ctx.variables = savedVars    // 恢复
ctx.inFragment = savedInFragment
```

- 当前变量均为基本类型（number/string），浅拷贝安全。
- 若未来支持对象/数组引用，需升级为深拷贝或不可变更新。

### 3.5 递归深度保护

```ts
const callDepth = (ctx.callDepth ?? 0) + 1
if (callDepth > MAX_CALL_DEPTH) return error('调用深度超过上限，可能存在循环引用')
ctx.callDepth = callDepth
```

`MAX_CALL_DEPTH = 10`，防止片段 A→B→A 无限递归（原先仅靠 `MAX_GLOBAL_STEPS = 5000` 兜底）。

---

## 4. 16 项问题修复对照

| 编号 | 问题 | 修复方式 | 状态 |
|------|------|----------|------|
| #1 | 循环体不支持 `call` | `execLoop` 改用 `executeNode`（含 `call` case） | ✅ |
| #2 | 循环体 `endSuccess`/`endFail` 语义丢失 | 统一向上传播为工作流成功/失败返回（原"静默跳过"bug 已修） | ✅ |
| #3 | 片段不支持嵌套 `call` | `execCall → executeFragment → executeNode → execCall` 递归 | ✅ |
| #4 | 片段内 `loop`+`call` 断裂 | 由 #1+#3 自然满足 | ✅ |
| #5 | `resolveRegion` 不传 `variables` | findPic/ocrWords/ocrFindStr/areaClick/swipe 均改为 `resolveRegion(val, ctx.outputs, ctx.variables)` | ✅ |
| #6 | 片段 outputs 写入共享 `ctx.outputs` | `execCall` 内独立 `ctx.outputs`，结束后合并 | ✅ |
| #7 | 变量隔离浅拷贝 | 基本类型安全，已备注未来需深拷贝 | ⚠️ 可接受 |
| #8 | 无片段递归检测 | `MAX_CALL_DEPTH` + `ctx.callDepth` | ✅ |
| #9 | 删除片段无引用检查 | `fragment.routes.ts` 删除前扫描所有 workflow/fragment 的 `call` 节点，返回 `FRAGMENT_IN_USE` | ✅ |
| #10 | 删除工作流无运行中检查 | `workflow.routes.ts` 删除前 `listRuns()` 检测，返回 `WORKFLOW_RUNNING` | ✅ |
| #11 | 节点执行逻辑三处重复 | 抽取 `executeNode()` 统一入口 | ✅ |
| #12 | `category` 不含 `'fragment'` | `shared/types.ts` 联合类型加入 `'fragment'`；`nodeTypes.ts` 中 `call`/`return` 改 `category: 'fragment'` | ✅ |
| #13 | 截图调度器计数脱耦 | 新增 `forceStop()`；`syncDispatcher` 改用 `pause/resume/forceStop`，不再依赖 `stop()` 减计数 | ✅ |
| #14 | `resolveConfig` 死代码 | 已移除，全局无引用 | ✅ |
| #15 | 前端解析器不对齐 | `web/src/flow/refResolver.ts` 现支持 `{{var:name}}`、`{{scope.name}}`、内嵌引用 | ✅ |
| #16 | `endSuccess`/`endFail` 在 loop 内应区分处理 | 见 #2，已正确向上传播 | ✅ |

---

## 5. 路由守卫（删除安全）

### 5.1 删除片段前检查引用

`server/src/routes/fragment.routes.ts` 的 `/api/fragments/:id/delete`：

- 扫描**所有工作流** nodes：是否存在 `type==='call' && config.fragmentId===id`
- 扫描**所有其它片段** nodes：同上
- 命中则拒绝删除，返回 `code: 'FRAGMENT_IN_USE'`，并列出引用方名称（如「工作流『xxx』」「片段『yyy』」）

### 5.2 删除工作流前检查运行中

`server/src/routes/workflow.routes.ts` 的 `/api/workflows/:id/delete`：

- 通过 `workflowService.listRuns()` 检查该 workflow 是否正在运行
- 运行中则拒绝删除，返回 `code: 'WORKFLOW_RUNNING'`

---

## 6. 截图调度器计数修复

`ScreenshotDispatcher` 新增 `forceStop(deviceId)`：无视订阅计数，直接 `clearInterval` 并删除 entry。

`WorkflowService.syncDispatcher` 改为：

- 需要截图 → `dispatcher.resume(deviceId)`
- 不需要截图 → `dispatcher.pause(deviceId)`
- **不再调用 `stop()` 减计数**，`start()` 的订阅计数仅用于显式 `stopWorkflow` 路径

避免了 `syncDispatcher` 多次触发导致 `start()/stop()` 计数失准、调度器提前停止或无法停止的问题。

> ⚠️ 2026-07-15 修订：本节初版的 `syncDispatcher` 会在"全部 actor completed/cancelled"时执行 `forceStop(deviceId)` + `session.destroy()` + `cronManager.unregister()`，导致定时 workflow 达标后误杀设备级会话与兄弟定时 job（详见第 9 节）。现已改为"设备级常驻，仅 pause 截图"。

---

## 7. 变量引用解析

`resolveValue`（`server/src/modules/workflow/refResolver.ts`）支持的格式：

| 格式 | 解析目标 | 示例 |
|------|----------|------|
| `{{nodeId.key}}` | 节点输出 `outputs[nodeId][key]` | `{{findPic_1.matchX}}` |
| `{{var:name}}` | 变量池 `variables[name]` | `{{var:detectCount}}` |
| `{{scope.name}}` | 变量池 `variables[name]`（scope 仅语义前缀） | `{{session.detectCount}}` |
| `{{a}} + {{b}}` | 内嵌引用 + 算术求值 | `"{{x}} + 100"` → 数字 |

前端 `web/src/flow/refResolver.ts` 已补齐 `{{var:name}}` / `{{scope.name}}` / 内嵌引用解析，与后端对齐（前端暂不实现算术求值，仅影响预览显示）。

---

## 9. 设备级生命周期与定时触发解耦（2026-07-15）

### 9.1 复现的 Bug

单设备 + 单脚本，定时模式设两个时间点（如 14:53 / 14:54），完成条件均为"成功 1 次后停止"。当 14:53 达标后：该任务标记完成 → **设备级任务被自动结束 → 14:54 定时被销毁 → 设备会话被销毁**。

### 9.2 根因

`syncDispatcher` 的"全部 actor completed/cancelled"分支执行了整套拆除：`cronManager.unregister(deviceId, workflowId)` 会按 `deviceId:workflowId` 整组删除**同一 workflow 的全部定时 job（含 14:54）**；`dispatcher.forceStop()` 端掉截图循环；`session.destroy()` 销毁设备会话；`actors.delete()` 删除 actor。这与"cron 生命周期由设备级 start/stop 控制、completed 不触发销毁"的设计注释自相矛盾。

### 9.3 需求重定义

1. **设备级任务常驻**：无激活 workflow 时，截图循环 entry 与设备会话保留，仅**暂停截图识别**（`pause`），不销毁。设备级只由显式 `stopWorkflow` / `stopByDevice` 释放。
2. **定时 = 触发器 + 初始化器**：定时点到达 = 将 workflow 从"未激活"变为"激活"，并**重置初始参数**（计数清零、取消标记清除、`session` 变量清空、`input`/`local` 变量复位）。多个定时点互不叠加。
3. **cron 每天重复、持久**：`cron.manager` 表达式本就是 `${minute} ${hour} * * *`（每天 HH:MM），不应被自动清除。

### 9.4 修复方案

引入新的 `FlowState = 'inactive'`（未激活 / 等待定时），明确区分"达标真停（`completed`，立即模式）"与"达标回等待（`inactive`，定时模式）"两种语义：

| 文件 | 改动 |
|------|------|
| `shared/src/types.ts` | `FlowState` 新增 `'inactive'` |
| `workflow.actor.ts` | 定时模式启动即 `inactive`；`markPending` 统一"唤醒 + 重置"（`busy` 时跳过，不叠加）；`processResult` 达标后**定时模式回 `inactive`、立即模式才 `completed`**；`onScreenshot` 跳过 `inactive`；新增 `needsScreenshot()`；`emitFlowState` 映射 `inactive → 'idle'` |
| `service.ts` | `syncDispatcher` 重写为"设备级常驻"：仅 `dispatcher.pause(deviceId)`，**移除** `forceStop` / `session.destroy` / `cronManager.unregister` / `actors.delete`；截图判断改用 `actor.needsScreenshot()` |
| `web/src/components/WorkflowListPanel.vue` | `flowStateLabel`/`flowStateClass` 补 `inactive: '等待定时'` |

状态机（定时模式）：

```
inactive ──(定时到达: 重置+唤醒)──> pending ──(截图)──> processing
   ▲                                                        │
   └──────────(达标: 回未激活, 等下次定时)──────────────────┘
                      (未达标: autoPending → pending)
```

- 用户主动停止（`stopWorkflow`）路径不变：仍 `cronManager.unregister` + `session.destroy`，符合"用户结束就释放设备"预期。
- `session` 变量因仅绑定当前 actor（`device+workflow` 唯一实例），故每次定时唤醒随之清空，实现"每次全新激活"。

### 9.5 附带修复

`server/src/db/index.ts`：显式标注 `export const sqlite: DatabaseType`，修复 `declaration: true` 下 `better-sqlite3` 类型无法命名的 TS4023（既有问题，本次顺带清零 server 类型检查）。

---

## 10. 已知遗留 / 后续

1. **UI 编辑器已开放片段内 `call`/`return`**（2026-07-15 补充）：
   - `FragmentView.vue` 的 `:exclude-types` 改为仅排除工作流级结束节点 `['end','endSuccess','endFail']`，`call`/`return` 已可拖入。
   - 节点类型映射补充 `call: ActionNode`、`return: EndNode`；`ConfigPanel` 新增 `:fragment-outputs` 支撑 `return` 表单，复用既有 `:fragments` 支撑 `call` 的片段选择与 `arg_*` 传参。
   - 配套文档见 `docs/开发前必读.md` §20.8。
2. **变量浅拷贝**：仅基本类型安全，未来支持复杂变量需升级隔离策略（#7）。
3. **前端算术求值**：后端 `resolveValue` 支持内嵌算术，前端 `resolveRefs` 暂不支持（#15 残留，P3）。
