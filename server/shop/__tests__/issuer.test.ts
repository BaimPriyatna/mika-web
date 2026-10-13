// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { VoucherIssuer } from '../issuer.ts';
import type { Order } from '../types.ts';
import { FakeRouter } from './helpers.ts';

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'WT-order00000000000000001',
    packageId: 'plan-1h',
    packageName: 'Paket 1 Jam',
    profileName: '1jam',
    validityMinutes: 60,
    amount: 5000,
    currency: 'IDR',
    provider: 'midtrans',
    paymentExpiresAt: 1,
    paymentStatus: 'paid',
    issuanceStatus: 'issuing',
    issueAttempts: 1,
    anomalies: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function hooks() {
  const saved: string[] = [];
  return { saved, h: { saveCode: async (c: string) => void saved.push(c) } };
}

describe('VoucherIssuer', () => {
  it('membuat akun: username = password, profil benar, comment lengkap dengan masa berlaku dari router', async () => {
    const router = new FakeRouter();
    const { h } = hooks();
    const o = order();
    const code = await new VoucherIssuer(router).issue(o, h);

    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(router.users).toHaveLength(1);
    expect(router.users[0]).toMatchObject({ name: code, password: code, profile: '1jam' });
    expect(router.users[0].comment).toBe(`vm|b=${o.id}|p=5000|v=60|plan=plan-1h|sale=online`);
  });

  it('masa berlaku mengikuti profil di router; jika profil tanpa session-timeout memakai snapshot paket', async () => {
    const router = new FakeRouter();
    router.profiles[0]['session-timeout'] = '2h';
    await new VoucherIssuer(router).issue(order(), hooks().h);
    expect(router.users[0].comment).toContain('|v=120|');

    const router2 = new FakeRouter();
    delete router2.profiles[0]['session-timeout'];
    await new VoucherIssuer(router2).issue(order({ validityMinutes: 45 }), hooks().h);
    expect(router2.users[0].comment).toContain('|v=45|');
  });

  it('kode disimpan SEBELUM akun dibuat di router', async () => {
    const router = new FakeRouter();
    const events: string[] = [];
    const wrapped = new VoucherIssuer({
      ensureConnected: () => router.ensureConnected(),
      print: (p, q) => router.print(p, q),
      add: async (p, b) => {
        events.push('add');
        return router.add(p, b);
      },
    });
    await wrapped.issue(order(), { saveCode: async () => void events.push('save') });
    expect(events).toEqual(['save', 'add']);
  });

  it('idempoten: dijalankan dua kali hanya membuat satu akun dengan kode yang sama', async () => {
    const router = new FakeRouter();
    const issuer = new VoucherIssuer(router);
    const o = order();
    const first = hooks();
    const code1 = await issuer.issue(o, first.h);
    const code2 = await issuer.issue({ ...o, voucherCode: code1 }, hooks().h);
    expect(code2).toBe(code1);
    expect(router.adds).toBe(1);
    expect(router.users).toHaveLength(1);
  });

  it('akun sudah dibuat tetapi balasan router hilang: percobaan berikutnya tidak membuat akun ganda', async () => {
    const router = new FakeRouter();
    router.addCreatesThenThrows = true;
    const issuer = new VoucherIssuer(router);
    const first = hooks();
    await expect(issuer.issue(order(), first.h)).rejects.toThrow();
    expect(router.users).toHaveLength(1);

    const code = await issuer.issue(order({ voucherCode: first.saved[0] }), hooks().h);
    expect(code).toBe(first.saved[0]);
    expect(router.users).toHaveLength(1);
    expect(router.adds).toBe(1);
  });

  it('kode bentrok dengan akun lain: kode diganti, akun lain tidak disentuh', async () => {
    const router = new FakeRouter();
    router.users.push({ '.id': '*0', name: 'ABCDE2', password: 'x', comment: 'dibuat manual' });
    const { saved, h } = hooks();
    const code = await new VoucherIssuer(router).issue(order({ voucherCode: 'ABCDE2' }), h);
    expect(code).not.toBe('ABCDE2');
    expect(saved).toContain(code);
    expect(router.users.find(u => u.name === 'ABCDE2')?.comment).toBe('dibuat manual');
    expect(router.users).toHaveLength(2);
  });

  it('profil tidak ada di router: gagal tanpa membuat akun', async () => {
    const router = new FakeRouter();
    await expect(new VoucherIssuer(router).issue(order({ profileName: 'hilang' }), hooks().h)).rejects.toThrow(/tidak ditemukan/);
    expect(router.users).toHaveLength(0);
  });

  it('profil dengan shared-users bukan 1 ditolak (aturan 1 akun 1 perangkat)', async () => {
    const router = new FakeRouter();
    router.profiles[0]['shared-users'] = '5';
    await expect(new VoucherIssuer(router).issue(order(), hooks().h)).rejects.toThrow(/shared-users/);
    expect(router.users).toHaveLength(0);
  });

  it('router offline: gagal dengan pesan jelas', async () => {
    const router = new FakeRouter();
    router.offline = true;
    await expect(new VoucherIssuer(router).issue(order(), hooks().h)).rejects.toThrow(/tidak terjangkau/);
  });

  it('verifikasi setelah dibuat: akun yang tidak tersimpan di router terdeteksi', async () => {
    const router = new FakeRouter();
    router.addDropsSilently = true;
    await expect(new VoucherIssuer(router).issue(order(), hooks().h)).rejects.toThrow(/verifikasi gagal/);
  });

  it('tidak menyentuh akun manual yang sudah ada', async () => {
    const router = new FakeRouter();
    router.users.push({ '.id': '*0', name: 'MANUAL', password: 'MANUAL', comment: 'vm|b=batch-lama|p=5000' });
    await new VoucherIssuer(router).issue(order(), hooks().h);
    expect(router.users).toHaveLength(2);
    expect(router.users[0]).toMatchObject({ name: 'MANUAL' });
  });
});
