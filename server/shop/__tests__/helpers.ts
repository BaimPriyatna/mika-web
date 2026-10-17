import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ShopConfig } from '../config.ts';
import { VoucherIssuer } from '../issuer.ts';
import { MidtransGateway } from '../midtrans.ts';
import type { RouterPort } from '../router-port.ts';
import { ShopService } from '../service.ts';
import { ShopStore } from '../store.ts';
import type { SellablePackage, ShopSettings } from '../types.ts';

export const SERVER_KEY = 'SB-Mid-server-TESTKEY123';

export function baseConfig(overrides: Partial<ShopConfig> = {}): ShopConfig {
  return {
    midtransServerKey: SERVER_KEY,
    midtransIsProduction: false,
    midtransQrisAcquirer: 'gopay',
    dataDir: '',
    hotspotLoginUrl: 'http://hotspot.tkj/login',
    router: null,
    adminAllowedIps: [],
    shopAllowedOrigins: ['http://hotspot.tkj', 'http://192.168.100.1'],
    retry: { intervalMs: 1000, maxAttempts: 4, baseDelayMs: 1000, maxDelayMs: 8000 },
    retentionDays: 90,
    ...overrides,
  };
}

export const PKG_1H: SellablePackage = {
  id: 'plan-1h',
  label: 'Paket 1 Jam',
  price: 5000,
  profileName: '1jam',
  validityMinutes: 60,
  enabled: true,
};

export const PKG_3H: SellablePackage = {
  id: 'plan-3h',
  label: 'Paket 3 Jam',
  price: 10000,
  profileName: '3jam',
  validityMinutes: 180,
  enabled: true,
};

export function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'shop-test-'));
}

/** Router palsu di memori: menyimpan user hotspot, bisa dibuat offline atau gagal menulis. */
export class FakeRouter implements RouterPort {
  users: Array<Record<string, string>> = [];
  profiles: Array<Record<string, string>> = [
    { name: '1jam', 'session-timeout': '1h', 'shared-users': '1' },
    { name: '3jam', 'session-timeout': '3h', 'shared-users': '1' },
  ];
  offline = false;
  adds = 0;
  /** Jika true: akun benar-benar dibuat di router tetapi add() melempar error (balasan hilang) */
  addCreatesThenThrows = false;
  /** Jika true: add() "berhasil" tetapi akun tidak tersimpan (verifikasi harus menangkapnya) */
  addDropsSilently = false;
  log: string[] = [];

  async ensureConnected() {
    if (this.offline) throw new Error('Router tidak terjangkau');
  }

  async print(path: string, query?: Record<string, string>) {
    await this.ensureConnected();
    if (path === '/ip/hotspot/user/profile') return this.profiles.map(x => ({ ...x }));
    if (path === '/ip/hotspot/user') {
      return this.users.filter(u => !query?.name || u.name === query.name).map(u => ({ ...u }));
    }
    return [];
  }

  async add(_path: string, body: Record<string, string>) {
    await this.ensureConnected();
    this.log.push('add:' + body.name);
    this.adds++;
    if (this.addDropsSilently) return '*x';
    this.users.push({ '.id': '*' + this.users.length, ...body });
    if (this.addCreatesThenThrows) {
      this.addCreatesThenThrows = false;
      throw new Error('Koneksi terputus saat membaca data');
    }
    return '*' + (this.users.length - 1);
  }

  onlineUsers() {
    return this.users.filter(u => (u.comment ?? '').includes('sale=online'));
  }
}

export interface MidtransMock {
  fetch: typeof fetch;
  charges: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }>;
  statusCalls: string[];
  /** order_id -> status yang dikembalikan GET /status */
  statuses: Map<string, { transaction_status: string; gross_amount?: string }>;
  /** order_id yang pemeriksaan statusnya dibuat gagal (HTTP 500) */
  statusFailures: Set<string>;
  failCharge: boolean;
}

export function makeMidtransMock(): MidtransMock {
  const mock: MidtransMock = {
    charges: [],
    statusCalls: [],
    statuses: new Map(),
    statusFailures: new Set(),
    failCharge: false,
    fetch: (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

      if (url.endsWith('/v2/charge') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        mock.charges.push({ url, headers, body });
        if (mock.failCharge) return json(400, { status_code: '400', status_message: 'Validation error' });
        const details = body.transaction_details as { order_id: string };
        return json(200, {
          status_code: '201',
          status_message: 'QRIS transaction is created',
          transaction_id: 'tx-' + details.order_id,
          order_id: details.order_id,
          payment_type: 'qris',
          transaction_status: 'pending',
          qr_string: '00020101021226620014COM.GO-JEK.WWW0119936009143490526303402',
        });
      }

      const m = url.match(/\/v2\/([^/]+)\/status$/);
      if (m && (!init || init.method === 'GET')) {
        const orderId = decodeURIComponent(m[1]);
        mock.statusCalls.push(orderId);
        if (mock.statusFailures.has(orderId)) return json(500, { status_code: '500' });
        const s = mock.statuses.get(orderId);
        if (!s) return json(404, { status_code: '404', status_message: "Transaction doesn't exist." });
        return json(200, {
          status_code: '200',
          order_id: orderId,
          transaction_id: 'tx-' + orderId,
          transaction_status: s.transaction_status,
          gross_amount: s.gross_amount ?? '5000.00',
        });
      }
      return json(500, { status_code: '500' });
    }) as typeof fetch,
  };
  return mock;
}

/** Notifikasi HTTP Midtrans yang ditandatangani dengan benar. */
export function signedNotification(
  orderId: string,
  transactionStatus: string,
  grossAmount: string,
  extra: Record<string, unknown> = {},
  serverKey = SERVER_KEY
) {
  const statusCode = '200';
  const signature_key = createHash('sha512').update(orderId + statusCode + grossAmount + serverKey).digest('hex');
  return {
    order_id: orderId,
    transaction_id: 'tx-' + orderId,
    transaction_status: transactionStatus,
    status_code: statusCode,
    gross_amount: grossAmount,
    payment_type: 'qris',
    signature_key,
    ...extra,
  };
}

export interface Harness {
  service: ShopService;
  store: ShopStore;
  router: FakeRouter;
  midtrans: MidtransMock;
  config: ShopConfig;
  clock: { now: number };
  logs: string[];
  dir: string;
}

export async function makeHarness(options: {
  settings?: Partial<ShopSettings>;
  config?: Partial<ShopConfig>;
  serverKey?: string;
} = {}): Promise<Harness> {
  const dir = tmpDir();
  const config = baseConfig({ dataDir: dir, ...(options.config ?? {}) });
  if (options.serverKey !== undefined) config.midtransServerKey = options.serverKey;
  const store = await ShopStore.open(dir);
  await store.saveSettings({
    enabled: true,
    paymentExpiryMinutes: 15,
    packages: [PKG_1H, PKG_3H],
    ...(options.settings ?? {}),
  });
  const midtrans = makeMidtransMock();
  const gateway = new MidtransGateway({
    serverKey: config.midtransServerKey,
    isProduction: false,
    fetchFn: midtrans.fetch,
  });
  const router = new FakeRouter();
  const clock = { now: 1_800_000_000_000 };
  const logs: string[] = [];
  const service = new ShopService({
    store,
    gateway,
    issuer: new VoucherIssuer(router),
    config,
    now: () => clock.now,
    log: (m, d) => logs.push(m + (d ? ' ' + JSON.stringify(d) : '')),
  });
  return { service, store, router, midtrans, config, clock, logs, dir };
}
