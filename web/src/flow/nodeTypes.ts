// ─────────────────────────────────────────────
// 节点类型注册表
// 定义所有可用的节点类型及其 schema
// ─────────────────────────────────────────────

import type { NodeTypeDefinition } from '@automan/shared/types.js'

// ── 流程控制节点 ────────────────────────────────
export const flowNodeTypes: NodeTypeDefinition[] = [
  {
    type: 'start',
    category: 'flow',
    label: '开始',
    icon: 'pi-play',
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
    configSchema: [
      { key: 'region', label: '点击区域', type: 'coord-ref', default: '0,0,0,0' },
    ],
    outputs: [],
    inputs: [],
    exitCount: 1,
  },
  {
    type: 'delay',
    category: 'action',
    label: '等待',
    icon: 'pi-clock',
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
    configSchema: [
      { key: 'name', label: '数据源', type: 'data-source' },
      {
        key: 'scope',
        label: '作用域',
        type: 'select',
        options: ['local', 'session', 'input'],
        default: 'local',
      },
      {
        key: 'action',
        label: '操作',
        type: 'select',
        options: ['set', 'add', 'sub', 'mul', 'div', 'reset'],
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
        showWhen: { action: 'set' },
      },
    ],
    outputs: [{ key: 'value', label: '当前值', dataType: 'number' }],
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
    configSchema: [
      { key: 'packageName', label: '包名', type: 'text', placeholder: 'com.example.app' },
    ],
    outputs: [{ key: 'running', label: '是否运行中', dataType: 'boolean' }],
    inputs: [],
    exitCount: 2,
  },
]

// ── 合并所有类型 ────────────────────────────────
export const allNodeTypes: NodeTypeDefinition[] = [
  ...flowNodeTypes,
  ...actionNodeTypes,
  ...dataNodeTypes,
  ...appNodeTypes,
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
  }
}
