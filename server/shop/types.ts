/**
 * Tipe data penjualan voucher online.
 * Status pembayaran dan status penerbitan voucher sengaja DIPISAH: pembayaran bisa berhasil
 * saat MikroTik sedang tidak terjangkau.
 */

export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'failed' | 'cancelled';

export type IssuanceStatus =
  | 'not_issued'
  | 'issuing'
  | 'issued'
  | 'retry_pending'
  | 'issue_failed';

/** Paket yang boleh dijual online. Harga di sini (server) adalah satu-satunya sumber harga. */
export interface SellablePackage {
  /** Sama dengan id paket di aplikasi admin (dipakai juga di comment user router sebagai plan=) */
  id: string;
  label: string;
  /** Rupiah, bilangan bulat */
  price: number;
  /** Nama profil hotspot di router */
  profileName: string;
  /** Masa berlaku dalam menit (untuk tampilan); null jika profil tanpa masa berlaku */
  validityMinutes: number | null;
  enabled: boolean;
}

export interface ShopSettings {
  enabled: boolean;
  paymentExpiryMinutes: number;
  packages: SellablePackage[];
}

export interface Order {
  /** ID internal sekaligus order_id di provider */
  id: string;
  packageId: string;
  /** Snapshot saat pesanan dibuat */
  packageName: string;
  profileName: string;
  validityMinutes: number | null;
  amount: number;
  currency: 'IDR';
  provider: string;

  providerTransactionId?: string;
  qrString?: string;
  paymentExpiresAt: number;

  paymentStatus: PaymentStatus;
  issuanceStatus: IssuanceStatus;

  /** Kode akun (username = password). Sama dengan username di router, jadi bukan rahasia tambahan. */
  voucherCode?: string;

  issueAttempts: number;
  nextRetryAt?: number;
  lastError?: string;
  /** Catatan kejanggalan (nominal tidak cocok, status tak dikenal, refund). Dibatasi jumlahnya. */
  anomalies: string[];
  refunded?: boolean;
  lastGatewayCheckAt?: number;

  createdAt: number;
  updatedAt: number;
  paidAt?: number;
  issuedAt?: number;
}

export interface StoreData {
  version: 1;
  settings: ShopSettings;
  orders: Record<string, Order>;
  idempotency: Record<string, { orderId: string; at: number }>;
}

/** Kesalahan yang aman ditampilkan ke pemanggil (tanpa detail internal). */
export class ShopError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ShopError';
    this.status = status;
    this.code = code;
  }
}

export const DEFAULT_SETTINGS: ShopSettings = {
  enabled: false,
  paymentExpiryMinutes: 15,
  packages: [],
};

/** Batas harga yang masuk akal untuk voucher hotspot (Rupiah) */
export const MIN_PRICE = 1000;
export const MAX_PRICE = 1_000_000;
