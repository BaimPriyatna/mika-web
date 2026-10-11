import { describe, it, expect, vi, beforeEach } from 'vitest';

const batches: unknown[] = [];

vi.mock('../../../core/db/schema', () => ({
  db: {
    batches: {
      add: vi.fn(async (b: unknown) => {
        batches.push(b);
      }),
    },
  },
}));

vi.mock('../../plans/plan-service', () => ({
  getPlan: vi.fn(async (id: string) => ({
    id,
    label: 'Paket 1 Jam',
    profileName: id === 'plan-none' ? 'tanpa-validity' : '1jam',
    price: 5000,
  })),
}));

import { generateMultiPlanBatch, PartialBatchError } from '../voucher-service';
import { isValidVoucherCode } from '../../../core/utils/validation';
import type { RouterClient } from '../../../core/router/client';

type AddCall = { path: string; body: Record<string, string> };

function makeClient(opts: { failOnCall?: number[] } = {}) {
  const added: AddCall[] = [];
  let n = 0;
  const client = {
    print: vi.fn(async (path: string) => {
      if (path === '/ip/hotspot/user/profile') {
        return [
          { name: '1jam', 'session-timeout': '1h' },
          { name: 'tanpa-validity', 'session-timeout': '' },
        ];
      }
      if (path === '/ip/hotspot/user') return [];
      return [];
    }),
    add: vi.fn(async (path: string, body: Record<string, string>) => {
      n++;
      if (opts.failOnCall?.includes(n)) throw new Error('router menolak');
      added.push({ path, body });
      return '*' + n;
    }),
  };
  return { client: client as unknown as RouterClient, added };
}

describe('generateMultiPlanBatch', () => {
  beforeEach(() => {
    batches.length = 0;
  });

  it('menaruh |v=<menit> di comment agar vm-cleaner bisa memproses voucher', async () => {
    const { client, added } = makeClient();
    await generateMultiPlanBatch(client, [{ planId: 'p1', qty: 3 }]);
    expect(added).toHaveLength(3);
    for (const a of added) {
      expect(a.body.comment).toMatch(/^vm\|b=[^|]+\|p=5000\|v=60\|plan=p1$/);
    }
  });

  it('tanpa masa berlaku di profil: comment tidak memuat |v=', async () => {
    const { client, added } = makeClient();
    await generateMultiPlanBatch(client, [{ planId: 'plan-none', qty: 1 }]);
    expect(added[0].body.comment).not.toContain('|v=');
  });

  it('password selalu sama dengan username tiap akun (satu kode voucher)', async () => {
    const { client, added } = makeClient();
    await generateMultiPlanBatch(client, [{ planId: 'p1', qty: 8 }]);
    expect(added).toHaveLength(8);
    for (const a of added) {
      expect(a.body.password).toBe(a.body.name);
      expect(isValidVoucherCode(a.body.name)).toBe(true);
    }
    expect(new Set(added.map(a => a.body.name)).size).toBe(8);
  });

  it('batch tersimpan bertanda user = password', async () => {
    const { client } = makeClient();
    const batch = await generateMultiPlanBatch(client, [{ planId: 'p1', qty: 2 }]);
    expect(batch.samePassword).toBe(true);
    expect(batch.codes.every(c => c.user === c.pass)).toBe(true);
  });

  it('menolak total lebih dari 8 voucher', async () => {
    const { client, added } = makeClient();
    await expect(
      generateMultiPlanBatch(client, [{ planId: 'p1', qty: 9 }])
    ).rejects.toThrow();
    await expect(
      generateMultiPlanBatch(
        client,
        [
          { planId: 'p1', qty: 5 },
          { planId: 'p2', qty: 4 },
        ])
    ).rejects.toThrow();
    expect(added).toHaveLength(0);
  });

  it('gagal sebagian: batch tetap disimpan hanya dengan voucher yang berhasil', async () => {
    const { client } = makeClient({ failOnCall: [2] });
    let caught: unknown;
    try {
      await generateMultiPlanBatch(client, [{ planId: 'p1', qty: 4 }]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PartialBatchError);
    const err = caught as PartialBatchError;
    expect(err.failedCount).toBe(1);
    expect(err.batch.codes).toHaveLength(3);
    expect(err.batch.items).toEqual([{ planId: 'p1', qty: 3 }]);
    expect(batches).toHaveLength(1);
  });

  it('semua gagal: tidak ada batch yang disimpan', async () => {
    const { client } = makeClient({ failOnCall: [1, 2] });
    await expect(
      generateMultiPlanBatch(client, [{ planId: 'p1', qty: 2 }])
    ).rejects.toThrow(/semua/i);
    expect(batches).toHaveLength(0);
  });

  it('profil tidak ada di router: ditolak sebelum membuat user', async () => {
    const { client, added } = makeClient();
    const { getPlan } = await import('../../plans/plan-service');
    (getPlan as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'p9',
      label: 'x',
      profileName: 'hilang',
      price: 1000,
    });
    await expect(
      generateMultiPlanBatch(client, [{ planId: 'p9', qty: 1 }])
    ).rejects.toThrow(/tidak ditemukan di router/);
    expect(added).toHaveLength(0);
  });
});
