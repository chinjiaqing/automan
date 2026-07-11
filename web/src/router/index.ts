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
      ],
    },
  ],
})

// 路由守卫：未连接 WS → 跳转登录页；已连接 → 登录页重定向到首页
router.beforeEach((to) => {
  const { state } = useWebSocket()
  if (to.meta.requiresAuth !== false && state.value !== 'connected') {
    return { name: 'login' }
  }
  if (to.name === 'login' && state.value === 'connected') {
    return { name: 'home' }
  }
})

export default router
