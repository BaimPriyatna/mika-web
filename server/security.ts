import type { IncomingMessage } from 'node:http';

/**
 * API administrasi (kontrol router, pengaturan penjualan) TIDAK boleh bisa dijangkau pelanggan,
 * padahal halaman beli harus publik. Aturan akses admin:
 *  - koneksi berasal dari loopback atau dari IP yang ada di ADMIN_ALLOWED_IPS, dan
 *  - tidak membawa header proxy (tunnel/reverse proxy meneruskan trafik publik dari localhost),
 *  - untuk metode yang mengubah data: header Origin (jika ada) harus sama dengan Host (anti CSRF).
 */

const FORWARDING_HEADERS = [
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'forwarded',
  'via',
  'cf-connecting-ip',
  'true-client-ip',
];

export function normalizeIp(ip: string | undefined): string {
  if (!ip) return '';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function isLoopback(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.');
}

export function isAdminRequest(req: IncomingMessage, allowedIps: string[] = []): boolean {
  const remote = normalizeIp(req.socket.remoteAddress);
  if (!remote) return false;
  if (!isLoopback(remote) && !allowedIps.includes(remote)) return false;

  for (const header of FORWARDING_HEADERS) {
    if (req.headers[header] !== undefined) return false;
  }

  const method = (req.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) return false;
      } catch {
        return false;
      }
    }
  }
  return true;
}

/** Daftar IP admin tambahan dari environment (dibaca saat permintaan masuk, bukan saat start). */
export function adminAllowedIpsFromEnv(): string[] {
  return (process.env.ADMIN_ALLOWED_IPS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}
