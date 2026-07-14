import { createRouter, createWebHistory } from 'vue-router'
import { useWebSocket } from '../composables/useWebSocket.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      component: () => import('../layouts/AppLayout.vue'),
      meta: { requiresAuth: true },
      redirect: { name: 'home' },
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('../views/HomeView.vue'),
        },
        {
          path: 'track',
          name: 'track',
          component: () => import('../views/CanvasView.vue'),
        },
        {
          path: 'flow',
          name: 'flow',
          component: () => import('../views/FlowView.vue'),
        },
        {
          path: 'ai-flow',
          name: 'ai-flow',
          component: () => import('../views/AiFlowView.vue'),
        },
      ],
    },
  ],
})

// 路由守卫：未连接时尝试缓存重连，失败才跳登录页
let reconnectAttempted = false

router.beforeEach(async (to) => {
  const { state, reconnectFromCache } = useWebSocket()

  // 已连接 → 重置标记(允许下次断线后再重连) + 登录页重定向到首页
  if (state.value === 'connected') {
    reconnectAttempted = false
    if (to.name === 'login') return { name: 'home' }
    return
  }

  // 不需要认证的页面直接放行
  if (to.meta.requiresAuth === false) return

  // 未连接且未尝试过重连 → 尝试从缓存恢复
  if (!reconnectAttempted) {
    reconnectAttempted = true
    const ok = await reconnectFromCache()
    if (ok) return // 重连成功，放行
  }

  // 重连失败或无缓存 → 跳登录页
  return { name: 'login' }
})

export default router
