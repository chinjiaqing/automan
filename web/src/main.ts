import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import { definePreset } from '@primevue/themes'
import router from './router/index.js'
import App from './App.vue'

import 'virtual:uno.css'
import '@unocss/reset/tailwind.css'
import 'primeicons/primeicons.css'

// 自定义主题预设：基于 Aura，主色调为 brand (blue-600)
const AutomanPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6',
      600: '#2563eb',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
      950: '#172554',
    },
  },
})

const app = createApp(App)

app.use(PrimeVue, {
  theme: {
    preset: AutomanPreset,
    options: {
      darkModeSelector: false,
      cssLayer: false,
    },
  },
})

app.use(router)
app.mount('#app')
