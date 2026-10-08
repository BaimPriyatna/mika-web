import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { mikrotikBackendPlugin } from './server/vite-plugin.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mikrotikBackendPlugin()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})

