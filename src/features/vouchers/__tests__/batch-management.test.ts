import { describe, it, expect, vi, beforeEach } from 'vitest';

type Code = { user: string; pass: string; planId: string };
type Batch = {
  id: string;
  items: Array<{ planId: string; qty: number }>;
  createdAt: number;
  samePassword: boolean;
  codes: Code[];
};

const store = new Map<string, Batch>();

vi.mock('../../../core/db/schema', () => ({
  db: {
    batches: {
      get: vi.fn(async (id: string) => store.get(id)),
      update: vi.fn(async (id: string, patch: Partial<Batch>) => {
        const cur = store.get(id);
        if (cur) store.set(id, { ...cur, ...patch });
      }),
      delete: vi.fn(async (id: string) => {
        store.delete(id);
      }),
    },
  },
}));

vi.mock('../../plans/plan-service', () => ({ getPlan: vi.fn() }));

import {
  classifyBatchAccounts,
  deleteBatch,
  deleteVoucherAccount,
} from '../voucher-service';
import type { RouterClient } from '../../../core/router/client';

const BATCH_ID = 'batch-1';

function seedBatch() {
  store.set(BATCH_ID, {
    id: BATCH_ID,
    items: [
      { planId: 'p1', qty: 2 },
      { planId: 'p2', qty: 1 },
    ],
    createdAt: 1,
    samePassword: false,
    codes: [
      { user: 'AAAAA2', pass: 'BBBBB3', planId: 'p1' },
      { user: 'CCCCC4', pass: 'DDDDD5', planId: 'p1' },
      { user: 'EEEEE6', pass: 'FFFFF7', planId: 'p2' },
    ],
  });
}

function makeRouter(opts: { failRemoveUser?: string } = {}) {
  const users = [
    { '.id': '*1', name: 'AAAAA2', password: 'x', comment: `vm|b=${BATCH_ID}|p=5000|v=60|plan=p1` },
    { '.id': '*2', name: 'CCCCC4', password: 'x', comment: `vm|b=${BATCH_ID}|p=5000|v=60|plan=p1|u=15` },
    // user lain dengan nama sama tapi bukan milik batch ini: tidak boleh ikut terhapus
    { '.id': '*3', name: 'EEEEE6', password: 'x', comment: 'vm|b=batch-lain|p=1000' },
    { '.id': '*9', name: 'manual', password: 'x', comment: '' },
  ];
  const removed: Array<{ path: string; id: string }> = [];
  const client = {
    print: vi.fn(async (path: string) => {
      if (path === '/ip/hotspot/user') return users;
      if (path === '/ip/hotspot/active') return [{ '.id': '*a1', user: 'CCCCC4' }];
      return [];
    }),
    remove: vi.fn(async (path: string, id: string) => {
      const target = users.find(u => u['.id'] === id);
      if (path === '/ip/hotspot/user' && opts.failRemoveUser && target?.name === opts.failRemoveUser) {
        throw new Error('router menolak');
      }
      removed.push({ path, id });
    }),
  };
  return { client: client as unknown as RouterClient, removed };
}

describe('classifyBatchAccounts', () => {
  it('membedakan Baru, Aktif, dan Kedaluwarsa', () => {
    seedBatch();
    const { client } = makeRouter();
    void client;
    const detail = classifyBatchAccounts(store.get(BATCH_ID)! as never, [
      { '.id': '*1', name: 'AAAAA2', comment: `vm|b=${BATCH_ID}|p=5000|v=60|plan=p1` },
      { '.id': '*2', name: 'CCCCC4', comment: `vm|b=${BATCH_ID}|p=5000|v=60|plan=p1|u=15` },
    ] as never);
    expect(detail.accounts.AAAAA2.status).toBe('new');
    expect(detail.accounts.CCCCC4).toMatchObject({ status: 'active', usedMinutes: 15, validityMinutes: 60 });
    expect(detail.accounts.EEEEE6.status).toBe('expired');
    expect(detail).toMatchObject({ newCount: 1, activeCount: 1, expiredCount: 1 });
  });

  it('user bernama sama dari batch lain dianggap kedaluwarsa untuk batch ini', () => {
    seedBatch();
    const detail = classifyBatchAccounts(store.get(BATCH_ID)! as never, [
      { '.id': '*3', name: 'EEEEE6', comment: 'vm|b=batch-lain|p=1000' },
    ] as never);
    expect(detail.accounts.EEEEE6.status).toBe('expired');
  });
});

