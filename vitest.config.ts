import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react() as any],
  test: {
    pool: 'forks',
    environment: 'node',
    exclude: ['**/col0_debug.test.ts', '**/node_modules/**'],
  },
})
