import * as path from 'node:path';

export interface RouterCredentials {
  host: string;
  port?: number;
  username: string;
  password: string;
  protocol: 'auto' | 'rest' | 'binary';
}

export interface ShopConfig {
  midtransServerKey: string;
  midtransIsProduction: boolean;
  midtransQrisAcquirer: string;
  dataDir: string;
  /** URL halaman login hotspot (tanpa kredensial), untuk tombol "Buka halaman login" */
  hotspotLoginUrl: string;
  /** Kredensial router milik SERVER. Tidak pernah dikirim ke browser maupun disimpan di database transaksi. */
  router: RouterCredentials | null;
  adminAllowedIps: string[];
  retry: { intervalMs: number; maxAttempts: number; baseDelayMs: number; maxDelayMs: number };
  retentionDays: number;
}

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : fallback;
}

export function loadShopConfig(env: Record<string, string | undefined> = process.env): ShopConfig {
  const host = env.ROUTER_HOST?.trim();
  const username = env.ROUTER_USER?.trim();
  const password = env.ROUTER_PASSWORD ?? '';
  const protocol = env.ROUTER_PROTOCOL;

  return {
    midtransServerKey: env.MIDTRANS_SERVER_KEY?.trim() ?? '',
    midtransIsProduction: env.MIDTRANS_IS_PRODUCTION === 'true',
    midtransQrisAcquirer: env.MIDTRANS_QRIS_ACQUIRER?.trim() || 'gopay',
    dataDir: path.resolve(env.SHOP_DATA_DIR?.trim() || 'data'),
    hotspotLoginUrl: env.HOTSPOT_LOGIN_URL?.trim() ?? '',
    router:
      host && username
        ? {
            host,
            port: env.ROUTER_PORT ? Number(env.ROUTER_PORT) : undefined,
            username,
            password,
            protocol: protocol === 'rest' || protocol === 'binary' ? protocol : 'auto',
          }
        : null,
    adminAllowedIps: (env.ADMIN_ALLOWED_IPS ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
    retry: {
      intervalMs: int(env.SHOP_RETRY_INTERVAL_MS, 30_000, 1000, 600_000),
      maxAttempts: int(env.SHOP_RETRY_MAX_ATTEMPTS, 30, 1, 1000),
      baseDelayMs: int(env.SHOP_RETRY_BASE_DELAY_MS, 30_000, 100, 600_000),
      maxDelayMs: int(env.SHOP_RETRY_MAX_DELAY_MS, 600_000, 1000, 3_600_000),
    },
    retentionDays: int(env.SHOP_RETENTION_DAYS, 90, 1, 3650),
  };
}

/** Ringkasan konfigurasi untuk dashboard admin: hanya boolean/nilai tidak sensitif, tanpa secret. */
export function describeConfig(config: ShopConfig) {
  return {
    providerConfigured: config.midtransServerKey.length > 0,
    environment: config.midtransIsProduction ? 'production' : 'sandbox',
    routerConfigured: config.router !== null,
    routerHost: config.router?.host ?? null,
    hotspotLoginUrlConfigured: config.hotspotLoginUrl.length > 0,
    retentionDays: config.retentionDays,
  };
}
