import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { mikrotikBackendPlugin } from './server/vite-plugin.ts'

/** SHOP_ALLOWED_HOSTS=wifi.tkj,beli.contoh.com : nama host yang boleh dipakai untuk membuka server (selain IP dan localhost) */
export function parseAllowedHosts(value: string | undefined): string[] | undefined {
  const hosts = (value ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return hosts.length > 0 ? hosts : undefined
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const allowedHosts = parseAllowedHosts(env.SHOP_ALLOWED_HOSTS ?? process.env.SHOP_ALLOWED_HOSTS)

  return {
    plugins: [react(), mikrotikBackendPlugin()],
    // CORS ditangani sendiri oleh backend (server/shop/http.ts) hanya untuk /api/shop/* dan hanya untuk origin
    // di SHOP_ALLOWED_ORIGINS. Middleware CORS bawaan Vite harus dimatikan: di `vite preview` ia menjawab preflight
    // lebih dulu tanpa header Access-Control-Allow-Origin, sehingga browser menolak panggilan dari halaman hotspot.
    server: { cors: false, allowedHosts },
    preview: { cors: false, allowedHosts },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  }
})
