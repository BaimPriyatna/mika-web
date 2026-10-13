import type { PaymentStatus } from './types.ts';

export interface CreatePaymentInput {
  orderId: string;
  amount: number;
  itemName: string;
  expiryMinutes: number;
}

export interface PaymentResult {
  providerTransactionId: string;
  /** String QR (EMV/QRIS) dari provider; dirender menjadi gambar oleh backend */
  qrString: string;
}

export interface VerifiedPaymentEvent {
  orderId: string;
  providerTransactionId?: string;
  amount: number;
  /** 'unknown' = status yang tidak dikenali; pesanan tidak diubah, kejadian dicatat */
  status: PaymentStatus | 'unknown';
  rawStatus: string;
  /** Pembayaran sudah diterima lalu dikembalikan (refund/chargeback). Voucher tidak dicabut otomatis. */
  refunded?: boolean;
}

/** Notifikasi tidak lolos verifikasi keaslian (tanda tangan salah). */
export class WebhookAuthError extends Error {
  constructor(message = 'Tanda tangan notifikasi tidak valid') {
    super(message);
    this.name = 'WebhookAuthError';
  }
}

/** Notifikasi bentuknya tidak sesuai format provider. */
export class WebhookFormatError extends Error {
  constructor(message = 'Format notifikasi tidak valid') {
    super(message);
    this.name = 'WebhookFormatError';
  }
}

/** Provider menolak atau gagal merespons. Pesan aman untuk log, bukan untuk pelanggan. */
export class GatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayError';
  }
}

/**
 * Abstraksi penyedia pembayaran. Layanan penjualan hanya bergantung pada antarmuka ini,
 * jadi mengganti Midtrans dengan penyedia lain cukup menambah adapter baru.
 */
export interface PaymentGateway {
  readonly name: string;
  isConfigured(): boolean;
  createPayment(input: CreatePaymentInput): Promise<PaymentResult>;
  /** Verifikasi keaslian + normalisasi notifikasi. Melempar WebhookAuthError / WebhookFormatError. */
  verifyWebhook(payload: unknown): Promise<VerifiedPaymentEvent>;
  /** Tanya status ke provider (cadangan jika webhook tidak sampai). null = provider tidak mengenal pesanan. */
  fetchStatus(orderId: string): Promise<VerifiedPaymentEvent | null>;
}
