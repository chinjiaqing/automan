// ─────────────────────────────────────────────
// AI 路由模块
// 职责：LLM API 代理（流式输出），避免前端直接暴露 API Key
// ─────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'

/** LLM 消息 */
interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 请求体 */
interface AiChatRequest {
  messages: LlmMessage[]
  config: {
    apiUrl: string
    apiKey: string
    model: string
  }
}

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  // ── 流式聊天（SSE）──────────────────────────
  app.post<{ Body: AiChatRequest }>(
    '/api/ai/chat',
    async (request, reply) => {
      const { messages, config } = request.body

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
            messages,
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
