import type { IncomingMessage, ServerResponse } from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ShopConfig } from './config.ts';
import { describeConfig } from './config.ts';
import { WebhookAuthError, WebhookFormatError } from './gateway.ts';
import { RateLimiter } from './rate-limit.ts';
import type { ShopService } from './service.ts';
import { ShopError } from './types.ts';
import { isAdminRequest, isLoopback, normalizeIp } from '../security.ts';

const MAX_BODY_BYTES = 64 * 1024;

const STATIC_FILES: Record<string, { file: string; type: string }> = {
  '/beli': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/beli/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/beli/shop.css': { file: 'shop.css', type: 'text/css; charset=utf-8' },
  '/beli/shop.js': { file: 'shop.js', type: 'application/javascript; charset=utf-8' },
};

const CSP =
  "default-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export interface ShopHttpDeps {
  service: ShopService;
  config: ShopConfig;
  /** Folder berkas halaman beli. Default: ./shop */
  staticDir?: string;
}

function clientIp(req: IncomingMessage): string {
  const remote = normalizeIp(req.socket.remoteAddress);
  // X-Forwarded-For hanya dipercaya jika datang dari proxy lokal (tunnel/reverse proxy di mesin yang sama)
  if (isLoopback(remote)) {
    const xff = req.headers['x-forwarded-for'];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return remote || 'unknown';
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return; // sisa data dibuang agar balasan 413 tetap terkirim (tanpa memutus koneksi)
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        reject(new ShopError(413, 'too_large', 'Permintaan terlalu besar'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return;
      if (size === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch {
        reject(new ShopError(400, 'invalid_json', 'Isi permintaan bukan JSON yang valid'));
      }
    });
    req.on('error', reject);
  });
}

export function createShopHandler(deps: ShopHttpDeps) {
  const { service, config } = deps;
  const staticDir = path.resolve(deps.staticDir ?? 'shop');

  const orderLimiter = new RateLimiter(8, 60_000);
  const readLimiter = new RateLimiter(120, 60_000);

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = (req.method ?? 'GET').toUpperCase();

    const isStatic = pathname in STATIC_FILES;
    const isPublicApi = pathname.startsWith('/api/shop/');
    const isAdminApi = pathname.startsWith('/api/shop-admin/');
    if (!isStatic && !isPublicApi && !isAdminApi) return false;

    const sendJson = (status: number, payload: unknown, extra?: Record<string, string>) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      for (const [k, v] of Object.entries(extra ?? {})) res.setHeader(k, v);
      res.end(JSON.stringify(payload));
    };

    try {
      // ---- halaman beli (statis)
      if (isStatic) {
        if (method !== 'GET' && method !== 'HEAD') {
          sendJson(405, { success: false, error: 'Metode tidak diizinkan' });
          return true;
        }
        const entry = STATIC_FILES[pathname];
        let body: Buffer;
        try {
          body = await fs.promises.readFile(path.join(staticDir, entry.file));
        } catch {
          sendJson(404, { success: false, error: 'Halaman tidak ditemukan' });
          return true;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', entry.type);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Content-Security-Policy', CSP);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.end(method === 'HEAD' ? undefined : body);
        return true;
      }

      // ---- API admin: hanya dari mesin server / IP yang diizinkan
      if (isAdminApi) {
        if (!isAdminRequest(req, config.adminAllowedIps)) {
          sendJson(403, { success: false, error: 'Akses administrator hanya dari perangkat server' });
          return true;
        }
        return await handleAdmin(req, pathname, method, url, sendJson);
      }

      // ---- API publik
      const ip = clientIp(req);

      if (pathname === '/api/shop/webhook/midtrans') {
        if (method !== 'POST') {
          sendJson(405, { success: false, error: 'Metode tidak diizinkan' });
          return true;
        }
        const payload = await readJsonBody(req);
        try {
          const result = await service.handleWebhook(payload);
          sendJson(200, { success: true, result: result.result });
        } catch (err) {
          if (err instanceof WebhookAuthError) {
            sendJson(401, { success: false, error: 'Tanda tangan tidak valid' });
          } else if (err instanceof WebhookFormatError) {
            sendJson(400, { success: false, error: 'Format notifikasi tidak valid' });
          } else {
            throw err;
          }
        }
        return true;
      }

      if (pathname === '/api/shop/packages' && method === 'GET') {
        if (!readLimiter.check(`pkg:${ip}`)) return tooMany(sendJson);
        sendJson(200, { success: true, ...service.listPackages() });
        return true;
      }

      if (pathname === '/api/shop/orders' && method === 'POST') {
        if (!orderLimiter.check(`order:${ip}`)) return tooMany(sendJson);
        const body = (await readJsonBody(req)) as { packageId?: unknown };
        const header = req.headers['idempotency-key'];
        const view = await service.createOrder({
          packageId: body.packageId,
          idempotencyKey: Array.isArray(header) ? header[0] : header,
        });
        sendJson(201, { success: true, order: view });
        return true;
      }

      const orderMatch = pathname.match(/^\/api\/shop\/orders\/([^/]+)$/);
      if (orderMatch && method === 'GET') {
        if (!readLimiter.check(`get:${ip}`)) return tooMany(sendJson);
        const view = await service.getOrderPublic(decodeURIComponent(orderMatch[1]));
        sendJson(200, { success: true, order: view });
        return true;
      }

      sendJson(404, { success: false, error: 'Endpoint tidak ditemukan' });
      return true;
    } catch (err) {
      if (err instanceof ShopError) {
        sendJson(err.status, { success: false, code: err.code, error: err.message });
      } else {
        // Detail internal hanya ke log server, tidak ke klien
        console.error('[shop] error tak terduga:', err instanceof Error ? err.message : err);
        sendJson(500, { success: false, error: 'Terjadi kesalahan pada server' });
      }
      return true;
    }
  };

  function tooMany(sendJson: (s: number, p: unknown, e?: Record<string, string>) => void): boolean {
    sendJson(429, { success: false, error: 'Terlalu banyak permintaan. Coba lagi sebentar.' }, { 'Retry-After': '30' });
    return true;
  }

  async function handleAdmin(
    req: IncomingMessage,
    pathname: string,
    method: string,
    url: URL,
    sendJson: (s: number, p: unknown, e?: Record<string, string>) => void
  ): Promise<boolean> {
    if (pathname === '/api/shop-admin/status' && method === 'GET') {
      sendJson(200, { success: true, ...describeConfig(config), settings: service.getSettings() });
      return true;
    }
    if (pathname === '/api/shop-admin/settings') {
      if (method === 'GET') {
        sendJson(200, { success: true, settings: service.getSettings() });
        return true;
      }
      if (method === 'PUT') {
        const saved = await service.saveSettings(await readJsonBody(req));
        sendJson(200, { success: true, settings: saved });
        return true;
      }
    }
    if (pathname === '/api/shop-admin/orders' && method === 'GET') {
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 500);
      sendJson(200, { success: true, orders: service.listOrdersForAdmin(limit) });
      return true;
    }
    const actionMatch = pathname.match(/^\/api\/shop-admin\/orders\/([^/]+)\/(retry|refresh)$/);
    if (actionMatch && method === 'POST') {
      const id = decodeURIComponent(actionMatch[1]);
      const order = actionMatch[2] === 'retry' ? await service.retryIssuance(id) : await service.refreshOrder(id);
      const { qrString: _omit, ...safe } = order;
      void _omit;
      sendJson(200, { success: true, order: safe });
      return true;
    }
    sendJson(404, { success: false, error: 'Endpoint tidak ditemukan' });
    return true;
  }
}
