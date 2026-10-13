import { describe, it, expect } from 'vitest';
import {
  buildPackageRows,
  formatRupiah,
  needsAttention,
  rowsToPackages,
  type AdminOrder,
  type SellablePackage,
} from '../shop-admin-api';

const saved: SellablePackage[] = [
  { id: 'p1', label: 'Paket 1 Jam', price: 7000, profileName: '1jam', validityMinutes: 60, enabled: true },
  { id: 'hilang', label: 'Paket lama', price: 3000, profileName: 'lama', validityMinutes: 30, enabled: true },
];

describe('buildPackageRows', () => {
  const plans = [
    { id: 'p1', label: 'Paket 1 Jam', profileName: '1jam', price: 5000 },
    { id: 'p2', label: 'Paket 3 Jam', profileName: '3jam', price: 10000 },
    { label: 'tanpa id', profileName: 'x', price: 1000 },
  ];

  it('harga yang sudah diatur di server dipertahankan; paket baru memakai harga paket lokal dan tidak terpilih', () => {
    const rows = buildPackageRows(plans, saved, { '1jam': 60, '3jam': 180 });
    const p1 = rows.find(r => r.id === 'p1')!;
    const p2 = rows.find(r => r.id === 'p2')!;
    expect(p1).toMatchObject({ price: 7000, selected: true, orphan: false, validityMinutes: 60 });
    expect(p2).toMatchObject({ price: 10000, selected: false, validityMinutes: 180 });
  });

  it('paket tanpa id diabaikan; paket server yang sudah tidak ada lokal ditandai orphan', () => {
    const rows = buildPackageRows(plans, saved, {});
    expect(rows.find(r => r.label === 'tanpa id')).toBeUndefined();
    expect(rows.find(r => r.id === 'hilang')).toMatchObject({ orphan: true, selected: true });
  });

  it('masa berlaku mengikuti profil router jika tersedia, jika tidak memakai yang tersimpan', () => {
    const withRouter = buildPackageRows(plans, saved, { '1jam': 90 });
    expect(withRouter.find(r => r.id === 'p1')!.validityMinutes).toBe(90);
    const without = buildPackageRows(plans, saved, {});
    expect(without.find(r => r.id === 'p1')!.validityMinutes).toBe(60);
    expect(without.find(r => r.id === 'p2')!.validityMinutes).toBeNull();
  });
});

describe('rowsToPackages', () => {
  it('hanya baris terpilih; harga dibulatkan; selalu enabled', () => {
    const out = rowsToPackages([
      { id: 'a', label: 'A', profileName: 'pa', validityMinutes: 60, price: 5000.4, selected: true, orphan: false },
      { id: 'b', label: 'B', profileName: 'pb', validityMinutes: null, price: 9000, selected: false, orphan: false },
    ]);
    expect(out).toEqual([{ id: 'a', label: 'A', price: 5000, profileName: 'pa', validityMinutes: 60, enabled: true }]);
  });
});

describe('needsAttention & formatRupiah', () => {
  const base: AdminOrder = {
    id: 'WT-1',
    packageId: 'p',
    packageName: 'P',
    amount: 5000,
    paymentStatus: 'paid',
    issuanceStatus: 'retry_pending',
    issueAttempts: 1,
    anomalies: [],
    createdAt: 1,
  };

  it('dibayar tetapi akun belum terbit butuh perhatian', () => {
    expect(needsAttention(base)).toBe(true);
    expect(needsAttention({ ...base, issuanceStatus: 'issue_failed' })).toBe(true);
    expect(needsAttention({ ...base, issuanceStatus: 'issued' })).toBe(false);
    expect(needsAttention({ ...base, paymentStatus: 'pending', issuanceStatus: 'not_issued' })).toBe(false);
    expect(needsAttention({ ...base, paymentStatus: 'expired', issuanceStatus: 'not_issued' })).toBe(false);
  });

  it('format rupiah dengan titik ribuan', () => {
    expect(formatRupiah(5000)).toBe('Rp 5.000');
    expect(formatRupiah(1250000)).toBe('Rp 1.250.000');
    expect(formatRupiah(999)).toBe('Rp 999');
  });
});
