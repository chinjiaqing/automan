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

  // 工作流执行
  WORKFLOW_STARTED = 'workflow:started',
  WORKFLOW_STOPPED = 'workflow:stopped',
  WORKFLOW_STATUS = 'workflow:status',
  WORKFLOW_VISUAL = 'workflow:visual',
  DEVICE_SCREENSHOT = 'device:screenshot',
  DEVICE_LOG = 'device:log',
  /** 设备运行状态变更 */
  DEVICE_RUN_STATUS = 'device:run-status',
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
  /** 原始设备分辨率（供 ADB 操作使用） */
  originalWidth: number
  originalHeight: number
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

// ─────────────────────────────────────────────
// 找图 Pro（SIFT + FLANN + RANSAC）
// ─────────────────────────────────────────────

/** 找图 Pro 请求 */
export interface FindPicProRequest {
  image: string
  template: string
  threshold?: number
  maxResults?: number
  region?: [number, number, number, number]
  /** 多尺度缩放列表（兗底时使用） */
  scales?: number[]
  /** SIFT 最少特征点数，默认 4 */
  minFeatures?: number
}

/** 找图 Pro 单个匹配结果 */
export interface FindPicProMatch {
  x: number
  y: number
  confidence: number
  /** 匹配方法：sift | multiscale */
  method: string
}

/** 找图 Pro 响应 */
export interface FindPicProResponse {
  matches: FindPicProMatch[]
  elapsed: number
  /** 实际使用的匹配方法 */
  method: string
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
  /** 颜色偏差 0-100，默认 50。值越大容差越宽 */
  colorTolerance?: number
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
  /** 颜色偏差 0-100，默认 50。值越大容差越宽 */
  colorTolerance?: number
}

/** findStr 响应 */
export interface FindStrResponse {
  matches: OcrMatch[]
  allWords: string[]
  elapsed: number
}

// ─────────────────────────────────────────
// ADB 点击
// ─────────────────────────────────────────

/** 单点点击请求 */
export interface AdbClickRequest {
  deviceId: string
  point: [number, number]
}

/** 范围随机点击请求 */
export interface AdbAreaClickRequest {
  deviceId: string
  region: [number, number, number, number]
}

/** 点击响应 */
export interface AdbClickResponse {
  x: number
  y: number
  elapsed: number
}

// ─────────────────────────────────────────
// Workflow 工作流
// ─────────────────────────────────────────

/** 字段 schema（渲染右侧配置面板表单） */
export interface FieldSchema {
  key: string
  label: string
  type: 'text' | 'number' | 'select' | 'slider' | 'image-upload' | 'coord-input' | 'data-ref' | 'data-input' | 'data-source'
  default?: unknown
  options?: string[]
  min?: number
  max?: number
  placeholder?: string
  showWhen?: Record<string, string>
}

/** 输出端口 */
export interface OutputPort {
  key: string
  label: string
  dataType: 'string' | 'number' | 'boolean' | 'coord'
}

/** 输入端口 */
export interface InputPort {
  key: string
  label: string
  dataType: 'string' | 'number' | 'boolean' | 'coord'
  optional?: boolean
}

/** 节点类型定义 */
export interface NodeTypeDefinition {
  type: string
  category: 'flow' | 'action' | 'data' | 'app'
  label: string
  icon: string
  configSchema: FieldSchema[]
  outputs: OutputPort[]
  inputs: InputPort[]
  exitCount: number
}

/** 工作流节点 */
export interface WorkflowNode {
  id: string
  type: string
  label: string
  position: { x: number; y: number }
  config: Record<string, unknown>
}

/** 工作流边 */
export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
}

/** 工作流 */
export interface Workflow {
  id: string
  name: string
  deviceId?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  createdAt: number
  updatedAt: number
}

/** 创建工作流请求 */
export interface CreateWorkflowRequest {
  name: string
  deviceId?: string
}

