import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import { loadEnv } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleApiRequest } from './api-handler.ts';
import { createShopRuntime } from './shop/runtime.ts';
import type { ShopRuntime } from './shop/runtime.ts';

type Server = ViteDevServer | PreviewServer;

/**
 * Backend aplikasi: API kontrol router (khusus admin lokal) + penjualan voucher online
 * (halaman /beli, /api/shop/*, webhook pembayaran). Berjalan di dev server maupun `vite preview`.
 */
export function mikrotikBackendPlugin(): Plugin {
  let shop: Promise<ShopRuntime | null> | null = null;

  const start = (server: Server) => {
    // Muat .env ke process.env (tanpa menimpa variabel yang sudah ada)
    const env = loadEnv(server.config.mode, server.config.envDir || process.cwd(), '');
    for (const [key, value] of Object.entries(env)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }

    shop = createShopRuntime()
      .then(runtime => {
        server.httpServer?.once('close', () => runtime.stop());
        return runtime;
      })
      .catch(err => {
        console.error('[shop] Penjualan online TIDAK aktif:', err instanceof Error ? err.message : err);
        return null;
      });

    server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
      try {
        const runtime = await shop;
        const path = (req.url || '').split('?')[0];
        const isShopPath = path === '/beli' || path.startsWith('/beli/') || path.startsWith('/api/shop/') || path.startsWith('/api/shop-admin/');

        if (isShopPath) {
          if (!runtime) {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'Penjualan online tidak aktif (lihat log server)' }));
            return;
          }
          if (await runtime.handle(req, res)) return;
        }

        if (await handleApiRequest(req, res)) return;
        next();
      } catch (err) {
        next(err);
      }
    });
  };

  return {
    name: 'vite-plugin-mikrotik-backend',
    configureServer(server) {
      start(server);
    },
    configurePreviewServer(server) {
      start(server);
    },
  };
}
