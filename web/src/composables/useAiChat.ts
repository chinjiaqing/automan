// ─────────────────────────────────────────────
// AI 聊天 composable
// 职责：管理 LLM 配置、聊天历史、流式对话
// 系统提示词由后端构建（含最新节点信息），前端只传 currentFlow
// ─────────────────────────────────────────────

import { ref, computed } from 'vue'
import { getApiBase } from '../api/index.js'
import type { WorkflowNode, WorkflowEdge } from '@automan/shared/types.js'

// ── LLM 配置（localStorage 持久化）─────────────
const STORAGE_KEY = 'automan_llm_config'
const CHAT_CACHE_KEY = 'automan_ai_chat_cache'

export interface LlmConfig {
  apiUrl: string
  apiKey: string
  model: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  /** 是否正在流式输出 */
  streaming?: boolean
}

function loadConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { apiUrl: '', apiKey: '', model: '' }
}

function saveConfig(cfg: LlmConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

/** 缓存最近 3 条聊天记录 */
function loadChatCache(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_CACHE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return []
}

function saveChatCache(msgs: ChatMessage[]) {
  // 只缓存最近 3 条非 system 消息
  const filtered = msgs.filter((m) => m.role !== 'system')
  const cache = filtered.slice(-3).map((m) => ({ ...m, streaming: false }))
  localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(cache))
}

// ── composable ──────────────────────────────────
export function useAiChat() {
  const config = ref<LlmConfig>(loadConfig())
  const messages = ref<ChatMessage[]>(loadChatCache())
  const isStreaming = ref(false)
  const error = ref('')

  const isConfigured = computed(() => !!config.value.apiUrl && !!config.value.apiKey && !!config.value.model)

  function updateConfig(cfg: Partial<LlmConfig>) {
    config.value = { ...config.value, ...cfg }
    saveConfig(config.value)
  }

  /** 发送消息并获取流式回复 */
  async function send(
    userMessage: string,
    currentNodes: WorkflowNode[],
    currentEdges: WorkflowEdge[],
  ): Promise<string | null> {
    if (!isConfigured.value) {
      error.value = '请先配置 LLM API'
      return null
    }

    error.value = ''

    // 添加用户消息
    messages.value.push({ role: 'user', content: userMessage })

    // 构建发给 API 的消息列表（系统提示词由后端注入）
    const apiMessages: ChatMessage[] = messages.value.filter((m) => m.role !== 'system')

    // 添加占位 assistant 消息
    const assistantMsg: ChatMessage = { role: 'assistant', content: '', streaming: true }
    messages.value.push(assistantMsg)
    isStreaming.value = true

    try {
      const baseUrl = getApiBase()
      const res = await fetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          config: config.value,
          currentFlow: { nodes: currentNodes, edges: currentEdges },
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`API 错误 (${res.status}): ${errText}`)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') continue

          try {
            const json = JSON.parse(data)
            if (json.content) {
              fullContent += json.content
              assistantMsg.content = fullContent
            }
          } catch { /* skip */ }
        }
      }

      assistantMsg.streaming = false
      isStreaming.value = false
      saveChatCache(messages.value)
      return fullContent
    } catch (err) {
      assistantMsg.streaming = false
      isStreaming.value = false
      error.value = err instanceof Error ? err.message : '请求失败'
      return null
    }
  }

  function clearChat() {
    messages.value = []
    error.value = ''
    localStorage.removeItem(CHAT_CACHE_KEY)
  }

  return {
    config,
    messages,
    isStreaming,
    error,
    isConfigured,
    updateConfig,
    send,
    clearChat,
  }
}
