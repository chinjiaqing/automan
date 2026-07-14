// ─────────────────────────────────────────────
// AI 路由模块
// 职责：LLM API 代理（流式输出）+ 后端构建系统提示词
// ─────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import { allNodeTypes } from '@automan/shared/nodeTypes.js'
import type { NodeTypeDefinition, FieldSchema } from '@automan/shared/types.js'

/** LLM 消息 */
interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 当前画布数据 */
interface CurrentFlow {
  nodes: unknown[]
  edges: unknown[]
}

/** 请求体 */
interface AiChatRequest {
  messages: LlmMessage[]
  config: {
    apiUrl: string
    apiKey: string
    model: string
  }
  currentFlow?: CurrentFlow
}

// ── 系统提示词构建 ──────────────────────────────

function formatFieldSchema(fields: FieldSchema[]): string {
  if (!fields.length) return '（无）'
  return fields.map((c) => {
    const parts = [`${c.key}: ${c.type}`]
    if (c.label) parts.push(`label="${c.label}"`)
    if (c.options?.length) parts.push(`options=[${c.options.join(',')}]`)
    if (c.default !== undefined) parts.push(`default=${JSON.stringify(c.default)}`)
    if (c.showWhen) parts.push(`showWhen=${JSON.stringify(c.showWhen)}`)
    if (c.placeholder) parts.push(`placeholder="${c.placeholder}"`)
    return parts.join(', ')
  }).join('\n      ')
}

