import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoucherGenerateDialog } from '../VoucherGenerateDialog';
import type { VoucherPlan } from '../../../core/db/schema';

const plans = [
  { id: 'p1', label: 'Paket 1 Jam', profileName: '1jam', price: 5000, createdAt: 1, updatedAt: 1 },
  { id: 'p2', label: 'Paket 3 Jam', profileName: '3jam', price: 10000, createdAt: 1, updatedAt: 1 },
  { id: 'p3', label: 'Paket 7 Jam', profileName: '7jam', price: 20000, createdAt: 1, updatedAt: 1 },
] as VoucherPlan[];

describe('VoucherGenerateDialog: beberapa paket dalam satu batch', () => {
  it('tombol "Tambah Paket Lain" tetap muncul walau baris pertama sudah 8 voucher', () => {
    render(
      <VoucherGenerateDialog open onOpenChange={vi.fn()} plans={plans} onGenerate={vi.fn()} />
    );
    expect(screen.getByText('8/8 voucher')).toBeTruthy();
    expect(screen.getByText('Tambah Paket Lain')).toBeTruthy();
  });

  it('menambah paket mengambil 1 slot dari baris terbesar, total tetap 8', () => {
    render(
      <VoucherGenerateDialog open onOpenChange={vi.fn()} plans={plans} onGenerate={vi.fn()} />
    );
    fireEvent.click(screen.getByText('Tambah Paket Lain'));
    expect(screen.getByText('8/8 voucher')).toBeTruthy();
    // jumlah per baris ditampilkan di elemen .text-xl (satu per baris paket)
    const qtys = Array.from(document.querySelectorAll('.text-xl')).map(el => el.textContent);
    expect(qtys).toEqual(['7', '1']);
  });

  it('tombol tambah hilang saat semua paket sudah dipakai', () => {
    render(
      <VoucherGenerateDialog open onOpenChange={vi.fn()} plans={plans.slice(0, 2)} onGenerate={vi.fn()} />
    );
    fireEvent.click(screen.getByText('Tambah Paket Lain'));
    expect(screen.queryByText('Tambah Paket Lain')).toBeNull();
  });
});
