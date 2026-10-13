/**
 * Klien API administrasi penjualan online (/api/shop-admin/*).
 * Endpoint ini hanya bisa dijangkau dari perangkat server (lihat server/security.ts).
 */

export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'failed' | 'cancelled';
export type IssuanceStatus = 'not_issued' | 'issuing' | 'issued' | 'retry_pending' | 'issue_failed';

export interface SellablePackage {
  id: string;
  label: string;
  price: number;
  profileName: string;
  validityMinutes: number | null;
  enabled: boolean;
}

export interface ShopSettings {
  enabled: boolean;
  paymentExpiryMinutes: number;
  packages: SellablePackage[];
}

export interface ShopStatus {
  providerConfigured: boolean;
  environment: 'sandbox' | 'production';
  routerConfigured: boolean;
  routerHost: string | null;
  hotspotLoginUrlConfigured: boolean;
  retentionDays: number;
  settings: ShopSettings;
}

export interface AdminOrder {
  id: string;
  packageId: string;
  packageName: string;
  amount: number;
  paymentStatus: PaymentStatus;
  issuanceStatus: IssuanceStatus;
  voucherCode?: string;
  issueAttempts: number;
  lastError?: string;
  anomalies: string[];
  refunded?: boolean;
  createdAt: number;
  paidAt?: number;
  issuedAt?: number;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    // respons bukan JSON
  }
  if (!res.ok || json.success === false) {
    throw new Error(typeof json.error === 'string' ? json.error : `Permintaan gagal (HTTP ${res.status})`);
  }
  return json as T;
}

export const shopAdminApi = {
  getStatus: () => request<ShopStatus & { success: true }>('GET', '/api/shop-admin/status'),
  saveSettings: (settings: ShopSettings) =>
    request<{ success: true; settings: ShopSettings }>('PUT', '/api/shop-admin/settings', settings),
  listOrders: (limit = 100) =>
    request<{ success: true; orders: AdminOrder[] }>('GET', `/api/shop-admin/orders?limit=${limit}`),
  retryIssuance: (id: string) =>
    request<{ success: true; order: AdminOrder }>('POST', `/api/shop-admin/orders/${encodeURIComponent(id)}/retry`),
  refreshOrder: (id: string) =>
    request<{ success: true; order: AdminOrder }>('POST', `/api/shop-admin/orders/${encodeURIComponent(id)}/refresh`),
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: 'Menunggu bayar',
  paid: 'Dibayar',
  expired: 'Kedaluwarsa',
  failed: 'Gagal',
  cancelled: 'Dibatalkan',
};

export const ISSUANCE_LABEL: Record<IssuanceStatus, string> = {
  not_issued: 'Belum diterbitkan',
  issuing: 'Sedang dibuat',
  issued: 'Sudah terbit',
  retry_pending: 'Menunggu coba ulang',
  issue_failed: 'Gagal, perlu tindakan',
};

export function formatRupiah(amount: number): string {
  return 'Rp ' + Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Pesanan sudah dibayar tetapi akunnya belum ada di router: butuh perhatian admin */
export function needsAttention(order: AdminOrder): boolean {
  return order.paymentStatus === 'paid' && order.issuanceStatus !== 'issued';
}

/**
 * Gabungkan paket lokal (Dexie) dengan pengaturan di server untuk ditampilkan sebagai baris editor.
 * Harga default mengikuti paket lokal; yang sudah pernah diatur di server dipertahankan.
 */
export interface PackageRow {
  id: string;
  label: string;
  profileName: string;
  validityMinutes: number | null;
  price: number;
  selected: boolean;
  /** true jika paket sudah tidak ada di paket lokal tetapi masih terdaftar di server */
  orphan: boolean;
}

export function buildPackageRows(
  plans: Array<{ id?: string; label: string; profileName: string; price: number }>,
  saved: SellablePackage[],
  validityByProfile: Record<string, number | null>
): PackageRow[] {
  const savedById = new Map(saved.map(p => [p.id, p]));
  const rows: PackageRow[] = [];
  const seen = new Set<string>();

  for (const plan of plans) {
    if (!plan.id) continue;
    seen.add(plan.id);
    const s = savedById.get(plan.id);
    rows.push({
      id: plan.id,
      label: plan.label,
      profileName: plan.profileName,
      validityMinutes:
        plan.profileName in validityByProfile ? validityByProfile[plan.profileName] : (s?.validityMinutes ?? null),
      price: s?.price ?? plan.price,
      selected: s ? s.enabled : false,
      orphan: false,
    });
  }
  for (const s of saved) {
    if (seen.has(s.id)) continue;
    rows.push({
      id: s.id,
      label: s.label,
      profileName: s.profileName,
      validityMinutes: s.validityMinutes,
      price: s.price,
      selected: s.enabled,
      orphan: true,
    });
  }
  return rows;
}

export function rowsToPackages(rows: PackageRow[]): SellablePackage[] {
  return rows
    .filter(r => r.selected)
    .map(r => ({
      id: r.id,
      label: r.label,
      price: Math.round(r.price),
      profileName: r.profileName,
      validityMinutes: r.validityMinutes,
      enabled: true,
    }));
}
