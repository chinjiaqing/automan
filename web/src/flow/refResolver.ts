// ─────────────────────────────────────────────
// {{nodeId.outputKey}} 引用解析器
// ─────────────────────────────────────────────

/**
 * 从字符串中提取所有 {{nodeId.key}} 引用
 * 返回 [{ nodeId, outputKey }]
 */
export function extractRefs(value: string): Array<{ nodeId: string; outputKey: string }> {
  const refs: Array<{ nodeId: string; outputKey: string }> = []
  const re = /\{\{([^{}.]+)\.([^{}.]+)\}\}/g
  let match: RegExpExecArray | null
  while ((match = re.exec(value)) !== null) {
    refs.push({ nodeId: match[1], outputKey: match[2] })
  }
  return refs
}

/**
 * 将 config 中所有 {{nodeId.key}} 替换为 context 中的实际值
 * 支持 {{var:name}} 直接读取变量池
 * context 格式：{ [nodeId]: { [outputKey]: value } }
 */
export function resolveRefs(
  config: Record<string, unknown>,
  context: Record<string, Record<string, unknown>>,
  variables?: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string') {
      // {{var:name}} → 变量池引用
      const varFullMatch = /^\{\{var:([^{}]+)\}\}$/.exec(value)
      if (varFullMatch) {
        result[key] = variables?.[varFullMatch[1]] ?? value
        continue
      }

      // 完整引用替换（值就是引用本身）
      const fullMatch = /^\{\{([^{}.]+)\.([^{}.]+)\}\}$/.exec(value)
      if (fullMatch) {
        const [, nodeId, outputKey] = fullMatch
        result[key] = context[nodeId]?.[outputKey] ?? value
        continue
      }

      // 内嵌引用替换（字符串中包含多个引用）
      result[key] = value.replace(
        /\{\{(?:var:([^{}]+)|([^{}.]+)\.([^{}.]+))\}\}/g,
        (match, varName, nodeId, outputKey) => {
          if (varName) {
            const v = variables?.[varName]
            return v !== undefined ? String(v) : match
          }
          const v = context[nodeId]?.[outputKey]
          return v !== undefined ? String(v) : match
        },
      )
    } else {
      result[key] = value
    }
  }

  return result
}

/**
 * 生成引用字符串
 */
export function makeRef(nodeId: string, outputKey: string): string {
  return `{{${nodeId}.${outputKey}}}`
}
