import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Order, ShopSettings, StoreData } from './types.ts';
import { DEFAULT_SETTINGS } from './types.ts';

/**
 * Penyimpanan transaksi persisten berbasis berkas JSON (satu proses Node, satu router).
 *
 * Jaminan:
 *  - Perubahan di memori bersifat sinkron (atomik terhadap pemanggil lain di proses yang sama), lalu
 *    ditulis ke disk lewat antrean: tulis berkas sementara + rename, sehingga berkas tidak pernah setengah tertulis.
 *  - Constraint unik pada providerTransactionId dan id pesanan.
 *  - Berkas rusak tidak dibuang diam-diam: pembukaan gagal dengan pesan jelas.
 *
 * Batasan: tidak mendukung beberapa proses sekaligus. Antarmuka sengaja kecil agar bisa diganti SQLite.
 */
export class ShopStore {
  private data: StoreData;
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  private constructor(filePath: string, data: StoreData) {
    this.filePath = filePath;
    this.data = data;
  }

  static async open(dir: string): Promise<ShopStore> {
    await fs.promises.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, 'shop-store.json');

    let data: StoreData;
    try {
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<StoreData>;
      if (parsed.version !== 1 || typeof parsed.orders !== 'object' || parsed.orders === null) {
        throw new Error('format tidak dikenal');
      }
      data = {
        version: 1,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        orders: parsed.orders,
        idempotency: parsed.idempotency ?? {},
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        data = { version: 1, settings: { ...DEFAULT_SETTINGS }, orders: {}, idempotency: {} };
      } else {
        throw new Error(
          `Berkas transaksi ${filePath} tidak bisa dibaca (${(err as Error).message}). ` +
            'Berkas TIDAK dihapus. Periksa atau pulihkan dari cadangan sebelum menjalankan ulang.'
        );
      }
    }
    return new ShopStore(filePath, data);
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.data);
    const run = this.writeQueue.then(async () => {
      const tmp = `${this.filePath}.tmp`;
      await fs.promises.writeFile(tmp, snapshot, { encoding: 'utf-8', mode: 0o600 });
      await fs.promises.rename(tmp, this.filePath);
    });
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  /** Tunggu semua penulisan tertunda selesai (dipakai tes dan saat shutdown) */
  async flush(): Promise<void> {
    await this.writeQueue;
  }

  getSettings(): ShopSettings {
    return structuredClone(this.data.settings);
  }

  async saveSettings(settings: ShopSettings): Promise<void> {
    this.data.settings = structuredClone(settings);
    await this.persist();
  }

  getOrder(id: string): Order | undefined {
    const order = this.data.orders[id];
    return order ? structuredClone(order) : undefined;
  }

  listOrders(limit = 200): Order[] {
    return Object.values(this.data.orders)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map(o => structuredClone(o));
  }

  findByProviderTransactionId(providerTransactionId: string): Order | undefined {
    const found = Object.values(this.data.orders).find(
      o => o.providerTransactionId === providerTransactionId
    );
    return found ? structuredClone(found) : undefined;
  }

  countPending(): number {
    return Object.values(this.data.orders).filter(o => o.paymentStatus === 'pending').length;
  }

  async addOrder(order: Order): Promise<void> {
    if (this.data.orders[order.id]) {
      throw new Error(`Pesanan ${order.id} sudah ada`);
    }
    this.assertUniqueProviderTx(order);
    this.data.orders[order.id] = structuredClone(order);
    await this.persist();
  }

  /**
   * Ubah pesanan secara atomik: mutator berjalan sinkron pada salinan kerja, lalu hasilnya
   * disimpan. Jika mutator melempar error, tidak ada perubahan yang tersimpan.
   */
  async updateOrder(id: string, mutator: (order: Order) => void): Promise<Order> {
    const current = this.data.orders[id];
    if (!current) throw new Error(`Pesanan ${id} tidak ditemukan`);
    const draft = structuredClone(current);
    mutator(draft);
    draft.updatedAt = Date.now();
    this.assertUniqueProviderTx(draft);
    this.data.orders[id] = draft;
    await this.persist();
    return structuredClone(draft);
  }

  private assertUniqueProviderTx(order: Order) {
    if (!order.providerTransactionId) return;
    const clash = Object.values(this.data.orders).find(
      o => o.id !== order.id && o.providerTransactionId === order.providerTransactionId
    );
    if (clash) {
      throw new Error(`providerTransactionId sudah dipakai pesanan ${clash.id}`);
    }
  }

  getIdempotent(key: string): string | undefined {
    return this.data.idempotency[key]?.orderId;
  }

  async setIdempotent(key: string, orderId: string): Promise<void> {
    this.data.idempotency[key] = { orderId, at: Date.now() };
    await this.persist();
  }

  /**
   * Kebijakan retensi: hapus pesanan final yang lebih tua dari batas. Pesanan yang masih menunggu
   * pembayaran atau penerbitan (belum issued) tidak pernah dihapus otomatis.
   */
  async purgeOlderThan(olderThanMs: number): Promise<number> {
    let removed = 0;
    for (const [id, order] of Object.entries(this.data.orders)) {
      const finalPayment = order.paymentStatus !== 'pending';
      const finalIssuance = order.paymentStatus !== 'paid' || order.issuanceStatus === 'issued';
      if (finalPayment && finalIssuance && order.createdAt < olderThanMs) {
        delete this.data.orders[id];
        removed++;
      }
    }
    for (const [key, entry] of Object.entries(this.data.idempotency)) {
      if (entry.at < olderThanMs) delete this.data.idempotency[key];
    }
    if (removed > 0) await this.persist();
    return removed;
  }
}
