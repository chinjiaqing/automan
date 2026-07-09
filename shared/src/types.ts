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
// 统一 HTTP API 请求 / 响应格式
// ─────────────────────────────────────────────

/** 统一成功响应 */
export interface ApiResponse<T = unknown> {
  success: true
  data: T
}

/** 统一错误响应 */
export interface ApiError {
  success: false
  code: string
  message: string
}

/** 统一响应类型 */
export type ApiResult<T = unknown> = ApiResponse<T> | ApiError

/** 创建设备请求 */
export interface CreateDeviceRequest {
  name: string
  ldconsolePath: string
  instanceIndex: number
}

/** 删除设备请求 */
export interface DeleteDeviceRequest {
  id: string
}

// ─────────────────────────────────────────────
// Device 设备相关类型
// ─────────────────────────────────────────────

/** 设备状态枚举（仅两种） */
export enum DeviceStatus {
  RUNNING = 'running',
  STOPPED = 'stopped',
}

/** 设备信息（与 devices 表对齐） */
export interface DeviceInfo {
  id: string
  name: string
  ldconsolePath: string
  instanceIndex: number
  status: DeviceStatus
  createdAt: number
  updatedAt: number
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

// ─────────────────────────────────────────────
// 文件系统浏览
// ─────────────────────────────────────────────

/** 文件/目录条目 */
export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
}

/** 文件系统浏览响应 */
export interface BrowseResponse {
  currentPath: string
  parentPath: string | null
  entries: FileEntry[]
}

/** 实例查询请求 */
export interface ListInstancesRequest {
  ldconsolePath: string
}

// ─────────────────────────────────────────────
// 截屏
// ─────────────────────────────────────────────

/** 截屏请求 */
export interface ScreenshotRequest {
  deviceId: string
}

/** 截屏响应（PNG base64） */
export interface ScreenshotResponse {
  image: string // data:image/png;base64,...
  width: number
  height: number
  timestamp: number
}

// ─────────────────────────────────────────────
// 找图（模板匹配）
// ─────────────────────────────────────────────

/** 找图请求 */
export interface FindPicRequest {
  /** 截图 base64（data:image/png;base64,...） */
  image: string
  /** 模板图片 base64（data:image/png;base64,...） */
  template: string
  /** 相似度阈值 0-1，默认 0.8 */
  threshold?: number
  /** 最大匹配数量，默认 10 */
  maxResults?: number
  /** 找图区域 [x1, y1, x2, y2]，全为 0 或不传表示全图 */
  region?: [number, number, number, number]
}

/** 单个匹配结果 */
export interface FindPicMatch {
  x: number
  y: number
  confidence: number
}

/** 找图响应 */
export interface FindPicResponse {
  matches: FindPicMatch[]
  elapsed: number
}

// ─────────────────────────────────────────
// OCR（文字识别）
// ─────────────────────────────────────────

/** 预设颜色名称 */
export type OcrColor =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'blue'
  | 'purple'
  | 'white'
  | 'black'
  | 'gray'

/** OCR 识别到的单个文字块 */
export interface OcrWord {
  text: string
  x: number
  y: number
  w: number
  h: number
  confidence: number
}

/** getWords 请求 */
export interface GetWordsRequest {
  image: string
  region?: [number, number, number, number]
  color?: OcrColor
}

/** getWords 响应 */
export interface GetWordsResponse {
  words: OcrWord[]
  elapsed: number
}

/** findStr 匹配结果 */
export interface OcrMatch extends OcrWord {
  similarity: number
}

/** findStr 请求 */
export interface FindStrRequest {
  image: string
  target: string
  region?: [number, number, number, number]
  similarity?: number
  color?: OcrColor
}

/** findStr 响应 */
export interface FindStrResponse {
  matches: OcrMatch[]
  allWords: string[]
  elapsed: number
}
