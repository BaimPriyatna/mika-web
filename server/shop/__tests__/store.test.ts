// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ShopStore } from '../store.ts';
import type { Order } from '../types.ts';
import { tmpDir } from './helpers.ts';

function order(id: string, overrides: Partial<Order> = {}): Order {
  return {
    id,
    packageId: 'plan-1h',
    packageName: 'Paket 1 Jam',
    profileName: '1jam',
    validityMinutes: 60,
    amount: 5000,
    currency: 'IDR',
    provider: 'midtrans',
    paymentExpiresAt: 1,
    paymentStatus: 'pending',
    issuanceStatus: 'not_issued',
    issueAttempts: 0,
    anomalies: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('ShopStore', () => {
  it('menyimpan ke disk dan membaca kembali setelah dibuka ulang', async () => {
    const dir = tmpDir();
    const a = await ShopStore.open(dir);
    await a.saveSettings({ enabled: true, paymentExpiryMinutes: 20, packages: [] });
    await a.addOrder(order('WT-1'));
    await a.updateOrder('WT-1', o => {
      o.paymentStatus = 'paid';
    });
    await a.setIdempotent('key-12345678', 'WT-1');

    const b = await ShopStore.open(dir);
    expect(b.getSettings()).toMatchObject({ enabled: true, paymentExpiryMinutes: 20 });
    expect(b.getOrder('WT-1')?.paymentStatus).toBe('paid');
    expect(b.getIdempotent('key-12345678')).toBe('WT-1');
  });

  it('berkas di disk selalu JSON utuh walau banyak penulisan bersamaan', async () => {
    const dir = tmpDir();
    const store = await ShopStore.open(dir);
    await store.addOrder(order('WT-1'));
    await Promise.all(
      Array.from({ length: 60 }, () =>
        store.updateOrder('WT-1', o => {
          o.issueAttempts += 1;
        })
      )
    );
    await store.flush();
    const raw = fs.readFileSync(path.join(dir, 'shop-store.json'), 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(JSON.parse(raw).orders['WT-1'].issueAttempts).toBe(60);
    expect(fs.existsSync(path.join(dir, 'shop-store.json.tmp'))).toBe(false);
  });

  it('updateOrder yang melempar error tidak mengubah apa pun', async () => {
    const store = await ShopStore.open(tmpDir());
    await store.addOrder(order('WT-1'));
    await expect(
      store.updateOrder('WT-1', o => {
        o.paymentStatus = 'paid';
        throw new Error('batal');
      })
    ).rejects.toThrow('batal');
    expect(store.getOrder('WT-1')?.paymentStatus).toBe('pending');
  });

  it('menolak ID pesanan ganda dan providerTransactionId ganda', async () => {
    const store = await ShopStore.open(tmpDir());
    await store.addOrder(order('WT-1', { providerTransactionId: 'tx-1' }));
    await expect(store.addOrder(order('WT-1'))).rejects.toThrow(/sudah ada/);
    await expect(store.addOrder(order('WT-2', { providerTransactionId: 'tx-1' }))).rejects.toThrow(/providerTransactionId/);
    await store.addOrder(order('WT-3'));
    await expect(store.updateOrder('WT-3', o => { o.providerTransactionId = 'tx-1'; })).rejects.toThrow(/providerTransactionId/);
  });

  it('berkas rusak tidak dibuang diam-diam', async () => {
    const dir = tmpDir();
    const file = path.join(dir, 'shop-store.json');
    fs.writeFileSync(file, '{rusak');
    await expect(ShopStore.open(dir)).rejects.toThrow(/TIDAK dihapus/);
    expect(fs.readFileSync(file, 'utf-8')).toBe('{rusak');
  });

  it('getOrder mengembalikan salinan: mengubahnya tidak mengubah isi store', async () => {
    const store = await ShopStore.open(tmpDir());
    await store.addOrder(order('WT-1'));
    const copy = store.getOrder('WT-1')!;
    copy.amount = 1;
    expect(store.getOrder('WT-1')!.amount).toBe(5000);
  });

  it('retensi: hanya pesanan final yang sudah selesai dihapus', async () => {
    const store = await ShopStore.open(tmpDir());
    const old = 1000;
    await store.addOrder(order('WT-pending', { createdAt: old }));
    await store.addOrder(order('WT-expired', { createdAt: old, paymentStatus: 'expired' }));
    await store.addOrder(order('WT-issued', { createdAt: old, paymentStatus: 'paid', issuanceStatus: 'issued' }));
    await store.addOrder(order('WT-paid-unissued', { createdAt: old, paymentStatus: 'paid', issuanceStatus: 'retry_pending' }));
    await store.addOrder(order('WT-new', { createdAt: 9_999_999, paymentStatus: 'expired' }));

    const removed = await store.purgeOlderThan(5000);
    expect(removed).toBe(2);
    expect(store.getOrder('WT-pending')).toBeDefined();
    expect(store.getOrder('WT-paid-unissued')).toBeDefined(); // sudah dibayar, akun belum terbit: JANGAN dihapus
    expect(store.getOrder('WT-new')).toBeDefined();
    expect(store.getOrder('WT-expired')).toBeUndefined();
    expect(store.getOrder('WT-issued')).toBeUndefined();
  });
});
