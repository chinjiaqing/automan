import { defineConfig, presetUno, presetAttributify } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
  ],
  theme: {
    colors: {
      brand: {
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
      },
    },
  },
  shortcuts: {
    'btn': 'px-4 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors border-none outline-none',
    'btn-primary': 'btn bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800',
    'btn-danger': 'btn bg-red-500 text-white hover:bg-red-600 active:bg-red-700',
    'btn-ghost': 'btn bg-transparent text-gray-600 hover:bg-gray-100',
    'card': 'bg-white rounded-lg shadow-sm border border-gray-200 p-4',
    'input-base':
      'w-full px-3 py-2 text-sm border border-gray-300 rounded-md outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors',
  },
})
