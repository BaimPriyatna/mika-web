// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as http from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { handleApiRequest } from '../api-handler.ts';
import { adminAllowedIpsFromEnv, isAdminRequest, isLoopback, normalizeIp } from '../security.ts';

function fakeReq(remote: string | undefined, headers: Record<string, string> = {}, method = 'GET'): IncomingMessage {
  return { socket: { remoteAddress: remote }, headers, method } as unknown as IncomingMessage;
}

describe('isAdminRequest', () => {
  it('loopback IPv4, IPv6, dan IPv4-mapped diizinkan', () => {
    expect(isAdminRequest(fakeReq('127.0.0.1'))).toBe(true);
    expect(isAdminRequest(fakeReq('::1'))).toBe(true);
    expect(isAdminRequest(fakeReq('::ffff:127.0.0.1'))).toBe(true);
  });

  it('IP jaringan hotspot/LAN ditolak kecuali ada di daftar yang diizinkan', () => {
    expect(isAdminRequest(fakeReq('192.168.100.25'))).toBe(false);
    expect(isAdminRequest(fakeReq('10.0.0.5'))).toBe(false);
    expect(isAdminRequest(fakeReq('192.168.100.25'), ['192.168.100.25'])).toBe(true);
    expect(isAdminRequest(fakeReq('192.168.100.26'), ['192.168.100.25'])).toBe(false);
    expect(isAdminRequest(fakeReq('::ffff:192.168.100.25'), ['192.168.100.25'])).toBe(true);
  });

  it('tanpa alamat asal: ditolak', () => {
    expect(isAdminRequest(fakeReq(undefined))).toBe(false);
  });

  it.each(['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'forwarded', 'via', 'cf-connecting-ip', 'true-client-ip'])(
    'header penerusan %s menandakan trafik lewat proxy/tunnel: ditolak walau dari localhost',
    header => {
      expect(isAdminRequest(fakeReq('127.0.0.1', { [header]: '203.0.113.9' }))).toBe(false);
    }
  );

  it('metode yang mengubah data: Origin harus sama dengan Host', () => {
    const base = { host: 'localhost:5173' };
    expect(isAdminRequest(fakeReq('127.0.0.1', { ...base, origin: 'http://localhost:5173' }, 'POST'))).toBe(true);
    expect(isAdminRequest(fakeReq('127.0.0.1', { ...base, origin: 'http://evil.example' }, 'POST'))).toBe(false);
    expect(isAdminRequest(fakeReq('127.0.0.1', { ...base, origin: 'bukan-url' }, 'PUT'))).toBe(false);
    expect(isAdminRequest(fakeReq('127.0.0.1', base, 'POST'))).toBe(true); // alat non-browser tanpa Origin
    expect(isAdminRequest(fakeReq('127.0.0.1', { ...base, origin: 'http://evil.example' }, 'GET'))).toBe(true); // baca saja
  });

  it('helper IP', () => {
    expect(normalizeIp('::ffff:10.1.2.3')).toBe('10.1.2.3');
    expect(isLoopback('127.5.5.5')).toBe(true);
    expect(isLoopback('128.0.0.1')).toBe(false);
  });

  it('ADMIN_ALLOWED_IPS dibaca dari environment saat dipanggil', () => {
    const before = process.env.ADMIN_ALLOWED_IPS;
    process.env.ADMIN_ALLOWED_IPS = ' 10.0.0.2 , 10.0.0.3,, ';
    expect(adminAllowedIpsFromEnv()).toEqual(['10.0.0.2', '10.0.0.3']);
    if (before === undefined) delete process.env.ADMIN_ALLOWED_IPS;
    else process.env.ADMIN_ALLOWED_IPS = before;
  });
});

describe('API kontrol router (/api/router/*) dilindungi', () => {
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    server = http.createServer(async (req, res) => {
      if (!(await handleApiRequest(req, res))) {
        res.statusCode = 404;
        res.end('lain');
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  function get(path: string, headers: Record<string, string> = {}, method = 'GET'): Promise<{ status: number; headers: http.IncomingHttpHeaders; text: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path, method, headers }, res => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text: Buffer.concat(chunks).toString() }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  it('dari localhost: diproses', async () => {
    const r = await get('/api/router/status');
    expect(r.status).toBe(200);
  });

  it('lewat proxy/tunnel: 403 untuk status, overview, query, connect, disconnect', async () => {
    const fwd = { 'X-Forwarded-For': '198.51.100.20' };
    for (const [p, m] of [
      ['/api/router/status', 'GET'],
      ['/api/router/overview', 'GET'],
      ['/api/router/query', 'POST'],
      ['/api/router/connect', 'POST'],
      ['/api/router/disconnect', 'POST'],
      ['/api/router/scan', 'GET'],
    ] as const) {
      const r = await get(p, fwd, m);
      expect(r.status, `${m} ${p}`).toBe(403);
      expect(r.text).toContain('hanya dari perangkat server');
    }
  });

  it('POST dari Origin lain (CSRF) ditolak', async () => {
    const r = await get('/api/router/disconnect', { Origin: 'http://evil.example', Host: `127.0.0.1:${port}` }, 'POST');
    expect(r.status).toBe(403);
  });

  it('tidak ada header CORS terbuka (Access-Control-Allow-Origin)', async () => {
    const r = await get('/api/router/status');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('path di luar /api/router/ tidak ditangani', async () => {
    expect((await get('/api/lain')).text).toBe('lain');
  });
});
