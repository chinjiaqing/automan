// ─────────────────────────────────────────────
// 节点类型注册表
// 定义所有可用的节点类型及其 schema
// ─────────────────────────────────────────────

import type { NodeTypeDefinition } from './types.js'

// ── 流程控制节点 ────────────────────────────────
export const flowNodeTypes: NodeTypeDefinition[] = [
  {
    type: 'start',
    category: 'flow',
    label: '开始',
    icon: 'pi-play',
    description: '工作流的起始节点，每次执行从这里开始',
    configSchema: [],
    outputs: [],
    inputs: [],
    exitCount: 1,
  },
  {
    type: 'end',
    category: 'flow',
    label: '结束',
    icon: 'pi-stop',
    description: '工作流结束，不计入成功或失败',
    configSchema: [],
    outputs: [],
    inputs: [],
    exitCount: 0,
  },
  {
    type: 'endSuccess',
    category: 'flow',
    label: '结束（成功）',
    icon: 'pi-check-circle',
    description: '标记工作流成功结束，计入成功计数',
    configSchema: [],
    outputs: [],
    inputs: [],
    exitCount: 0,
  },
  {
    type: 'endFail',
    category: 'flow',
    label: '结束（失败）',
    icon: 'pi-times-circle',
    description: '标记工作流失败结束，计入失败计数',
    configSchema: [],
    outputs: [],
    inputs: [],
    exitCount: 0,
  },
  {
    type: 'condition',
    category: 'flow',
    label: '条件判断',
    icon: 'pi-question',
    description: '根据条件分支执行，true 走下方出口，false 走右侧出口',
    configSchema: [
      { key: 'left', label: '左值', type: 'data-ref', placeholder: '引用上游输出' },
      {
        key: 'operator',
        label: '运算符',
        type: 'select',
        options: ['==', '!=', '>', '<', '>=', '<=', 'contains', 'isEmpty'],
      },
      { key: 'right', label: '右值', type: 'data-input', placeholder: '常量或引用' },
    ],
    outputs: [{ key: 'result', label: '判断结果', dataType: 'boolean' }],
    inputs: [],
    exitCount: 2,
  },
  {
    type: 'loop',
    category: 'flow',
    label: '循环',
    icon: 'pi-refresh',
    description: '条件满足时重复执行 body 链，不满足时走 exit 出口',
    configSchema: [
      { key: 'left', label: '条件左值', type: 'data-ref', placeholder: '引用上游输出' },
      {
        key: 'operator',
        label: '运算符',
        type: 'select',
        options: ['<', '<=', '>', '>=', '==', '!='],
      },
      { key: 'right', label: '条件右值', type: 'data-input', placeholder: '常量或引用' },
      { key: 'maxIter', label: '最大迭代', type: 'number', default: 100 },
    ],
    outputs: [],
    inputs: [],
    exitCount: 2, // body + exit
  },
]

