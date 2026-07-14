// ─────────────────────────────────────────────
// AI 聊天 composable
// 职责：管理 LLM 配置、聊天历史、流式对话
// ─────────────────────────────────────────────

import { ref, computed } from 'vue'
import { getApiBase } from '../api/index.js'
import { allNodeTypes } from '../flow/nodeTypes.js'
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

// ── 系统提示词构建 ──────────────────────────────
function buildSystemPrompt(currentNodes: WorkflowNode[], currentEdges: WorkflowEdge[]): string {
  const nodeTypeDocs = allNodeTypes.map((n) => {
    const outputs = n.outputs.map((o) => `${o.key}(${o.dataType})`).join(', ')
    const configs = n.configSchema.map((c) => c.key).join(', ')
    return `- ${n.type}(${n.label}): 分类=${n.category}, 输出=[${outputs}], 参数=[${configs}]`
  }).join('\n')

  const currentFlow = JSON.stringify({ nodes: currentNodes, edges: currentEdges }, null, 2)

  return `你是一个工作流编排助手。你可以用自然语言帮用户生成或修改自动化工作流。

## 可用节点类型
${nodeTypeDocs}

## 工作流 JSON 格式
工作流由 nodes 和 edges 组成：
- node: { id: string, type: string, label: string, position: {x, y}, config: {} }
- edge: { id: string, source: string, target: string, sourceHandle?: string }
  - sourceHandle: 条件节点/循环节点用 "true"/"false"/"body"/"exit" 表示分支出口

## 当前工作流数据
${currentFlow}

## 规则
1. 用户描述需求时，生成完整的工作流 JSON
2. 每个节点 id 必须唯一，格式如 start_1, click_2, findPic_3 等
3. start 节点必须有且只有一个
4. 所有节点通过 edges 连接，形成完整流程
5. config 中的参数使用默认值或用户提供的值，用户未提供且无法推断的必填参数用 "TODO_参数名" 占位
6. 如果用户要求修改已有工作流，基于当前数据修改后输出完整的新 JSON
7. 输出格式必须严格遵守: {"nodes": [...], "edges": [...]}

## 重要：输出格式要求
- 你的回复必须包含一个完整的 JSON 对象，格式为 {"nodes": [...], "edges": [...]}
- JSON 放在 \`\`\`json 和 \`\`\` 代码块中
- 可以在代码块前后添加简要说明，但代码块内的 JSON 必须完整且可解析
- 每个节点的 position 要合理分布，避免重叠（建议水平间距 200，垂直间距 120）
- edge 的 id 格式为 e_source_target，如 e_start_1_click_2`
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

    // 构建带上下文的系统提示
    const systemPrompt = buildSystemPrompt(currentNodes, currentEdges)

    // 构建发给 API 的消息列表
    const apiMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages.value.filter((m) => m.role !== 'system'),
    ]

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