describe('deleteBatch', () => {
  beforeEach(() => {
    store.clear();
    seedBatch();
  });

  it('menghapus hanya user milik batch, memutus sesi aktif, lalu menghapus riwayat', async () => {
    const { client, removed } = makeRouter();
    const res = await deleteBatch(client, BATCH_ID);
    expect(res).toMatchObject({ removedFromRouter: 2, removedLocal: true });
    expect(removed).toContainEqual({ path: '/ip/hotspot/active', id: '*a1' });
    expect(removed).toContainEqual({ path: '/ip/hotspot/user', id: '*1' });
    expect(removed).toContainEqual({ path: '/ip/hotspot/user', id: '*2' });
    // milik batch lain dan user manual tidak tersentuh
    expect(removed.find(r => r.id === '*3')).toBeUndefined();
    expect(removed.find(r => r.id === '*9')).toBeUndefined();
    expect(store.has(BATCH_ID)).toBe(false);
  });

  it('jika ada yang gagal di router, riwayat tidak dihapus dan kegagalan dilaporkan', async () => {
    const { client } = makeRouter({ failRemoveUser: 'CCCCC4' });
    const res = await deleteBatch(client, BATCH_ID);
    expect(res.removedLocal).toBe(false);
    expect(res.failed).toEqual([{ user: 'CCCCC4', error: 'router menolak' }]);
    expect(store.has(BATCH_ID)).toBe(true);
  });

  it('localOnly: hanya riwayat lokal yang dihapus, router tidak disentuh', async () => {
    const { client, removed } = makeRouter();
    const res = await deleteBatch(client, BATCH_ID, { localOnly: true });
    expect(res.removedLocal).toBe(true);
    expect(removed).toHaveLength(0);
    expect(store.has(BATCH_ID)).toBe(false);
  });

  it('client null: hanya riwayat lokal', async () => {
    const res = await deleteBatch(null, BATCH_ID);
    expect(res.removedLocal).toBe(true);
    expect(store.has(BATCH_ID)).toBe(false);
  });
});

describe('deleteVoucherAccount', () => {
  beforeEach(() => {
    store.clear();
    seedBatch();
  });

  it('menghapus satu akun dari router dan dari batch, items ikut dihitung ulang', async () => {
    const { client, removed } = makeRouter();
    const res = await deleteVoucherAccount(client, BATCH_ID, 'CCCCC4');
    expect(res.batchDeleted).toBe(false);
    expect(removed).toContainEqual({ path: '/ip/hotspot/active', id: '*a1' });
    expect(removed).toContainEqual({ path: '/ip/hotspot/user', id: '*2' });
    const b = store.get(BATCH_ID)!;
    expect(b.codes.map(c => c.user)).toEqual(['AAAAA2', 'EEEEE6']);
    expect(b.items).toEqual([
      { planId: 'p1', qty: 1 },
      { planId: 'p2', qty: 1 },
    ]);
  });

  it('akun yang sudah tidak ada di router: cukup bersihkan riwayat', async () => {
    const { client, removed } = makeRouter();
    // EEEEE6 di router milik batch lain, jadi dianggap sudah tidak ada untuk batch ini
    await deleteVoucherAccount(client, BATCH_ID, 'EEEEE6');
    expect(removed.find(r => r.id === '*3')).toBeUndefined();
    expect(store.get(BATCH_ID)!.codes).toHaveLength(2);
  });

  it('akun terakhir dihapus: batch ikut terhapus', async () => {
    const { client } = makeRouter();
    await deleteVoucherAccount(client, BATCH_ID, 'AAAAA2');
    await deleteVoucherAccount(client, BATCH_ID, 'CCCCC4');
    const res = await deleteVoucherAccount(client, BATCH_ID, 'EEEEE6');
    expect(res.batchDeleted).toBe(true);
    expect(store.has(BATCH_ID)).toBe(false);
  });

  it('gagal di router: riwayat tidak berubah dan error dilempar', async () => {
    const { client } = makeRouter({ failRemoveUser: 'AAAAA2' });
    await expect(deleteVoucherAccount(client, BATCH_ID, 'AAAAA2')).rejects.toThrow('router menolak');
    expect(store.get(BATCH_ID)!.codes).toHaveLength(3);
  });

  it('akun yang bukan bagian batch ditolak', async () => {
    const { client } = makeRouter();
    await expect(deleteVoucherAccount(client, BATCH_ID, 'ZZZZZ9')).rejects.toThrow(/tidak ada di batch/);
  });
});