/** 保存工作流请求 */
export interface SaveWorkflowRequest {
  /** 工作流名称（可选，传入则同时更新名称） */
  name?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

// ─────────────────────────────────────────
// 工作流运行
// ─────────────────────────────────────────

/** 工作流执行状态 */
export enum WorkflowRunState {
  IDLE = 'idle',
  RUNNING = 'running',
  ERROR = 'error',
  STOPPED = 'stopped',
}

/** 启动工作流请求 */
export interface RunWorkflowRequest {
  deviceId: string
  workflowId: string
  /** 截图间隔毫秒，默认 2000 */
  screenshotInterval?: number
}

/** 停止工作流请求 */
export interface StopWorkflowRequest {
  runId: string
}

/** 工作流运行实例信息 */
export interface WorkflowRunInfo {
  runId: string
  workflowId: string
  deviceId: string
  state: WorkflowRunState
  createdAt: number
  /** 已执行次数 */
  executionCount: number
  /** 上次截图时间 */
  lastScreenshotAt?: number
}

/** 工作流状态变更推送 */
export interface WorkflowStatusPayload {
  runId: string
  workflowId: string
  deviceId: string
  state: WorkflowRunState
  executionCount: number
  /** 当前执行的节点类型（可选） */
  currentNodeType?: string
}

// ─────────────────────────────────────────
// 工作流可视化注解
// ─────────────────────────────────────────

/** 注解类型枚举 */
export type VisualAnnotationType = 'bbox' | 'click' | 'area' | 'text'

/** 通用视觉注解 */
export interface VisualAnnotation {
  type: VisualAnnotationType
  nodeId: string
  label: string
  /** 原始坐标空间下的数据 */
  data: Record<string, unknown>
  /** 工作流 ID（用于区分多工作流叠加） */
  workflowId: string
  workflowName: string
}

/** 设备截图推送负载 */
export interface DeviceScreenshotPayload {
  deviceId: string
  image: string // data:image/png;base64,...
  width: number
  height: number
  originalWidth: number
  originalHeight: number
  timestamp: number
}

/** 设备级日志推送负载 */
export interface DeviceLogPayload {
  deviceId: string
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp: number
}

/** 工作流可视化推送负载 */
export interface WorkflowVisualPayload {
  deviceId: string
  screenshot: string // data:image/png;base64,...
  screenshotWidth: number
  screenshotHeight: number
  originalWidth: number
  originalHeight: number
  annotations: VisualAnnotation[]
  executionCount: number
  timestamp: number
}

// ─────────────────────────────────────────
// 批量启动工作流
// ─────────────────────────────────────────

/** 批量启动工作流请求（单次 HTTP，设备级 ensureReady 一次） */
export interface BatchRunWorkflowRequest {
  deviceId: string
  workflowIds: string[]
  /** 截图间隔毫秒，默认 2000 */
  screenshotInterval?: number
}

/** 批量启动中单个结果 */
export interface BatchRunItem {
  workflowId: string
  workflowName?: string
  /** 成功时为 runId，失败时为 null */
  runId: string | null
  success: boolean
  /** 失败时的错误信息 */
  error?: string
}

/** 批量启动响应 */
export interface BatchRunWorkflowResponse {
  deviceId: string
  items: BatchRunItem[]
}

// ─────────────────────────────────────────
// 设备工作流勾选快照
// ─────────────────────────────────────────

/** 保存勾选快照请求 */
export interface SaveCheckedWorkflowsRequest {
  deviceId: string
  workflowIds: string[]
}

/** 查询勾选快照响应 */
export interface CheckedWorkflowsSnapshot {
  deviceId: string
  workflowIds: string[]
  updatedAt: number
}

// ─────────────────────────────────────────
// 设备运行状态（区别于 DeviceStatus 的模拟器进程状态）
// ─────────────────────────────────────────

/** 设备运行状态枚举 */
export enum DeviceRunStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  ERROR = 'error',
}

/** 单个设备的运行状态信息 */
export interface DeviceRunStatusInfo {
  deviceId: string
  status: DeviceRunStatus
  /** 当前运行的工作流数量 */
  activeWorkflowCount: number
  /** 运行中的 runId 列表 */
  runIds: string[]
  /** 最近一次状态变更时间 */
  updatedAt: number
}

/** 设备运行状态变更 WS 推送 payload */
export interface DeviceRunStatusPayload {
  deviceId: string
  status: DeviceRunStatus
  activeWorkflowCount: number
  runIds: string[]
  updatedAt: number
}