// ── 动作节点 ────────────────────────────────────
export const actionNodeTypes: NodeTypeDefinition[] = [
  {
    type: 'findPic',
    category: 'action',
    label: '识图',
    icon: 'pi-image',
    description: '在截图中查找模板图片，返回匹配位置和数量',
    configSchema: [
      { key: 'templateImage', label: '模板图片', type: 'image-upload' },
      { key: 'threshold', label: '相似度', type: 'slider', min: 30, max: 100, default: 80 },
      { key: 'region', label: '搜索区域', type: 'coord-ref', default: '0,0,0,0' },
    ],
    outputs: [
      { key: 'matchCount', label: '匹配数量', dataType: 'number' },
      { key: 'matchX', label: '首个匹配X', dataType: 'number' },
      { key: 'matchY', label: '首个匹配Y', dataType: 'number' },
    ],
    inputs: [{ key: 'region', label: '搜索区域', dataType: 'coord', optional: true }],
    exitCount: 1,
  },
  {
    type: 'ocrWords',
    category: 'action',
    label: '识字',
    icon: 'pi-file-edit',
    description: '对指定区域进行 OCR 文字识别',
    configSchema: [
      { key: 'region', label: '识别区域', type: 'coord-ref', default: '0,0,0,0' },
    ],
    outputs: [
      { key: 'text', label: '识别文本', dataType: 'string' },
      { key: 'wordCount', label: '文字数量', dataType: 'number' },
    ],
    inputs: [],
    exitCount: 1,
  },
  {
    type: 'ocrFindStr',
    category: 'action',
    label: '找字',
    icon: 'pi-search',
    description: '在截图中查找指定文字，返回匹配位置',
    configSchema: [
      { key: 'target', label: '目标文字', type: 'text' },
      { key: 'similarity', label: '相似度', type: 'slider', min: 30, max: 100, default: 80 },
      { key: 'region', label: '搜索区域', type: 'coord-ref', default: '0,0,0,0' },
    ],
    outputs: [
      { key: 'matchCount', label: '匹配数量', dataType: 'number' },
      { key: 'matchX', label: '首个匹配X', dataType: 'number' },
      { key: 'matchY', label: '首个匹配Y', dataType: 'number' },
    ],
    inputs: [],
    exitCount: 1,
  },
  {
    type: 'click',
    category: 'action',
    label: '点击',
    icon: 'pi-bullseye',
    description: '在指定坐标执行一次点击操作',
    configSchema: [
      { key: 'x', label: 'X 坐标', type: 'data-input', default: '0' },
      { key: 'y', label: 'Y 坐标', type: 'data-input', default: '0' },
    ],
    outputs: [],
    inputs: [
      { key: 'x', label: 'X 坐标', dataType: 'number', optional: true },
      { key: 'y', label: 'Y 坐标', dataType: 'number', optional: true },
    ],
    exitCount: 1,
  },
  {
    type: 'areaClick',
    category: 'action',
    label: '范围点击',
    icon: 'pi-objects-column',
    description: '在指定区域内随机选取一点进行点击',
    configSchema: [
      { key: 'region', label: '点击区域', type: 'coord-ref', default: '0,0,0,0' },
    ],
    outputs: [],
    inputs: [],
    exitCount: 1,
  },
  {
    type: 'swipe',
    category: 'action',
    label: '滑动',
    icon: 'pi-angle-double-right',
    description: '从起点区域滑动到终点区域',
    configSchema: [
      { key: 'startRegion', label: '起点区域', type: 'coord-ref', default: '0,0,0,0' },
      { key: 'endRegion', label: '终点区域', type: 'coord-ref', default: '0,0,0,0' },
      { key: 'padding', label: '内边距', type: 'number', default: 0 },
    ],
    outputs: [
      { key: 'startX', label: '起点X', dataType: 'number' },
      { key: 'startY', label: '起点Y', dataType: 'number' },
      { key: 'endX', label: '终点X', dataType: 'number' },
      { key: 'endY', label: '终点Y', dataType: 'number' },
      { key: 'steps', label: '分段数', dataType: 'number' },
    ],
    inputs: [],
    exitCount: 1,
  },
  {
    type: 'delay',
    category: 'action',
    label: '等待',
    icon: 'pi-clock',
    description: '暂停指定毫秒数后继续执行',
    configSchema: [
      { key: 'ms', label: '延迟毫秒', type: 'number', default: 1000 },
    ],
    outputs: [],
    inputs: [],
    exitCount: 1,
  },
  {
    type: 'randomDelay',
    category: 'action',
    label: '随机等待',
    icon: 'pi-clock',
    description: '在最小值和最大值之间随机等待一段时间',
    configSchema: [
      { key: 'left', label: '最小值(ms)', type: 'data-input', default: '0', placeholder: '最小延迟，支持引用' },
      { key: 'right', label: '最大值(ms)', type: 'data-input', default: '1000', placeholder: '最大延迟，支持引用' },
    ],
    outputs: [{ key: 'actualMs', label: '实际等待(ms)', dataType: 'number' }],
    inputs: [],
    exitCount: 1,
  },

]

// ── 数据节点 ────────────────────────────────────
export const dataNodeTypes: NodeTypeDefinition[] = [
  {
    type: 'variable',
    category: 'data',
    label: '数据',
    icon: 'pi-database',
    description: '管理变量：创建、赋值、四则运算，支持全局/本轮/外部输入作用域',
    configSchema: [
      { key: 'name', label: '数据源', type: 'data-source' },
      {
        key: 'scope',
        label: '作用域',
        type: 'select',
        options: ['session', 'local', 'input'],
        default: 'local',
      },
      {
        key: 'action',
        label: '操作',
        type: 'select',
        options: ['createOrSet', 'set', 'add', 'sub', 'mul', 'div'],
        default: 'set',
      },
      {
        key: 'operand',
        label: '操作数',
        type: 'data-input',
        placeholder: '常量或引用 {{nodeId.key}}',
        default: 1,
        showWhen: { action: 'add,sub,mul,div' },
      },
      {
        key: 'value',
        label: '设定值',
        type: 'data-input',
        placeholder: '常量或引用 {{nodeId.key}}',
        default: 0,
        showWhen: { action: 'set,createOrSet' },
      },
    ],
    outputs: [{ key: 'value', label: '当前值', dataType: 'number' }],
    inputs: [],
    exitCount: 1,
  },
  {
    type: 'dice',
    category: 'data',
    label: '骰子?',
    icon: 'pi-sparkles',
    description: '生成一个 1~6 的随机整数',
    configSchema: [],
    outputs: [{ key: 'value', label: '随机1-6的正整数', dataType: 'number' }],
    inputs: [],
    exitCount: 1,
  },
]

