import { createHash, timingSafeEqual } from 'node:crypto';
import type {
  CreatePaymentInput,
  PaymentGateway,
  PaymentResult,
  VerifiedPaymentEvent,
} from './gateway.ts';
import { GatewayError, WebhookAuthError, WebhookFormatError } from './gateway.ts';
import type { PaymentStatus } from './types.ts';

/**
 * Adapter Midtrans (Core API, QRIS).
 * Rujukan dokumentasi resmi Midtrans:
 *  - Charge: POST {base}/v2/charge dengan Basic Auth (server key sebagai username, password kosong),
 *    payment_type "qris"; respons memuat transaction_id, qr_string, transaction_status "pending".
 *  - Notifikasi HTTP: signature_key = SHA512(order_id + status_code + gross_amount + serverKey).
 *  - Status: GET {base}/v2/{order_id}/status.
 *  - Jangan menyerahkan layanan jika status di Midtrans bukan settlement.
 */

export interface MidtransOptions {
  serverKey: string;
  isProduction: boolean;
  qrisAcquirer?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

type MidtransBody = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined;
}

/** Normalisasi status Midtrans ke status internal. */
export function mapMidtransStatus(
  transactionStatus: string,
  fraudStatus?: string
): { status: PaymentStatus | 'unknown'; refunded?: boolean } {
  switch (transactionStatus) {
    case 'settlement':
      return { status: 'paid' };
    case 'capture':
      // Kartu: capture hanya final jika FDS menerima. QRIS tidak memakai capture.
      return !fraudStatus || fraudStatus === 'accept' ? { status: 'paid' } : { status: 'pending' };
    case 'pending':
      return { status: 'pending' };
    case 'deny':
    case 'failure':
      return { status: 'failed' };
    case 'cancel':
      return { status: 'cancelled' };
    case 'expire':
      return { status: 'expired' };
    case 'refund':
    case 'partial_refund':
    case 'chargeback':
    case 'partial_chargeback':
      // Uang sempat diterima, lalu dikembalikan: dicatat, bukan dianggap pembayaran gagal.
      return { status: 'paid', refunded: true };
    default:
      return { status: 'unknown' };
  }
}

export class MidtransGateway implements PaymentGateway {
  readonly name = 'midtrans';
  private readonly serverKey: string;
  private readonly baseUrl: string;
  private readonly acquirer: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: MidtransOptions) {
    this.serverKey = options.serverKey;
    this.baseUrl = options.isProduction ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
    this.acquirer = options.qrisAcquirer || 'gopay';
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  isConfigured(): boolean {
    return this.serverKey.length > 0;
  }

  /** Pesan error tidak boleh memuat server key, apa pun sumbernya (pesan jaringan, echo dari provider). */
  private fail(message: string): GatewayError {
    const safe = this.serverKey ? message.split(this.serverKey).join('[disembunyikan]') : message;
    return new GatewayError(safe);
  }

  private authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.serverKey}:`).toString('base64');
  }

  private async request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ http: number; json: MidtransBody }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: this.authHeader(),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      let json: MidtransBody = {};
      try {
        json = (await res.json()) as MidtransBody;
      } catch {
        // body kosong / bukan JSON
      }
      return { http: res.status, json };
    } catch (err) {
      const reason = (err as Error).name === 'AbortError' ? 'timeout' : (err as Error).message;
      throw this.fail(`Gagal menghubungi Midtrans (${reason})`);
    } finally {
      clearTimeout(timer);
    }
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const { http, json } = await this.request('POST', '/v2/charge', {
      payment_type: 'qris',
      transaction_details: { order_id: input.orderId, gross_amount: input.amount },
      item_details: [
        { id: input.orderId, price: input.amount, quantity: 1, name: input.itemName.slice(0, 50) },
      ],
      qris: { acquirer: this.acquirer },
      custom_expiry: { expiry_duration: input.expiryMinutes, unit: 'minute' },
    });

    const statusCode = asString(json.status_code);
    // Midtrans memakai status_code "201" untuk charge yang berhasil dibuat
    if (http >= 400 || (statusCode !== '201' && statusCode !== '200')) {
      throw this.fail(
        `Midtrans menolak pembuatan pembayaran (HTTP ${http}, status_code ${statusCode ?? '-'}): ${asString(json.status_message) ?? 'tanpa pesan'}`
      );
    }

    const transactionId = asString(json.transaction_id);
    const qrString = asString(json.qr_string);
    if (!transactionId || !qrString) {
      throw this.fail('Respons Midtrans tidak memuat transaction_id atau qr_string');
    }

    return {
      providerTransactionId: transactionId,
      qrString,
    };
  }

  async verifyWebhook(payload: unknown): Promise<VerifiedPaymentEvent> {
    if (typeof payload !== 'object' || payload === null) {
      throw new WebhookFormatError();
    }
    const p = payload as MidtransBody;
    const orderId = asString(p.order_id);
    const statusCode = asString(p.status_code);
    const grossAmount = asString(p.gross_amount);
    const signature = asString(p.signature_key);
    const transactionStatus = asString(p.transaction_status);

    if (!orderId || !statusCode || !grossAmount || !signature || !transactionStatus) {
      throw new WebhookFormatError();
    }

    // Tanda tangan dihitung dari nilai string persis seperti yang dikirim Midtrans (mis. "5000.00")
    const expected = createHash('sha512')
      .update(orderId + statusCode + grossAmount + this.serverKey)
      .digest('hex');
    const given = Buffer.from(signature.toLowerCase(), 'utf-8');
    const wanted = Buffer.from(expected, 'utf-8');
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
      throw new WebhookAuthError();
    }

    const amount = Number(grossAmount);
    if (!Number.isFinite(amount)) {
      throw new WebhookFormatError('gross_amount bukan angka');
    }

    const mapped = mapMidtransStatus(transactionStatus, asString(p.fraud_status));
    return {
      orderId,
      providerTransactionId: asString(p.transaction_id),
      amount,
      status: mapped.status,
      rawStatus: transactionStatus,
      refunded: mapped.refunded,
    };
  }

  async fetchStatus(orderId: string): Promise<VerifiedPaymentEvent | null> {
    const { http, json } = await this.request('GET', `/v2/${encodeURIComponent(orderId)}/status`);
    const statusCode = asString(json.status_code);

    // Midtrans bisa menjawab HTTP 200 dengan status_code "404" di body untuk transaksi yang tidak ada
    if (http === 404 || statusCode === '404') return null;
    if (http >= 400) {
      throw this.fail(`Midtrans status API gagal (HTTP ${http})`);
    }

    const transactionStatus = asString(json.transaction_status);
    const grossAmount = asString(json.gross_amount);
    if (!transactionStatus || !grossAmount || asString(json.order_id) !== orderId) {
      throw this.fail('Respons status Midtrans tidak lengkap atau untuk pesanan lain');
    }

    const mapped = mapMidtransStatus(transactionStatus, asString(json.fraud_status));
    return {
      orderId,
      providerTransactionId: asString(json.transaction_id),
      amount: Number(grossAmount),
      status: mapped.status,
      rawStatus: transactionStatus,
      refunded: mapped.refunded,
    };
  }
}
