import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/sel-rts-logic-builder/',
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  experimental: {
    // Allows vitest to run in Linux CI without the native rollup binary
    skipSsrTransform: true,
  },
})
