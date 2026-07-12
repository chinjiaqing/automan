import type { ApiResult, ApiError } from '@automan/shared/types.js'

/** 统一 HTTP 请求封装，baseUrl 来自 WS 连接地址 */
let baseUrl = ''

export function setApiBase(url: string) {
  baseUrl = url
}

export function getApiBase() {
  return baseUrl
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {}
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  const opts: RequestInit = {
    method,
    headers,
  }
  if (body !== undefined) {
    opts.body = JSON.stringify(body)
  }

  try {
    const res = await fetch(`${baseUrl}${path}`, opts)

    // HTTP 非 2xx：尝试解析错误响应
    if (!res.ok) {
      try {
        const errBody = await res.json()
        // 服务端返回的 ApiError 格式
        if (errBody && typeof errBody === 'object' && 'success' in errBody) {
          return errBody as ApiError
        }
      } catch {
        // JSON 解析失败
      }
      return {
        success: false,
        code: `HTTP_${res.status}`,
        message: `请求失败 (${res.status})`,
      }
    }

    return (await res.json()) as ApiResult<T>
  } catch (err) {
    return {
      success: false,
      code: 'NETWORK_ERROR',
      message: err instanceof Error ? err.message : '网络请求失败',
    }
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
}
