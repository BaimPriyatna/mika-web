// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import { createShopHandler } from '../http.ts';
import type { Harness } from './helpers.ts';
import { SERVER_KEY, makeHarness, signedNotification } from './helpers.ts';

interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
  json: Record<string, unknown>;
}

describe('HTTP penjualan online', () => {
  let h: Harness;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    h = await makeHarness();
    const handler = createShopHandler({ service: h.service, config: h.config, staticDir: path.resolve(__dirname, '../../../shop') });
    server = http.createServer(async (req, res) => {
      if (!(await handler(req, res))) {
        res.statusCode = 404;
        res.end('bukan urusan modul penjualan');
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await h.service.idle();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  function call(method: string, p: string, opts: { headers?: Record<string, string>; body?: string | object } = {}): Promise<Reply> {
    return new Promise((resolve, reject) => {
      const payload = opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
      const req = http.request(
        { host: '127.0.0.1', port, method, path: p, headers: { ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}), ...(opts.headers ?? {}) } },
        res => {
          const chunks: Buffer[] = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf-8');
            let json: Record<string, unknown> = {};
            try {
              json = JSON.parse(text);
            } catch {
              // bukan JSON (halaman statis)
            }
            resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json });
          });
        }
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  describe('halaman beli (statis)', () => {
    it('/beli menyajikan halaman dengan CSP ketat dan tanpa skrip/gaya inline', async () => {
      const r = await call('GET', '/beli');
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toContain('text/html');
      expect(r.headers['content-security-policy']).toContain("default-src 'none'");
      expect(r.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.text).toContain('WIFI TKJ');
      expect(r.text).not.toMatch(/<script(?![^>]*\bsrc=)/i); // tidak ada skrip inline
      expect(r.text).not.toMatch(/\sstyle=/i);
      expect(r.text).not.toMatch(/voucher/i); // istilah pelanggan: "akun"
    });

    it('aset css dan js tersedia; metode selain GET/HEAD ditolak; path lain tidak ditangani', async () => {
      expect((await call('GET', '/beli/shop.css')).headers['content-type']).toContain('text/css');
      expect((await call('GET', '/beli/shop.js')).headers['content-type']).toContain('javascript');
      expect((await call('POST', '/beli')).status).toBe(405);
      expect((await call('GET', '/beli/../server/shop/config.ts')).status).toBe(404);
      expect((await call('GET', '/beli/rahasia.txt')).status).toBe(404);
      expect((await call('GET', '/lain')).text).toBe('bukan urusan modul penjualan');
    });
  });

  describe('API publik', () => {
    it('GET paket: hanya paket aktif, tanpa data internal', async () => {
      const r = await call('GET', '/api/shop/packages');
      expect(r.status).toBe(200);
      expect(r.json.enabled).toBe(true);
      expect((r.json.packages as unknown[]).length).toBe(2);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.text).not.toContain('profileName');
      expect(r.text).not.toContain(SERVER_KEY);
    });

    it('POST pesanan: 201, harga server meski browser mengirim harga lain', async () => {
      const r = await call('POST', '/api/shop/orders', { body: { packageId: 'plan-1h', price: 1 } });
      expect(r.status).toBe(201);
      const order = r.json.order as { amount: number; state: string; code?: string };
      expect(order.amount).toBe(5000);
      expect(order.state).toBe('waiting_payment');
      expect(order.code).toBeUndefined();
    });

    it('Idempotency-Key yang sama mengembalikan pesanan yang sama', async () => {
      const headers = { 'Idempotency-Key': 'klik-ganda-12345678' };
      const a = await call('POST', '/api/shop/orders', { body: { packageId: 'plan-1h' }, headers });
      const b = await call('POST', '/api/shop/orders', { body: { packageId: 'plan-1h' }, headers });
      expect((a.json.order as { id: string }).id).toBe((b.json.order as { id: string }).id);
      expect(h.midtrans.charges).toHaveLength(1);
    });

    it('validasi: JSON rusak 400, paket tidak ada 400, isi terlalu besar 413', async () => {
      expect((await call('POST', '/api/shop/orders', { body: '{rusak' })).status).toBe(400);
      expect((await call('POST', '/api/shop/orders', { body: { packageId: 'tidak-ada' } })).status).toBe(400);
      const big = await call('POST', '/api/shop/orders', { body: JSON.stringify({ packageId: 'x'.repeat(70 * 1024) }) });
      expect(big.status).toBe(413);
    });

    it('pembatasan laju: pesanan ke-9 dalam semenit dari IP yang sama ditolak 429', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 9; i++) {
        statuses.push((await call('POST', '/api/shop/orders', { body: { packageId: 'plan-1h' } })).status);
      }
      expect(statuses.slice(0, 8).every(s => s === 201)).toBe(true);
      expect(statuses[8]).toBe(429);
    });

    it('GET pesanan: ID rusak 400, tidak ada 404, ada 200', async () => {
      expect((await call('GET', '/api/shop/orders/abc')).status).toBe(400);
      expect((await call('GET', '/api/shop/orders/WT-' + 'z'.repeat(22))).status).toBe(404);
      const created = await call('POST', '/api/shop/orders', { body: { packageId: 'plan-1h' } });
      const id = (created.json.order as { id: string }).id;
      const r = await call('GET', `/api/shop/orders/${id}`);
      expect(r.status).toBe(200);
      expect((r.json.order as { state: string }).state).toBe('waiting_payment');
    });

    it('kesalahan tak terduga: 500 umum tanpa membocorkan detail internal', async () => {
      const original = h.service.getOrderPublic.bind(h.service);
      h.service.getOrderPublic = async () => {
        throw new Error('gagal baca /var/data/rahasia.db');
      };
      const r = await call('GET', '/api/shop/orders/WT-' + 'a'.repeat(22));
      h.service.getOrderPublic = original;
      expect(r.status).toBe(500);
      expect(r.text).not.toContain('rahasia');
      expect(r.text).not.toContain('/var/data');
    });

    it('endpoint tidak dikenal di bawah /api/shop/: 404 JSON', async () => {
      const r = await call('GET', '/api/shop/tidak-ada');
      expect(r.status).toBe(404);
      expect(r.json.success).toBe(false);
    });
  });

  describe('CORS untuk halaman beli yang disajikan router', () => {
    const ORIGIN = 'http://hotspot.tkj';

    it('preflight dari origin terdaftar: 204 dengan metode dan header yang diizinkan (termasuk Idempotency-Key)', async () => {
      const r = await call('OPTIONS', '/api/shop/orders', {
        headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,idempotency-key' },
      });
      expect(r.status).toBe(204);
      expect(r.headers['access-control-allow-origin']).toBe(ORIGIN);
      expect(r.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
      expect(r.headers['access-control-allow-headers']).toBe('Content-Type, Idempotency-Key');
      expect(r.headers['vary']).toContain('Origin');
    });

    it('preflight dari origin lain atau tanpa Origin: ditolak, tanpa header CORS', async () => {
      const evil = await call('OPTIONS', '/api/shop/orders', { headers: { Origin: 'http://evil.example' } });
      expect(evil.status).toBe(403);
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();
      expect((await call('OPTIONS', '/api/shop/orders')).status).toBe(403);
    });

    it('permintaan nyata dari origin terdaftar mendapat header CORS; dari origin lain tidak', async () => {
      const ok = await call('GET', '/api/shop/packages', { headers: { Origin: ORIGIN } });
      expect(ok.status).toBe(200);
      expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);

      const evil = await call('GET', '/api/shop/packages', { headers: { Origin: 'http://evil.example' } });
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();
      expect(evil.headers['vary']).toContain('Origin');

      const post = await call('POST', '/api/shop/orders', { body: { packageId: 'plan-1h' }, headers: { Origin: ORIGIN } });
      expect(post.status).toBe(201);
      expect(post.headers['access-control-allow-origin']).toBe(ORIGIN);
    });

    it('tidak pernah wildcard', async () => {
      const r = await call('GET', '/api/shop/packages', { headers: { Origin: ORIGIN } });
      expect(r.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('API admin dan webhook TIDAK mendapat CORS walau origin terdaftar', async () => {
      const admin = await call('GET', '/api/shop-admin/status', { headers: { Origin: ORIGIN } });
      expect(admin.headers['access-control-allow-origin']).toBeUndefined();
      const preAdmin = await call('OPTIONS', '/api/shop-admin/settings', { headers: { Origin: ORIGIN } });
      expect(preAdmin.headers['access-control-allow-origin']).toBeUndefined();
      const hook = await call('POST', '/api/shop/webhook/midtrans', { body: { a: 1 }, headers: { Origin: ORIGIN } });
      expect(hook.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('webhook Midtrans', () => {
    it('tanda tangan salah: 401, pesanan tetap pending', async () => {
      const created = await call('POST', '/api/shop/orders', { body: { packageId: 'plan-1h' } });
      const id = (created.json.order as { id: string }).id;
      const forged = signedNotification(id, 'settlement', '5000.00', {}, 'SB-Mid-server-ATTACKER');
      const r = await call('POST', '/api/shop/webhook/midtrans', { body: forged });
      expect(r.status).toBe(401);
      expect(h.store.getOrder(id)?.paymentStatus).toBe('pending');
    });

    it('format salah 400; metode GET 405', async () => {
      expect((await call('POST', '/api/shop/webhook/midtrans', { body: { a: 1 } })).status).toBe(400);
      expect((await call('GET', '/api/shop/webhook/midtrans')).status).toBe(405);
    });

    it('notifikasi valid: 200, pesanan dibayar, akun terbit, kode muncul di status', async () => {
      const created = await call('POST', '/api/shop/orders', { body: { packageId: 'plan-1h' } });
      const id = (created.json.order as { id: string }).id;
      const r = await call('POST', '/api/shop/webhook/midtrans', { body: signedNotification(id, 'settlement', '5000.00') });
      expect(r.status).toBe(200);
      await h.service.idle();

      const status = await call('GET', `/api/shop/orders/${id}`);
      const order = status.json.order as { state: string; code: string };
      expect(order.state).toBe('ready');
      expect(order.code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
      expect(h.router.onlineUsers()).toHaveLength(1);
    });

    it('pesanan tidak dikenal 404; nominal berbeda 400', async () => {
      expect((await call('POST', '/api/shop/webhook/midtrans', { body: signedNotification('WT-' + 'q'.repeat(22), 'settlement', '5000.00') })).status).toBe(404);
      const created = await call('POST', '/api/shop/orders', { body: { packageId: 'plan-1h' } });
      const id = (created.json.order as { id: string }).id;
      expect((await call('POST', '/api/shop/webhook/midtrans', { body: signedNotification(id, 'settlement', '1.00') })).status).toBe(400);
    });
  });

  describe('API admin', () => {
    it('dari mesin server: status, pengaturan, daftar transaksi; server key tidak pernah ikut', async () => {
      const status = await call('GET', '/api/shop-admin/status');
      expect(status.status).toBe(200);
      expect(status.json).toMatchObject({ providerConfigured: true, environment: 'sandbox' });
      expect(status.text).not.toContain(SERVER_KEY);

      const orders = await call('GET', '/api/shop-admin/orders');
      expect(orders.status).toBe(200);
      expect(orders.text).not.toContain(SERVER_KEY);
    });

    it('permintaan lewat proxy/tunnel (header penerusan) ditolak 403 untuk semua endpoint admin', async () => {
      for (const header of ['X-Forwarded-For', 'Forwarded', 'X-Real-IP', 'CF-Connecting-IP', 'Via']) {
        const r = await call('GET', '/api/shop-admin/status', { headers: { [header]: '203.0.113.7' } });
        expect(r.status).toBe(403);
        expect(r.text).not.toContain('providerConfigured');
      }
      expect((await call('PUT', '/api/shop-admin/settings', { body: { enabled: false }, headers: { 'X-Forwarded-For': '1.2.3.4' } })).status).toBe(403);
      expect((await call('POST', '/api/shop-admin/orders/WT-x/retry', { headers: { 'X-Forwarded-For': '1.2.3.4' } })).status).toBe(403);
    });

    it('perubahan data dari Origin lain ditolak (CSRF); dari origin sendiri diterima', async () => {
      const settings = { enabled: true, paymentExpiryMinutes: 20, packages: [] };
      const evil = await call('PUT', '/api/shop-admin/settings', { body: settings, headers: { Origin: 'http://evil.example' } });
      expect(evil.status).toBe(403);
      expect(h.store.getSettings().paymentExpiryMinutes).toBe(15);

      const ok = await call('PUT', '/api/shop-admin/settings', { body: settings, headers: { Origin: `http://127.0.0.1:${port}`, Host: `127.0.0.1:${port}` } });
      expect(ok.status).toBe(200);
      expect(h.store.getSettings().paymentExpiryMinutes).toBe(20);
    });

    it('pengaturan tidak valid 400; aksi pada pesanan tidak ada 404', async () => {
      const bad = await call('PUT', '/api/shop-admin/settings', { body: { enabled: true, paymentExpiryMinutes: 1, packages: [] } });
      expect(bad.status).toBe(400);
      expect((await call('POST', '/api/shop-admin/orders/WT-' + 'a'.repeat(22) + '/retry')).status).toBe(404);
    });

    it('retry dan refresh dari admin bekerja untuk pesanan yang dibayar saat router offline', async () => {
      h.router.offline = true;
      const created = await call('POST', '/api/shop/orders', { body: { packageId: 'plan-1h' } });
      const id = (created.json.order as { id: string }).id;
      await call('POST', '/api/shop/webhook/midtrans', { body: signedNotification(id, 'settlement', '5000.00') });
      await h.service.idle();
      expect(h.store.getOrder(id)?.issuanceStatus).toBe('retry_pending');

      h.router.offline = false;
      const r = await call('POST', `/api/shop-admin/orders/${id}/retry`);
      expect(r.status).toBe(200);
      expect((r.json.order as { issuanceStatus: string; qrString?: string }).issuanceStatus).toBe('issued');
      expect(r.json.order).not.toHaveProperty('qrString');
    });
  });
});
