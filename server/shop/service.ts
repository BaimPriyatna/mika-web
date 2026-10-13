import QRCode from 'qrcode';
import { z } from 'zod';
import type { ShopConfig } from './config.ts';
import type { PaymentGateway, VerifiedPaymentEvent } from './gateway.ts';
import type { VoucherIssuer } from './issuer.ts';
import type { ShopStore } from './store.ts';
import type { Order, ShopSettings } from './types.ts';
import { MAX_PRICE, MIN_PRICE, ShopError } from './types.ts';
import { formatDurationId } from './duration.ts';
import { randomBytes } from 'node:crypto';

export const ORDER_ID_RE = /^WT-[A-Za-z0-9_-]{22}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_PENDING_ORDERS = 300;
const GATEWAY_CHECK_INTERVAL_MS = 8_000;
const RECONCILE_INTERVAL_MS = 30_000;
/** Setelah lewat batas waktu bayar + jeda ini, halaman menampilkan "kedaluwarsa" walau provider belum memberi tahu */
const EXPIRY_GRACE_MS = 120_000;
const MAX_ANOMALIES = 20;

export type PublicState = 'waiting_payment' | 'processing' | 'ready' | 'expired' | 'failed' | 'cancelled';

export interface PublicOrderView {
  id: string;
  state: PublicState;
  packageName: string;
  durationLabel: string;
  amount: number;
  expiresAt: number;
  /** Hanya saat menunggu pembayaran */
  qrDataUrl?: string;
  /** Hanya setelah pembayaran terverifikasi DAN akun benar-benar sudah dibuat di router */
  code?: string;
  loginUrl: string | null;
  message?: string;
}

const packageSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  label: z.string().trim().min(1).max(60),
  price: z.number().int().min(MIN_PRICE).max(MAX_PRICE),
  profileName: z
    .string()
    .trim()
    .min(1)
    .max(60)
    // eslint-disable-next-line no-control-regex
    .regex(/^[^\x00-\x1f\x7f]+$/),
  validityMinutes: z.number().int().min(1).max(10_080).nullable(),
  enabled: z.boolean(),
});

export const settingsSchema = z
  .object({
    enabled: z.boolean(),
    paymentExpiryMinutes: z.number().int().min(5).max(60),
    packages: z.array(packageSchema).max(50),
  })
  .refine(s => new Set(s.packages.map(p => p.id)).size === s.packages.length, {
    message: 'ID paket harus unik',
  });

export interface ShopServiceDeps {
  store: ShopStore;
  gateway: PaymentGateway;
  issuer: VoucherIssuer;
  config: ShopConfig;
  now?: () => number;
  log?: (message: string, data?: Record<string, unknown>) => void;
}

function newOrderId(): string {
  return 'WT-' + randomBytes(16).toString('base64url');
}

function safeMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/\s+/g, ' ').slice(0, 300);
}

export class ShopService {
  private readonly store: ShopStore;
  private readonly gateway: PaymentGateway;
  private readonly issuer: VoucherIssuer;
  private readonly config: ShopConfig;
  private readonly now: () => number;
  private readonly log: (message: string, data?: Record<string, unknown>) => void;
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly inflight = new Set<Promise<unknown>>();

  constructor(deps: ShopServiceDeps) {
    this.store = deps.store;
    this.gateway = deps.gateway;
    this.issuer = deps.issuer;
    this.config = deps.config;
    this.now = deps.now ?? Date.now;
    this.log = deps.log ?? ((message, data) => console.info(`[shop] ${message}`, data ?? ''));
  }

