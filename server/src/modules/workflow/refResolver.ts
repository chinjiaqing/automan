// ─────────────────────────────────────────────
// {{nodeId.outputKey}} 引用解析器（服务端）
// ─────────────────────────────────────────────

/**
 * 解析单个值，将 {{nodeId.key}} 替换为 context 中的实际值
 * @param value 待解析的值
 * @param outputs 节点输出映射 { [nodeId]: { [key]: value } }
 */
export function resolveValue(value: unknown, outputs: Record<string, Record<string, unknown>>): unknown {
  if (typeof value !== 'string') return value

  // 完整引用 {{nodeId.key}} → 返回原始类型
  const fullMatch = /^\{\{([^{}.]+)\.([^{}.]+)\}\}$/.exec(value)
  if (fullMatch) {
    const [, nodeId, key] = fullMatch
    return outputs[nodeId]?.[key] ?? value
  }

  // 内嵌引用 → 字符串替换
  if (value.includes('{{')) {
    const result = value.replace(
      /\{\{([^{}.]+)\.([^{}.]+)\}\}/g,
      (_, nodeId, key) => {
        const v = outputs[nodeId]?.[key]
        return v !== undefined ? String(v) : `{{${nodeId}.${key}}}`
      },
    )
    return result
  }

  // 纯数字字符串 → 自动转换
  if (!isNaN(Number(value)) && value.trim() !== '') return Number(value)

  return value
}

/**
 * 解析 config 中所有引用字段
 */
export function resolveConfig(
  config: Record<string, unknown>,
  outputs: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(config)) {
    result[key] = resolveValue(value, outputs)
  }
  return result
}

/**
 * 评估条件表达式
 */
export function evaluateCondition(
  left: unknown,
  operator: string,
  right: unknown,
): boolean {
  const l = left as number
  const r = right as number

  switch (operator) {
    case '==':
      return String(left) === String(right)
    case '!=':
      return String(left) !== String(right)
    case '>':
      return l > r
    case '>=':
      return l >= r
    case '<':
      return l < r
    case '<=':
      return l <= r
    case 'contains':
      return String(left).includes(String(right))
    case 'isEmpty':
      return left === '' || left === null || left === undefined
    default:
      return false
  }
}