// ── 应用节点 ────────────────────────────────────
export const appNodeTypes: NodeTypeDefinition[] = [
  {
    type: 'launchApp',
    category: 'app',
    label: '启动应用',
    icon: 'pi-play-circle',
    description: '通过包名启动指定应用',
    configSchema: [
      { key: 'packageName', label: '包名', type: 'text', placeholder: 'com.example.app' },
    ],
    outputs: [],
    inputs: [],
    exitCount: 1,
  },
  {
    type: 'killApp',
    category: 'app',
    label: '关闭应用',
    icon: 'pi-times-circle',
    description: '强制关闭指定包名的应用',
    configSchema: [
      { key: 'packageName', label: '包名', type: 'text', placeholder: 'com.example.app' },
    ],
    outputs: [],
    inputs: [],
    exitCount: 1,
  },
  {
    type: 'restartApp',
    category: 'app',
    label: '重启应用',
    icon: 'pi-refresh',
    description: '先关闭再启动指定应用',
    configSchema: [
      { key: 'packageName', label: '包名', type: 'text', placeholder: 'com.example.app' },
    ],
    outputs: [],
    inputs: [],
    exitCount: 1,
  },
  {
    type: 'appRunning',
    category: 'app',
    label: '应用状态',
    icon: 'pi-info-circle',
    description: '检测应用是否正在运行，true 走下方出口，false 走右侧',
    configSchema: [
      { key: 'packageName', label: '包名', type: 'text', placeholder: 'com.example.app' },
    ],
    outputs: [{ key: 'running', label: '是否运行中', dataType: 'boolean' }],
    inputs: [],
    exitCount: 2,
  },
]

// ── 调试节点 ────────────────────────────────────
export const debugNodeTypes: NodeTypeDefinition[] = [
  {
    type: 'log',
    category: 'debug',
    label: '日志',
    icon: 'pi-info-circle',
    description: '输出一条日志信息，支持引用上游节点输出',
    configSchema: [
      {
        key: 'message',
        label: '内容',
        type: 'data-input',
        placeholder: '支持引用 {{nodeId.key}}',
      },
    ],
    outputs: [],
    inputs: [],
    exitCount: 1,
  },
]

// ── 片段节点 ────────────────────────────────
export const fragmentNodeTypes: NodeTypeDefinition[] = [
  {
    type: 'call',
    category: 'flow',
    label: '调用片段',
    icon: 'pi-code',
    description: '调用一个已定义的片段（函数），支持传参和接收返回值',
    configSchema: [
      { key: 'fragmentId', label: '片段', type: 'select', options: [] },
    ],
    outputs: [], // 动态：由选中片段决定
    inputs: [],
    exitCount: 1,
  },
  {
    type: 'return',
    category: 'flow',
    label: '返回',
    icon: 'pi-undo',
    description: '片段返回节点，将值输出给调用方，执行后退出片段',
    configSchema: [], // 动态：由片段的 outputs 决定
    outputs: [],
    inputs: [],
    exitCount: 0,
  },
]

// ── 合并所有类型 ────────────────────────────────
export const allNodeTypes: NodeTypeDefinition[] = [
  ...flowNodeTypes,
  ...actionNodeTypes,
  ...dataNodeTypes,
  ...appNodeTypes,
  ...debugNodeTypes,
  ...fragmentNodeTypes,
]

/** 按 type 查找节点定义 */
export function getNodeTypeDef(type: string): NodeTypeDefinition | undefined {
  return allNodeTypes.find((n) => n.type === type)
}

/** 按分类分组 */
export function getNodeTypesByCategory(): Record<string, NodeTypeDefinition[]> {
  return {
    flow: flowNodeTypes,
    action: actionNodeTypes,
    data: dataNodeTypes,
    app: appNodeTypes,
    debug: debugNodeTypes,
    fragment: fragmentNodeTypes,
  }
}