  /** Tunggu semua penerbitan yang sedang berjalan (untuk tes dan shutdown) */
  async idle(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.allSettled([...this.inflight]);
    }
  }

  // ---------------------------------------------------------------- pengaturan

  getSettings(): ShopSettings {
    return this.store.getSettings();
  }

  async saveSettings(input: unknown): Promise<ShopSettings> {
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) {
      throw new ShopError(400, 'invalid_settings', 'Pengaturan tidak valid: ' + parsed.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; '));
    }
    await this.store.saveSettings(parsed.data);
    return this.store.getSettings();
  }

  // ---------------------------------------------------------------- sisi pelanggan

  listPackages() {
    const settings = this.store.getSettings();
    const available = settings.enabled && this.gateway.isConfigured();
    return {
      enabled: available,
      packages: available
        ? settings.packages
            .filter(p => p.enabled)
            .map(p => ({
              id: p.id,
              label: p.label,
              price: p.price,
              durationLabel: formatDurationId(p.validityMinutes),
            }))
        : [],
      loginUrl: this.config.hotspotLoginUrl || null,
    };
  }

  async createOrder(input: { packageId: unknown; idempotencyKey?: string }): Promise<PublicOrderView> {
    if (!this.gateway.isConfigured()) {
      throw new ShopError(503, 'not_configured', 'Penjualan online belum tersedia');
    }
    const settings = this.store.getSettings();
    if (!settings.enabled) {
      throw new ShopError(503, 'sales_disabled', 'Penjualan online sedang tidak tersedia');
    }
    // Paket dan HARGA selalu dari konfigurasi server, bukan dari browser
    const pkg = typeof input.packageId === 'string'
      ? settings.packages.find(p => p.id === input.packageId && p.enabled)
      : undefined;
    if (!pkg) {
      throw new ShopError(400, 'unknown_package', 'Paket tidak tersedia');
    }

    const key = input.idempotencyKey;
    if (key !== undefined && !IDEMPOTENCY_RE.test(key)) {
      throw new ShopError(400, 'invalid_idempotency_key', 'Idempotency-Key tidak valid');
    }
    if (key) {
      const existingId = this.store.getIdempotent(key);
      const existing = existingId ? this.store.getOrder(existingId) : undefined;
      if (existing) {
        if (existing.packageId !== pkg.id) {
          throw new ShopError(409, 'idempotency_conflict', 'Kunci sudah dipakai untuk paket lain');
        }
        return this.toPublicView(existing);
      }
    }

    if (this.store.countPending() >= MAX_PENDING_ORDERS) {
      throw new ShopError(429, 'busy', 'Terlalu banyak pesanan menunggu. Coba lagi beberapa saat.');
    }

    const now = this.now();
    const order: Order = {
      id: newOrderId(),
      packageId: pkg.id,
      packageName: pkg.label,
      profileName: pkg.profileName,
      validityMinutes: pkg.validityMinutes,
      amount: pkg.price,
      currency: 'IDR',
      provider: this.gateway.name,
      paymentExpiresAt: now + settings.paymentExpiryMinutes * 60_000,
      paymentStatus: 'pending',
      issuanceStatus: 'not_issued',
      issueAttempts: 0,
      anomalies: [],
      createdAt: now,
      updatedAt: now,
    };

    // Pendaftaran pesanan dan kunci idempotensi terjadi sinkron sebelum await pertama,
    // sehingga dua klik bersamaan dengan kunci yang sama tidak membuat dua pesanan.
    const pending = [this.store.addOrder(order)];
    if (key) pending.push(this.store.setIdempotent(key, order.id));
    await Promise.all(pending);

    try {
      const payment = await this.gateway.createPayment({
        orderId: order.id,
        amount: order.amount,
        itemName: order.packageName,
        expiryMinutes: settings.paymentExpiryMinutes,
      });
      const updated = await this.store.updateOrder(order.id, o => {
        o.providerTransactionId = payment.providerTransactionId;
        o.qrString = payment.qrString;
        // paymentExpiresAt tetap dari jam server saat pesanan dibuat (perkiraan batas atas); status final dari penyedia
      });
      this.log('pesanan dibuat', { orderId: order.id, packageId: pkg.id, amount: order.amount });
      return this.toPublicView(updated);
    } catch (err) {
      await this.store.updateOrder(order.id, o => {
        o.paymentStatus = 'failed';
        o.lastError = safeMessage(err);
      });
      this.log('gagal membuat pembayaran', { orderId: order.id, error: safeMessage(err) });
      throw new ShopError(502, 'gateway_error', 'Gagal membuat pembayaran. Silakan coba lagi.');
    }
  }

  async getOrderPublic(id: string): Promise<PublicOrderView> {
    if (!ORDER_ID_RE.test(id)) {
      throw new ShopError(400, 'invalid_order_id', 'ID pesanan tidak valid');
    }
    let order = this.store.getOrder(id);
    if (!order) throw new ShopError(404, 'not_found', 'Pesanan tidak ditemukan');

    const now = this.now();
    if (
      order.paymentStatus === 'pending' &&
      order.providerTransactionId &&
      now - (order.lastGatewayCheckAt ?? 0) >= GATEWAY_CHECK_INTERVAL_MS
    ) {
      // Cadangan jika webhook tidak sampai (mis. backend di jaringan lokal tanpa alamat publik)
      await this.refreshFromGateway(id).catch(err =>
        this.log('cek status gagal', { orderId: id, error: safeMessage(err) })
      );
      order = this.store.getOrder(id) ?? order;
    }

    if (order.paymentStatus === 'paid' && this.issuanceDue(order, now)) {
      this.scheduleIssue(id);
    }
    return this.toPublicView(order);
  }

  // ---------------------------------------------------------------- webhook

  /**
   * Menerima notifikasi pembayaran. Urutan: verifikasi keaslian -> cari pesanan -> cocokkan nominal dan
   * ID transaksi -> transisi status -> (jika baru dibayar) jadwalkan penerbitan. Respons tidak menunggu router.
   */
  async handleWebhook(payload: unknown): Promise<{ result: 'applied' | 'ignored' }> {
    const event = await this.gateway.verifyWebhook(payload); // melempar WebhookAuthError / WebhookFormatError
    if (!ORDER_ID_RE.test(event.orderId) || !this.store.getOrder(event.orderId)) {
      this.log('notifikasi untuk pesanan tidak dikenal', { orderId: event.orderId.slice(0, 40) });
      throw new ShopError(404, 'unknown_order', 'Pesanan tidak dikenal');
    }
    const changed = await this.applyEvent(event, 'webhook');
    return { result: changed ? 'applied' : 'ignored' };
  }

  private async refreshFromGateway(id: string): Promise<boolean> {
    await this.store.updateOrder(id, o => {
      o.lastGatewayCheckAt = this.now();
    });
    const event = await this.gateway.fetchStatus(id);
    if (!event) return false;
    return this.applyEvent(event, 'status');
  }

  /** Mengembalikan true jika status pesanan berubah. Melempar ShopError jika data tidak cocok. */
  private async applyEvent(event: VerifiedPaymentEvent, source: 'webhook' | 'status'): Promise<boolean> {
    const order = this.store.getOrder(event.orderId);
    if (!order) throw new ShopError(404, 'unknown_order', 'Pesanan tidak dikenal');

    // Nominal HARUS sama persis dengan yang kita simpan saat pesanan dibuat
    if (event.amount !== order.amount) {
      await this.addAnomaly(order.id, `Nominal tidak cocok (${source}): diterima ${event.amount}, seharusnya ${order.amount}`);
      this.log('nominal tidak cocok', { orderId: order.id, got: event.amount, expected: order.amount });
      throw new ShopError(400, 'amount_mismatch', 'Nominal tidak cocok');
    }
    if (order.providerTransactionId && event.providerTransactionId && order.providerTransactionId !== event.providerTransactionId) {
      await this.addAnomaly(order.id, `ID transaksi provider tidak cocok (${source})`);
      throw new ShopError(400, 'transaction_mismatch', 'ID transaksi tidak cocok');
    }

    if (event.status === 'unknown') {
      await this.addAnomaly(order.id, `Status tidak dikenal dari provider: ${event.rawStatus.slice(0, 40)}`);
      return false;
    }

    const next = event.status;
    const current = order.paymentStatus;
    let becamePaid = false;
    let changed = false;

    await this.store.updateOrder(order.id, o => {
      if (!o.providerTransactionId && event.providerTransactionId) {
        o.providerTransactionId = event.providerTransactionId;
      }
      if (event.refunded && !o.refunded) {
        o.refunded = true;
        this.pushAnomaly(o, `Provider melaporkan pengembalian dana (${event.rawStatus}); voucher tidak dicabut otomatis`);
        changed = true;
      }

      if (current === 'paid') return; // status dibayar tidak pernah turun
      // Pesan refund/chargeback untuk pesanan yang belum pernah kita lihat berstatus dibayar: hanya dicatat,
      // JANGAN dianggap pembayaran (voucher tidak boleh terbit).
      if (event.refunded) return;
      if (next === 'paid') {
        o.paymentStatus = 'paid';
        o.paidAt = this.now();
        becamePaid = true;
        changed = true;
      } else if (next !== 'pending' && current === 'pending') {
        o.paymentStatus = next;
        changed = true;
      }
      // pending/terminal -> pending dan terminal -> terminal lain diabaikan
    });

    if (becamePaid) {
      this.log('pembayaran terverifikasi', { orderId: order.id, source });
      this.scheduleIssue(order.id);
    }
    return changed;
  }

  private pushAnomaly(order: Order, text: string) {
    if (order.anomalies.length > 0 && order.anomalies[order.anomalies.length - 1].endsWith(text)) return; // hindari catatan berulang
    order.anomalies.push(`${new Date(this.now()).toISOString()} ${text}`);
    if (order.anomalies.length > MAX_ANOMALIES) order.anomalies.shift();
  }

  private async addAnomaly(orderId: string, text: string) {
    await this.store.updateOrder(orderId, o => this.pushAnomaly(o, text));
  }

  // ---------------------------------------------------------------- penerbitan

  private issuanceDue(order: Order, now: number): boolean {
    if (order.paymentStatus !== 'paid') return false;
    if (order.issuanceStatus === 'not_issued') return true;
    if (order.issuanceStatus === 'retry_pending') return !order.nextRetryAt || order.nextRetryAt <= now;
    return false;
  }

  private scheduleIssue(id: string) {
    const p = this.tryIssue(id).catch(err => this.log('penerbitan error tak terduga', { orderId: id, error: safeMessage(err) }));
    this.inflight.add(p);
    void p.finally(() => this.inflight.delete(p));
  }

  private withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => undefined);
    this.locks.set(id, tail);
    void tail.then(() => {
      if (this.locks.get(id) === tail) this.locks.delete(id);
    });
    return run;
  }

  /** Terbitkan voucher untuk satu pesanan. Aman dipanggil berulang/bersamaan: maksimal satu akun per pesanan. */
  async tryIssue(id: string, options: { force?: boolean } = {}): Promise<void> {
    return this.withLock(id, async () => {
      const order = this.store.getOrder(id);
      if (!order || order.paymentStatus !== 'paid' || order.issuanceStatus === 'issued') return;
      if (!options.force) {
        if (order.issuanceStatus === 'issue_failed') return;
        if (order.issuanceStatus === 'retry_pending' && order.nextRetryAt && order.nextRetryAt > this.now()) return;
      }

      const working = await this.store.updateOrder(id, o => {
        o.issuanceStatus = 'issuing';
        o.issueAttempts += 1;
      });

      try {
        const code = await this.issuer.issue(working, {
          saveCode: async c => {
            await this.store.updateOrder(id, o => {
              o.voucherCode = c;
            });
          },
        });
        await this.store.updateOrder(id, o => {
          o.issuanceStatus = 'issued';
          o.voucherCode = code;
          o.issuedAt = this.now();
          o.lastError = undefined;
          o.nextRetryAt = undefined;
        });
        this.log('akun diterbitkan', { orderId: id });
      } catch (err) {
        const message = safeMessage(err);
        const { maxAttempts, baseDelayMs, maxDelayMs } = this.config.retry;
        const exhausted = working.issueAttempts >= maxAttempts;
        const delay = Math.min(baseDelayMs * 2 ** (working.issueAttempts - 1), maxDelayMs);
        await this.store.updateOrder(id, o => {
          o.issuanceStatus = exhausted ? 'issue_failed' : 'retry_pending';
          o.nextRetryAt = exhausted ? undefined : this.now() + delay;
          o.lastError = message;
        });
        this.log(exhausted ? 'penerbitan gagal permanen' : 'penerbitan gagal, akan dicoba lagi', {
          orderId: id,
          attempt: working.issueAttempts,
          error: message,
        });
      }
    });
  }

  /** Dipanggil berkala: coba lagi penerbitan yang tertunda (router offline, dll). */
  async processDue(limit = 10): Promise<number> {
    const now = this.now();
    const due = this.store
      .listOrders(1000)
      .filter(o => this.issuanceDue(o, now))
      .slice(0, limit);
    for (const order of due) {
      await this.tryIssue(order.id);
    }
    return due.length;
  }

  /**
   * Cadangan webhook: periksa ke penyedia pesanan yang masih menunggu bayar, walau halaman pelanggan sudah
   * ditutup. Penting jika backend ada di jaringan lokal sehingga webhook tidak bisa sampai.
   * Hanya pesanan yang masih dalam jendela pembayaran (+ jeda) dan belum diperiksa dalam 30 detik terakhir.
   */
  async reconcilePending(limit = 10): Promise<number> {
    const now = this.now();
    const candidates = this.store
      .listOrders(1000)
      .filter(
        o =>
          o.paymentStatus === 'pending' &&
          o.providerTransactionId &&
          now <= o.paymentExpiresAt + 10 * 60_000 &&
          now - (o.lastGatewayCheckAt ?? 0) >= RECONCILE_INTERVAL_MS
      )
      .slice(0, limit);
    for (const order of candidates) {
      await this.refreshFromGateway(order.id).catch(err =>
        this.log('rekonsiliasi gagal', { orderId: order.id, error: safeMessage(err) })
      );
    }
    return candidates.length;
  }

  /** Setelah proses berhenti mendadak, pesanan "issuing" dikembalikan ke antrean retry. */
  async recoverStuck(): Promise<number> {
    let n = 0;
    for (const order of this.store.listOrders(1000)) {
      if (order.issuanceStatus === 'issuing') {
        await this.store.updateOrder(order.id, o => {
          o.issuanceStatus = 'retry_pending';
          o.nextRetryAt = undefined;
        });
        n++;
      }
    }
    return n;
  }

  async purgeOld(): Promise<number> {
    return this.store.purgeOlderThan(this.now() - this.config.retentionDays * 86_400_000);
  }

  // ---------------------------------------------------------------- admin

  listOrdersForAdmin(limit = 100): Array<Omit<Order, 'qrString'>> {
    return this.store.listOrders(limit).map(o => {
      const copy: Partial<Order> = { ...o };
      delete copy.qrString;
      return copy as Omit<Order, 'qrString'>;
    });
  }

  async retryIssuance(id: string): Promise<Order> {
    const order = this.store.getOrder(id);
    if (!order) throw new ShopError(404, 'not_found', 'Pesanan tidak ditemukan');
    if (order.paymentStatus !== 'paid') {
      throw new ShopError(409, 'not_paid', 'Pesanan belum dibayar, tidak ada yang perlu diterbitkan');
    }
    if (order.issuanceStatus === 'issued') {
      throw new ShopError(409, 'already_issued', 'Akun sudah diterbitkan');
    }
    await this.store.updateOrder(id, o => {
      o.issuanceStatus = 'retry_pending';
      o.issueAttempts = 0;
      o.nextRetryAt = undefined;
    });
    await this.tryIssue(id, { force: true });
    return this.store.getOrder(id)!;
  }

  async refreshOrder(id: string): Promise<Order> {
    const order = this.store.getOrder(id);
    if (!order) throw new ShopError(404, 'not_found', 'Pesanan tidak ditemukan');
    if (order.providerTransactionId) {
      await this.refreshFromGateway(id);
    }
    return this.store.getOrder(id)!;
  }

  // ---------------------------------------------------------------- tampilan publik

  private async toPublicView(order: Order): Promise<PublicOrderView> {
    const now = this.now();
    let state: PublicState;
    let message: string | undefined;

    switch (order.paymentStatus) {
      case 'paid':
        if (order.issuanceStatus === 'issued' && order.voucherCode) {
          state = 'ready';
        } else {
          state = 'processing';
          message =
            order.issuanceStatus === 'issue_failed'
              ? `Pembayaran sudah diterima, tetapi akun belum bisa dibuat. Hubungi petugas dan sebutkan kode pesanan ${order.id}.`
              : 'Pembayaran sudah diterima. Akun sedang diproses, halaman ini akan diperbarui otomatis.';
        }
        break;
      case 'pending':
        state = now > order.paymentExpiresAt + EXPIRY_GRACE_MS ? 'expired' : 'waiting_payment';
        break;
      case 'expired':
        state = 'expired';
        break;
      case 'cancelled':
        state = 'cancelled';
        break;
      default:
        state = 'failed';
    }

    const view: PublicOrderView = {
      id: order.id,
      state,
      packageName: order.packageName,
      durationLabel: formatDurationId(order.validityMinutes),
      amount: order.amount,
      expiresAt: order.paymentExpiresAt,
      loginUrl: this.config.hotspotLoginUrl || null,
    };
    if (message) view.message = message;
    if (state === 'waiting_payment' && order.qrString) {
      const svg = await QRCode.toString(order.qrString, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
      view.qrDataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
    }
    // Kode hanya diberikan setelah pembayaran terverifikasi dan akun benar-benar ada di router
    if (state === 'ready') view.code = order.voucherCode;
    return view;
  }

  // ---------------------------------------------------------------- latar belakang

  /** Mulai retry berkala + pembersihan retensi. Mengembalikan fungsi untuk menghentikan. */
  startBackground(): () => void {
    void this.recoverStuck().catch(err => this.log('recoverStuck gagal', { error: safeMessage(err) }));
    let running = false;
    const timer = setInterval(() => {
      if (running) return;
      running = true;
      this.reconcilePending()
        .then(() => this.processDue())
        .catch(err => this.log('tugas latar belakang gagal', { error: safeMessage(err) }))
        .finally(() => {
          running = false;
        });
    }, this.config.retry.intervalMs);
    const purgeTimer = setInterval(() => {
      this.purgeOld().catch(err => this.log('purge gagal', { error: safeMessage(err) }));
    }, 3_600_000);
    timer.unref();
    purgeTimer.unref();
    return () => {
      clearInterval(timer);
      clearInterval(purgeTimer);
    };
  }
}
