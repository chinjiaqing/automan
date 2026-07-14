// ─────────────────────────────────────────────
// {{nodeId.outputKey}} 引用解析器（服务端）
// ─────────────────────────────────────────────

/**
 * 简单算术表达式求值器
 * 支持 +, -, *, / 和括号，遵循标准运算符优先级
 * 仅允许数字、运算符和空白字符，返回 NaN 表示非算术表达式
 */
function evalArithmetic(expr: string): number {
  const s = expr.trim()
  if (!s) return NaN

  // 安全检查：只允许数字、运算符、括号、小数点、空白
  if (!/^[\d\s+\-*/().]+$/.test(s)) return NaN

  let pos = 0

  function skipSpaces() {
    while (pos < s.length && s[pos] === ' ') pos++
  }

  function parseExpr(): number {
    let left = parseTerm()
    skipSpaces()
    while (pos < s.length && (s[pos] === '+' || s[pos] === '-')) {
      const op = s[pos++]
      const right = parseTerm()
      left = op === '+' ? left + right : left - right
      skipSpaces()
    }
    return left
  }

  function parseTerm(): number {
    let left = parseUnary()
    skipSpaces()
    while (pos < s.length && (s[pos] === '*' || s[pos] === '/')) {
      const op = s[pos++]
      const right = parseUnary()
      left = op === '*' ? left * right : (right === 0 ? 0 : left / right)
      skipSpaces()
    }
    return left
  }

  function parseUnary(): number {
    skipSpaces()
    if (s[pos] === '-') {
      pos++
      return -parsePrimary()
    }
    if (s[pos] === '+') {
      pos++
      return parsePrimary()
    }
    return parsePrimary()
  }

  function parsePrimary(): number {
    skipSpaces()
    if (s[pos] === '(') {
      pos++ // skip (
      const result = parseExpr()
      if (s[pos] === ')') pos++ // skip )
      return result
    }
    let num = ''
    while (pos < s.length && (s[pos] >= '0' && s[pos] <= '9' || s[pos] === '.')) {
      num += s[pos++]
    }
    return num.length > 0 ? Number(num) : NaN
  }

  const result = parseExpr()
  skipSpaces()
  // 必须消耗完所有字符才算有效算术表达式
  return pos >= s.length ? result : NaN
}

/**
 * 解析单个值，将 {{nodeId.key}} 替换为 context 中的实际值
 * 支持内嵌算术表达式，如 "{{ref}} + 100"
 * 支持 {{var:name}} 直接读取变量池
 * @param value 待解析的值
 * @param outputs 节点输出映射 { [nodeId]: { [key]: value } }
 * @param variables 变量池 { [name]: value }（可选）
 */
export function resolveValue(
  value: unknown,
  outputs: Record<string, Record<string, unknown>>,
  variables?: Record<string, unknown>,
): unknown {
  if (typeof value !== 'string') return value

  // {{var:name}} → 直接读取变量池
  const varFullMatch = /^\{\{var:([^{}]+)\}\}$/.exec(value)
  if (varFullMatch) {
    const varName = varFullMatch[1]
    return variables?.[varName] ?? value
  }

  // 完整引用 {{nodeId.key}} → 返回原始类型（不做算术）
  const fullMatch = /^\{\{([^{}.]+)\.([^{}.]+)\}\}$/.exec(value)
  if (fullMatch) {
    const [, nodeId, key] = fullMatch
    return outputs[nodeId]?.[key] ?? value
  }

  // 内嵌引用 → 字符串替换，再尝试算术求值
  if (value.includes('{{')) {
    const replaced = value.replace(
      /\{\{(?:var:([^{}]+)|([^{}.]+)\.([^{}.]+))\}\}/g,
      (match, varName, nodeId, key) => {
        if (varName) {
          const v = variables?.[varName]
          return v !== undefined ? String(v) : match
        }
        const v = outputs[nodeId]?.[key]
        return v !== undefined ? String(v) : match
      },
    )
    // 如果仍有未解析的引用，直接返回字符串
    if (replaced.includes('{{')) return replaced
    // 尝试算术求值："100 + 100" → 200
    const num = evalArithmetic(replaced)
    if (!isNaN(num)) return num
    return replaced
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