function buildSystemPrompt(currentFlow?: CurrentFlow): string {
  const nodeDocs = allNodeTypes.map((n: NodeTypeDefinition) => {
    const outputs = n.outputs.length
      ? n.outputs.map((o) => `${o.key}(${o.dataType})`).join(', ')
      : '（无）'
    const configs = formatFieldSchema(n.configSchema)
    const inputs = n.inputs?.length
      ? n.inputs.map((i) => `${i.key}(${i.dataType}${i.optional ? '?' : ''})`).join(', ')
      : '（无）'
    return [
      `### ${n.type}（${n.label}）`,
      `- 分类: ${n.category}`,
      `- 描述: ${n.description ?? '无'}`,
      `- 输出: [${outputs}]`,
      `- 输入: [${inputs}]`,
      `- 出口数: ${n.exitCount}`,
      `- 参数:`,
      `      ${configs}`,
    ].join('\n')
  }).join('\n\n')

  const flowJson = currentFlow
    ? JSON.stringify(currentFlow, null, 2)
    : '（空画布，暂无节点）'

  return `你是一个专业的工作流编排助手。你可以用自然语言帮用户生成或修改自动化工作流。

## 可用节点类型

${nodeDocs}

## 工作流 JSON 格式
工作流由 nodes 和 edges 两个数组组成：
- node: { id: string, type: string, label: string, position: {x, y}, config: {} }
  - id: 全局唯一，格式为 type_seq，如 start_1, click_2, findPic_3
  - type: 上表中的节点类型标识
  - label: 节点显示名称
  - position: 画布坐标，相邻节点水平间距 200，垂直间距 120
  - config: 该类型参数对象，key 与上表"参数"字段对应
- edge: { id: string, source: string, target: string, sourceHandle?: string }
  - id: 格式为 e_source_target
  - sourceHandle: 多出口节点的分支标识
    - condition / appRunning 节点: "true"（下）/ "false"（右）
    - loop 节点: "body"（循环体）/ "exit"（退出）
    - 单出口节点不需要此字段

## 当前画布工作流数据
${flowJson}

## 规则
1. 用户描述需求时，生成完整的工作流 JSON（不要只输出片段）
2. 每个节点 id 必须全局唯一，格式 type_seq（如 start_1, click_2）
3. start 节点必须有且只有一个
4. 所有节点通过 edges 连接，形成完整流程
5. config 中的参数使用默认值或用户提供的值；用户未提供且无法推断的必填参数用 "TODO_参数名" 占位
6. 如果用户要求修改已有工作流，基于当前画布数据修改后输出完整的新 JSON
7. 变量引用语法：{{nodeId.outputKey}}，例如 {{findPic_1.matchX}}。引用变量时一律使用 {{scope.varName}} 形式（如 {{session.detectCount}}、{{input.packageName}}），严禁直接写 scope.varName（如 session.detectCount）而不加花括号，否则引擎无法解析
8. variable 节点的 action=createOrSet 表示"创建或赋值"（变量不存在时初始化，已存在则保留），set 表示无条件赋值
9. loop 节点的 body 链最后一个节点不需要连回 loop，引擎会自动返回条件判断

## 输出格式要求
- 你的回复必须包含一个完整的 JSON 对象：{"nodes": [...], "edges": [...]}
- JSON 放在 \`\`\`json 和 \`\`\` 代码块中
- 可以在代码块前后添加简要说明文字
- 代码块内的 JSON 必须完整且可直接 JSON.parse
- 每个节点的 position 要合理分布，避免重叠（建议水平间距 200，垂直间距 120）`
}

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  // ── 流式聊天（SSE）──────────────────────────
  app.post<{ Body: AiChatRequest }>(
    '/api/ai/chat',
    async (request, reply) => {
      const { messages, config, currentFlow } = request.body

      if (!config?.apiUrl || !config?.apiKey || !config?.model) {
        return reply.status(400).send({
          success: false,
          code: 'INVALID_CONFIG',
          message: '缺少 apiUrl / apiKey / model 配置',
        })
      }

      if (!messages?.length) {
        return reply.status(400).send({
          success: false,
          code: 'EMPTY_MESSAGES',
          message: '消息列表为空',
        })
      }

      // 注入后端构建的系统提示词（含最新节点信息）
      const systemPrompt = buildSystemPrompt(currentFlow)
      const llmMessages: LlmMessage[] = [
        { role: 'system', content: systemPrompt },
        ...messages.filter((m) => m.role !== 'system'),
      ]

      // 调用外部 LLM API（流式）
      let response: Response
      try {
        response = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages: llmMessages,
            stream: true,
          }),
        })
      } catch (err) {
        app.log.error({ err }, 'LLM API 请求失败')
        return reply.status(502).send({
          success: false,
          code: 'LLM_REQUEST_FAILED',
          message: `LLM API 请求失败: ${err instanceof Error ? err.message : String(err)}`,
        })
      }

      if (!response.ok) {
        const errorText = await response.text()
        app.log.error({ status: response.status, body: errorText }, 'LLM API 返回错误')
        return reply.status(response.status).send({
          success: false,
          code: 'LLM_API_ERROR',
          message: `LLM API 错误 (${response.status}): ${errorText}`,
        })
      }

      // SSE 流式响应（手动补充 CORS 头，因为 raw 写入绕过了 @fastify/cors）
      const origin = request.headers.origin ?? '*'
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      })

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data: ')) continue

            const data = trimmed.slice(6)
            if (data === '[DONE]') {
              reply.raw.write('data: [DONE]\n\n')
              continue
            }

            try {
              const json = JSON.parse(data)
              const content = json.choices?.[0]?.delta?.content
              if (content) {
                reply.raw.write(`data: ${JSON.stringify({ content })}\n\n`)
              }
            } catch {
              // 跳过无法解析的行
            }
          }
        }
      } catch (err) {
        app.log.error({ err }, 'SSE 流读取异常')
      } finally {
        reply.raw.end()
      }
    },
  )

  // ── 测试连接（非流式）───────────────────
  app.post<{ Body: AiChatRequest }>(
    '/api/ai/test',
    async (request, reply) => {
      const { config } = request.body

      if (!config?.apiUrl || !config?.apiKey || !config?.model) {
        return reply.status(400).send({
          success: false,
          code: 'INVALID_CONFIG',
          message: '缺少 apiUrl / apiKey / model 配置',
        })
      }

      try {
        const response = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5,
            stream: false,
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          return reply.status(response.status).send({
            success: false,
            code: 'LLM_API_ERROR',
            message: `API 错误 (${response.status}): ${errorText.slice(0, 200)}`,
          })
        }

        // 能收到正常响应即视为连接成功
        return reply.send({ success: true, message: '连接成功' })
      } catch (err) {
        return reply.status(502).send({
          success: false,
          code: 'LLM_REQUEST_FAILED',
          message: `请求失败: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    },
  )
}
