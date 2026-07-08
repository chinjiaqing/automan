// ─────────────────────────────────────────────
// WebSocket 消息协议类型（前后端共用）
// ─────────────────────────────────────────────

/** 所有 WS 消息类型枚举 */
export enum WsMessageType {
  // 连接层
  PING = 'ping',
  PONG = 'pong',
  CONNECTED = 'connected',

  // 任务控制
  TASK_START = 'task:start',
  TASK_STOP = 'task:stop',
  TASK_LIST = 'task:list',
  TASK_STATUS = 'task:status',

  // Actor 通信
  ACTOR_SEND = 'actor:send',
  ACTOR_LOG = 'actor:log',
  ACTOR_STATE = 'actor:state',

  // 系统级
  ERROR = 'error',
}

/** WS 消息基础结构 */
export interface WsMessage {
  type: WsMessageType | string
  payload?: unknown
  timestamp: number
}

/** 连接确认消息 */
export interface WsConnectedPayload {
  clientId: string
  serverTime: number
}

/** 任务启动请求 */
export interface TaskStartPayload {
  taskId?: string
  taskType: string
  deviceId?: string
  params?: Record<string, unknown>
}

/** 任务停止请求 */
export interface TaskStopPayload {
  taskId: string
}

/** 任务状态 */
export interface TaskStatusPayload {
  taskId: string
  state: TaskState
  actorId: string
}

/** Actor 日志推送 */
export interface ActorLogPayload {
  actorId: string
  level: string
  message: string
}

/** Actor 状态变更推送 */
export interface ActorStatePayload {
  actorId: string
  state: ActorState
}

/** 错误消息 */
export interface ErrorPayload {
  code: string
  message: string
}

// ─────────────────────────────────────────────
// Actor / Task 状态枚举
// ─────────────────────────────────────────────

export enum ActorState {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERROR = 'error',
}

export enum TaskState {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  STOPPED = 'stopped',
}

// ─────────────────────────────────────────────
// 任务相关类型
// ─────────────────────────────────────────────

export interface TaskConfig {
  taskId: string
  taskType: string
  deviceId?: string
  params?: Record<string, unknown>
}

export interface TaskInfo {
  taskId: string
  taskType: string
  state: TaskState
  actorId: string
  deviceId?: string
  createdAt: number
}

// ─────────────────────────────────────────────
// Device 设备相关类型
// ─────────────────────────────────────────────

/** 设备状态枚举 */
export enum DeviceState {
  OFFLINE = 'offline',
  ONLINE = 'online',
  BUSY = 'busy',
  ERROR = 'error',
}

/** 设备绑定请求参数 */
export interface DeviceBindRequest {
  name: string
  ldconsolePath: string
  instanceIndex: number
}

/** 设备信息 */
export interface DeviceInfo {
  id: string
  name: string
  ldconsolePath: string
  instanceIndex: number
  state: DeviceState
  boundAt: number
}

/** ldconsole list2 解析后的实例信息 */
export interface LDInstanceInfo {
  index: number
  name: string
  topHandle: number
  boxHandle: number
  running: boolean
  pid: number
}
