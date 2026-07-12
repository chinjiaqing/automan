import { ref, readonly } from 'vue'
import type { WsMessage } from '@automan/shared/types.js'
import { setApiBase } from '../api/index.js'

/** localStorage 缓存键 */
const CACHE_KEY = 'automan_server'

/** 连接状态 */
type ConnectionState = 'disconnected' | 'connecting' | 'connected'

const state = ref<ConnectionState>('disconnected')
const clientId = ref('')
let ws: WebSocket | null = null
let pingTimer: ReturnType<typeof setInterval> | null = null

/** 重连 Promise，避免并发多次重连 */
let reconnectPromise: Promise<boolean> | null = null

/** 消息回调注册表 */
const listeners = new Map<string, Set<(payload: unknown) => void>>()

function clearPing() {
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = null
  }
}

function startPing() {
  clearPing()
  pingTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))
    }
  }, 15000)
}

/**
 * 全局 WebSocket 单例 composable
 * WS 连接 = 登录，断开 = 自动退出到登录页
 */
export function useWebSocket() {
  function connect(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (ws?.readyState === WebSocket.OPEN) {
        resolve()
        return
      }

      state.value = 'connecting'
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const url = `${protocol}//${host}:${port}/ws`

      // 同步设置 HTTP API base URL
      setApiBase(`${location.protocol}//${host}:${port}`)

      ws = new WebSocket(url)

      ws.onopen = () => {
        state.value = 'connected'
        startPing()
        resolve()
      }

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: WsMessage = JSON.parse(event.data)
          if (msg.type === 'connected' && msg.payload) {
            const p = msg.payload as { clientId: string }
            clientId.value = p.clientId
          }
          // 分发给注册的监听器
          const cbs = listeners.get(msg.type)
          if (cbs) {
            cbs.forEach((cb) => cb(msg.payload))
          }
          // 通配符
          const anyCbs = listeners.get('*')
          if (anyCbs) {
            anyCbs.forEach((cb) => cb(msg))
          }
        } catch {
          // ignore parse errors
        }
      }

      ws.onclose = () => {
        state.value = 'disconnected'
        clientId.value = ''
        clearPing()
        ws = null
      }

      ws.onerror = () => {
        state.value = 'disconnected'
        clearPing()
        ws = null
        reject(new Error('WebSocket 连接失败'))
      }
    })
  }

  function disconnect() {
    clearPing()
    ws?.close()
    ws = null
    state.value = 'disconnected'
    clientId.value = ''
  }

  function send(type: string, payload?: unknown) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload, timestamp: Date.now() }))
    }
  }

  function on(type: string, cb: (payload: unknown) => void) {
    if (!listeners.has(type)) {
      listeners.set(type, new Set())
    }
    listeners.get(type)!.add(cb)
  }

  function off(type: string, cb: (payload: unknown) => void) {
    listeners.get(type)?.delete(cb)
  }

  /**
   * 从 localStorage 缓存尝试重连
   * 返回 true = 重连成功，false = 无缓存或失败
   * 并发调用复用同一个 Promise
   */
  function reconnectFromCache(): Promise<boolean> {
    if (reconnectPromise) return reconnectPromise

    reconnectPromise = (async () => {
      try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return false

        const { host, port } = JSON.parse(raw) as { host: string; port: number }
        if (!host || !port) return false

        // 超时 3 秒
        const timeout = new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('reconnect timeout')), 3000),
        )
        await Promise.race([connect(host, port), timeout])
        return true
      } catch {
        state.value = 'disconnected'
        return false
      } finally {
        reconnectPromise = null
      }
    })()

    return reconnectPromise
  }

  return {
    state: readonly(state),
    clientId: readonly(clientId),
    connect,
    disconnect,
    reconnectFromCache,
    send,
    on,
    off,
  }
}
