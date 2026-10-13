// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { WebhookAuthError, WebhookFormatError } from '../gateway.ts';
import { ShopError } from '../types.ts';
import type { Harness } from './helpers.ts';
import { PKG_1H, SERVER_KEY, makeHarness, signedNotification } from './helpers.ts';

async function buy(h: Harness, packageId = 'plan-1h', idempotencyKey?: string) {
  return h.service.createOrder({ packageId, idempotencyKey });
}

async function pay(h: Harness, orderId: string, amount = '5000.00', status = 'settlement') {
  return h.service.handleWebhook(signedNotification(orderId, status, amount));
}

async function expectShopError(promise: Promise<unknown>, status: number, code?: string) {
  const err = await promise.then(
    () => null,
    e => e as ShopError
  );
  expect(err).toBeInstanceOf(ShopError);
  expect(err!.status).toBe(status);
  if (code) expect(err!.code).toBe(code);
}

describe('daftar paket', () => {
  it('hanya paket aktif; harga dari server', async () => {
    const h = await makeHarness();
    await h.service.saveSettings({
      enabled: true,
      paymentExpiryMinutes: 15,
      packages: [PKG_1H, { ...PKG_1H, id: 'plan-off', label: 'Nonaktif', enabled: false }],
    });
    const list = h.service.listPackages();
    expect(list.enabled).toBe(true);
    expect(list.packages).toEqual([{ id: 'plan-1h', label: 'Paket 1 Jam', price: 5000, durationLabel: '1 jam' }]);
    expect(list.loginUrl).toBe('http://hotspot.tkj/login');
  });

  it('kosong jika penjualan dimatikan atau penyedia belum dikonfigurasi', async () => {
    const off = await makeHarness({ settings: { enabled: false } });
    expect(off.service.listPackages()).toMatchObject({ enabled: false, packages: [] });
    const noKey = await makeHarness({ serverKey: '' });
    expect(noKey.service.listPackages()).toMatchObject({ enabled: false, packages: [] });
  });
});

describe('membuat pesanan', () => {
  it('harga selalu dari server, status menunggu bayar, QR dirender, tanpa kode', async () => {
    const h = await makeHarness();
    const input = { packageId: 'plan-1h', price: 1, amount: 1 }; // browser mencoba menyisipkan harga
    const view = await h.service.createOrder(input);

    expect(view.state).toBe('waiting_payment');
    expect(view.amount).toBe(5000);
    expect(h.midtrans.charges).toHaveLength(1);
    expect((h.midtrans.charges[0].body.transaction_details as { gross_amount: number }).gross_amount).toBe(5000);
    expect(view.id).toMatch(/^WT-[A-Za-z0-9_-]{22}$/);
    expect(view.qrDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(Buffer.from(view.qrDataUrl!.split(',')[1], 'base64').toString()).toContain('<svg');
    expect(view.code).toBeUndefined();

    const json = JSON.stringify(view);
    expect(json).not.toContain(SERVER_KEY);
    expect(json).not.toContain('000201'); // string QR mentah tidak ikut dikirim
    expect(h.store.getOrder(view.id)).toMatchObject({ paymentStatus: 'pending', issuanceStatus: 'not_issued', amount: 5000 });
  });

  it('menolak paket tidak dikenal, paket nonaktif, tipe salah', async () => {
    const h = await makeHarness();
    await expectShopError(buy(h, 'tidak-ada'), 400, 'unknown_package');
    await expectShopError(h.service.createOrder({ packageId: { $ne: 1 } }), 400, 'unknown_package');
    await expectShopError(h.service.createOrder({ packageId: undefined }), 400, 'unknown_package');
    await h.service.saveSettings({ enabled: true, paymentExpiryMinutes: 15, packages: [{ ...PKG_1H, enabled: false }] });
    await expectShopError(buy(h, 'plan-1h'), 400, 'unknown_package');
    expect(h.midtrans.charges).toHaveLength(0);
  });

  it('menolak jika penjualan dimatikan atau penyedia belum dikonfigurasi', async () => {
    const off = await makeHarness({ settings: { enabled: false } });
    await expectShopError(buy(off), 503, 'sales_disabled');
    const noKey = await makeHarness({ serverKey: '' });
    await expectShopError(buy(noKey), 503, 'not_configured');
  });

  it('gagal membuat pembayaran: pelanggan menerima pesan umum, pesanan ditandai gagal, detail hanya di catatan admin', async () => {
    const h = await makeHarness();
    h.midtrans.failCharge = true;
    const err = (await buy(h).catch(e => e)) as ShopError;
    expect(err).toBeInstanceOf(ShopError);
    expect(err.status).toBe(502);
    expect(err.message).toBe('Gagal membuat pembayaran. Silakan coba lagi.');
    const [order] = h.store.listOrders();
    expect(order.paymentStatus).toBe('failed');
    expect(order.lastError).toContain('Midtrans');
    expect(h.router.users).toHaveLength(0);
  });

  it('idempotensi: kunci yang sama (termasuk klik ganda bersamaan) hanya membuat satu pesanan dan satu charge', async () => {
    const h = await makeHarness();
    const views = await Promise.all(Array.from({ length: 5 }, () => buy(h, 'plan-1h', 'kunci-klik-12345678')));
    expect(new Set(views.map(v => v.id)).size).toBe(1);
    expect(h.midtrans.charges).toHaveLength(1);
    expect(h.store.listOrders()).toHaveLength(1);

    const again = await buy(h, 'plan-1h', 'kunci-klik-12345678');
    expect(again.id).toBe(views[0].id);
    expect(h.midtrans.charges).toHaveLength(1);
  });

  it('kunci idempotensi dipakai ulang untuk paket lain ditolak; kunci tidak valid ditolak', async () => {
    const h = await makeHarness();
    await buy(h, 'plan-1h', 'kunci-abc-12345678');
    await expectShopError(buy(h, 'plan-3h', 'kunci-abc-12345678'), 409, 'idempotency_conflict');
    await expectShopError(buy(h, 'plan-1h', 'x'), 400, 'invalid_idempotency_key');
    await expectShopError(buy(h, 'plan-1h', 'spasi tidak boleh!!'), 400, 'invalid_idempotency_key');
  });
});

describe('webhook pembayaran', () => {
  it('tanda tangan salah: ditolak, pesanan tetap pending, tidak ada akun dibuat', async () => {
    const h = await makeHarness();
    const view = await buy(h);
    const forged = signedNotification(view.id, 'settlement', '5000.00', {}, 'SB-Mid-server-ATTACKER');
    await expect(h.service.handleWebhook(forged)).rejects.toBeInstanceOf(WebhookAuthError);
    await expect(h.service.handleWebhook({ order_id: view.id })).rejects.toBeInstanceOf(WebhookFormatError);
    await h.service.idle();
    expect(h.store.getOrder(view.id)?.paymentStatus).toBe('pending');
    expect(h.router.users).toHaveLength(0);
  });

  it('pembayaran valid: pesanan dibayar, akun dibuat sekali, kode tampil, username = password', async () => {
    const h = await makeHarness();
    const view = await buy(h);
    expect(await pay(h, view.id)).toEqual({ result: 'applied' });
    await h.service.idle();

    const order = h.store.getOrder(view.id)!;
    expect(order).toMatchObject({ paymentStatus: 'paid', issuanceStatus: 'issued' });
    expect(h.router.onlineUsers()).toHaveLength(1);
    const user = h.router.onlineUsers()[0];
    expect(user.name).toBe(user.password);
    expect(user.name).toBe(order.voucherCode);

    const pub = await h.service.getOrderPublic(view.id);
    expect(pub.state).toBe('ready');
    expect(pub.code).toBe(order.voucherCode);
    expect(pub.qrDataUrl).toBeUndefined();
  });

  it('webhook berulang dan bersamaan: tetap satu akun saja', async () => {
    const h = await makeHarness();
    const view = await buy(h);
    const payload = signedNotification(view.id, 'settlement', '5000.00');
    await Promise.all(Array.from({ length: 6 }, () => h.service.handleWebhook(payload)));
    await h.service.idle();
    for (let i = 0; i < 3; i++) {
      await h.service.handleWebhook(payload); // setelah selesai pun
      await h.service.idle();
    }
    expect(h.router.onlineUsers()).toHaveLength(1);
    expect(h.router.adds).toBe(1);
    expect(h.store.getOrder(view.id)!.issueAttempts).toBe(1);
  });

  it('nominal tidak cocok (walau tanda tangan benar): ditolak, dicatat, tidak ada akun', async () => {
    const h = await makeHarness();
    const view = await buy(h);
    await expectShopError(pay(h, view.id, '1.00'), 400, 'amount_mismatch');
    await h.service.idle();
    const order = h.store.getOrder(view.id)!;
    expect(order.paymentStatus).toBe('pending');
    expect(order.anomalies.join(' ')).toContain('Nominal tidak cocok');
    expect(h.router.users).toHaveLength(0);
  });

  it('ID transaksi provider yang berbeda ditolak', async () => {
    const h = await makeHarness();
    const view = await buy(h);
    const n = signedNotification(view.id, 'settlement', '5000.00', { transaction_id: 'tx-orang-lain' });
    await expectShopError(h.service.handleWebhook(n), 400, 'transaction_mismatch');
    expect(h.store.getOrder(view.id)?.paymentStatus).toBe('pending');
  });

  it('pesanan tidak dikenal atau ID tidak berformat: 404', async () => {
    const h = await makeHarness();
    await expectShopError(h.service.handleWebhook(signedNotification('WT-' + 'a'.repeat(22), 'settlement', '5000.00')), 404);
    await expectShopError(h.service.handleWebhook(signedNotification('order-lain', 'settlement', '5000.00')), 404);
  });

  it('webhook settlement berulang: hasilnya "ignored" dan waktu bayar/penerbitan tidak berubah', async () => {
    const h = await makeHarness();
    const view = await buy(h);
    expect(await pay(h, view.id)).toEqual({ result: 'applied' });
    await h.service.idle();
    const before = h.store.getOrder(view.id)!;

    h.clock.now += 60_000;
    expect(await pay(h, view.id)).toEqual({ result: 'ignored' });
    await h.service.idle();
    const after = h.store.getOrder(view.id)!;
    expect(after.paidAt).toBe(before.paidAt);
    expect(after.issuedAt).toBe(before.issuedAt);
    expect(after.voucherCode).toBe(before.voucherCode);
  });

  it('tryIssue langsung pada pesanan yang belum dibayar tidak membuat akun (lapisan pengaman kedua)', async () => {
    const h = await makeHarness();
    const view = await buy(h);
    await h.service.tryIssue(view.id);
    await h.service.tryIssue(view.id, { force: true });
    expect(h.router.users).toHaveLength(0);
    expect(h.store.getOrder(view.id)).toMatchObject({ paymentStatus: 'pending', issuanceStatus: 'not_issued' });

    await pay(h, view.id, '5000.00', 'expire');
    await h.service.tryIssue(view.id, { force: true });
    expect(h.router.users).toHaveLength(0);
  });

  it('status dibayar tidak pernah turun walau webhook terlambat berstatus expire/cancel/deny', async () => {
    const h = await makeHarness();
    const view = await buy(h);
    await pay(h, view.id);
    await h.service.idle();
    for (const status of ['expire', 'cancel', 'deny', 'pending']) {
      await pay(h, view.id, '5000.00', status);
    }
    expect(h.store.getOrder(view.id)).toMatchObject({ paymentStatus: 'paid', issuanceStatus: 'issued' });
  });

  it('expire lalu settlement terlambat: pembayaran tetap diakui dan akun terbit', async () => {
    const h = await makeHarness();
    const view = await buy(h);
    await pay(h, view.id, '5000.00', 'expire');
    expect(h.store.getOrder(view.id)?.paymentStatus).toBe('expired');
    expect((await h.service.getOrderPublic(view.id)).state).toBe('expired');
    await pay(h, view.id, '5000.00', 'settlement');
    await h.service.idle();
    expect(h.store.getOrder(view.id)).toMatchObject({ paymentStatus: 'paid', issuanceStatus: 'issued' });
  });

  it('status gagal/dibatalkan/kedaluwarsa tidak menerbitkan akun', async () => {
    const h = await makeHarness();
    for (const [status, expected] of [['deny', 'failed'], ['cancel', 'cancelled'], ['expire', 'expired']] as const) {
      const view = await buy(h);
      await pay(h, view.id, '5000.00', status);
      await h.service.idle();
      expect(h.store.getOrder(view.id)).toMatchObject({ paymentStatus: expected, issuanceStatus: 'not_issued' });
    }
    expect(h.router.users).toHaveLength(0);
  });

  it('refund untuk pesanan yang belum pernah dibayar: tidak menerbitkan akun; refund setelah dibayar: akun dibiarkan, ditandai', async () => {
    const h = await makeHarness();
    const a = await buy(h);
    await pay(h, a.id, '5000.00', 'refund');
    await h.service.idle();
    expect(h.store.getOrder(a.id)).toMatchObject({ paymentStatus: 'pending', refunded: true });
    expect(h.router.users).toHaveLength(0);

    const b = await buy(h);
    await pay(h, b.id);
    await h.service.idle();
    await pay(h, b.id, '5000.00', 'refund');
    expect(h.store.getOrder(b.id)).toMatchObject({ paymentStatus: 'paid', issuanceStatus: 'issued', refunded: true });
    expect(h.router.onlineUsers()).toHaveLength(1);
  });

  it('status tidak dikenal: diabaikan dan dicatat (tanpa catatan berulang)', async () => {
    const h = await makeHarness();
    const view = await buy(h);
    await pay(h, view.id, '5000.00', 'status-baru');
    await pay(h, view.id, '5000.00', 'status-baru');
    const order = h.store.getOrder(view.id)!;
    expect(order.paymentStatus).toBe('pending');
    expect(order.anomalies).toHaveLength(1);
  });
});

describe('router offline dan percobaan ulang', () => {
  it('bayar saat router offline: pembayaran diakui, akun belum terbit, pelanggan TIDAK melihat kode atau pesan gagal', async () => {
    const h = await makeHarness();
    h.router.offline = true;
    const view = await buy(h);
    await pay(h, view.id);
    await h.service.idle();

    const order = h.store.getOrder(view.id)!;
    expect(order).toMatchObject({ paymentStatus: 'paid', issuanceStatus: 'retry_pending', issueAttempts: 1 });
    expect(order.lastError).toMatch(/tidak terjangkau/);

    const pub = await h.service.getOrderPublic(view.id);
    expect(pub.state).toBe('processing');
    expect(pub.code).toBeUndefined();
    expect(pub.message).toMatch(/Pembayaran sudah diterima/);
  });

  it('kode yang sudah tersimpan tetapi akun belum terverifikasi tidak pernah dibocorkan ke pelanggan', async () => {
    const h = await makeHarness();
    h.router.addDropsSilently = true; // kode disimpan, add "berhasil", tetapi akun tidak ada
    const view = await buy(h);
    await pay(h, view.id);
    await h.service.idle();

    const order = h.store.getOrder(view.id)!;
    expect(order.voucherCode).toBeDefined();
    expect(order.issuanceStatus).toBe('retry_pending');
    const pub = await h.service.getOrderPublic(view.id);
    expect(pub.state).toBe('processing');
    expect(pub.code).toBeUndefined();
    expect(JSON.stringify(pub)).not.toContain(order.voucherCode!);
  });

  it('retry dengan backoff; router kembali: akun terbit tepat sekali', async () => {
    const h = await makeHarness();
    h.router.offline = true;
    const view = await buy(h);
    await pay(h, view.id);
    await h.service.idle();

    const first = h.store.getOrder(view.id)!;
    expect(first.nextRetryAt).toBe(h.clock.now + 1000);

    // belum waktunya: tidak dicoba
    expect(await h.service.processDue()).toBe(0);
    expect(h.store.getOrder(view.id)!.issueAttempts).toBe(1);

    h.clock.now += 1000;
    await h.service.processDue();
    const second = h.store.getOrder(view.id)!;
    expect(second.issueAttempts).toBe(2);
    expect(second.nextRetryAt).toBe(h.clock.now + 2000); // backoff berlipat

    h.router.offline = false;
    h.clock.now += 2000;
    await h.service.processDue();
    expect(h.store.getOrder(view.id)).toMatchObject({ issuanceStatus: 'issued', issueAttempts: 3 });
    expect(h.router.onlineUsers()).toHaveLength(1);

    h.clock.now += 100_000;
    await h.service.processDue();
    expect(h.router.adds).toBe(1);
  });

  it('melewati batas percobaan: issue_failed, tidak dicoba otomatis lagi, admin bisa mencoba ulang', async () => {
    const h = await makeHarness(); // maxAttempts = 4
    h.router.offline = true;
    const view = await buy(h);
    await pay(h, view.id);
    await h.service.idle();
    for (let i = 0; i < 3; i++) {
      h.clock.now += 100_000;
      await h.service.processDue();
    }
    const order = h.store.getOrder(view.id)!;
    expect(order).toMatchObject({ paymentStatus: 'paid', issuanceStatus: 'issue_failed', issueAttempts: 4 });

    h.router.offline = false;
    h.clock.now += 100_000;
    expect(await h.service.processDue()).toBe(0); // tidak otomatis
    expect((await h.service.getOrderPublic(view.id)).message).toMatch(/Hubungi petugas/);

    const fixed = await h.service.retryIssuance(view.id);
    expect(fixed.issuanceStatus).toBe('issued');
    expect(h.router.onlineUsers()).toHaveLength(1);
  });

  it('akun sudah dibuat tetapi balasan hilang: percobaan berikutnya tidak menggandakan akun', async () => {
    const h = await makeHarness();
    h.router.addCreatesThenThrows = true;
    const view = await buy(h);
    await pay(h, view.id);
    await h.service.idle();
    expect(h.store.getOrder(view.id)!.issuanceStatus).toBe('retry_pending');
    expect(h.router.users).toHaveLength(1);

    h.clock.now += 5000;
    await h.service.processDue();
    expect(h.store.getOrder(view.id)).toMatchObject({ issuanceStatus: 'issued' });
    expect(h.router.users).toHaveLength(1);
    expect(h.router.adds).toBe(1);
  });

  it('pemulihan setelah proses mati mendadak: status "issuing" dikembalikan ke antrean tanpa akun ganda', async () => {
    const h = await makeHarness();
    h.router.addCreatesThenThrows = true;
    const view = await buy(h);
    await pay(h, view.id);
    await h.service.idle();
    await h.store.updateOrder(view.id, o => {
      o.issuanceStatus = 'issuing'; // seolah proses mati di tengah penerbitan
    });

    expect(await h.service.recoverStuck()).toBe(1);
    await h.service.processDue();
    expect(h.store.getOrder(view.id)).toMatchObject({ issuanceStatus: 'issued' });
    expect(h.router.users).toHaveLength(1);
  });

  it('retryIssuance menolak pesanan yang belum dibayar atau sudah terbit', async () => {
    const h = await makeHarness();
    const view = await buy(h);
    await expectShopError(h.service.retryIssuance(view.id), 409, 'not_paid');
    await pay(h, view.id);
    await h.service.idle();
    await expectShopError(h.service.retryIssuance(view.id), 409, 'already_issued');
    await expectShopError(h.service.retryIssuance('WT-tidak-ada'), 404);
  });
});

describe('cek status ke penyedia (cadangan jika webhook tidak sampai)', () => {
  it('pending di penyedia sudah settlement: pesanan menjadi dibayar dan akun terbit tanpa webhook', async () => {
    const h = await makeHarness();
    const view = await buy(h);
    h.midtrans.statuses.set(view.id, { transaction_status: 'settlement' });

    const first = await h.service.getOrderPublic(view.id);
    expect(['waiting_payment', 'processing', 'ready']).toContain(first.state);
    await h.service.idle();
    const second = await h.service.getOrderPublic(view.id);
    expect(second.state).toBe('ready');
    expect(second.code).toBeDefined();
    expect(h.router.onlineUsers()).toHaveLength(1);
  });

  it('pengecekan dibatasi: tidak memanggil penyedia di setiap polling', async () => {
    const h = await makeHarness();
    const view = await buy(h);
    h.midtrans.statuses.set(view.id, { transaction_status: 'pending' });

    await h.service.getOrderPublic(view.id);
    await h.service.getOrderPublic(view.id);
    await h.service.getOrderPublic(view.id);
    expect(h.midtrans.statusCalls).toHaveLength(1);

    h.clock.now += 9000;
    await h.service.getOrderPublic(view.id);
    expect(h.midtrans.statusCalls).toHaveLength(2);
  });

  it('status dari penyedia dengan nominal berbeda tidak dipercaya', async () => {
    const h = await makeHarness();
    const view = await buy(h);
    h.midtrans.statuses.set(view.id, { transaction_status: 'settlement', gross_amount: '1.00' });
    await h.service.getOrderPublic(view.id);
    await h.service.idle();
    expect(h.store.getOrder(view.id)?.paymentStatus).toBe('pending');
    expect(h.router.users).toHaveLength(0);
  });

  it('pending lewat batas waktu + jeda ditampilkan sebagai kedaluwarsa, tetapi pembayaran terlambat masih diakui', async () => {
    const h = await makeHarness();
    const view = await buy(h);
    h.midtrans.statuses.set(view.id, { transaction_status: 'pending' });
    h.clock.now += 15 * 60_000 + 130_000;
    expect((await h.service.getOrderPublic(view.id)).state).toBe('expired');

    await pay(h, view.id);
    await h.service.idle();
    expect((await h.service.getOrderPublic(view.id)).state).toBe('ready');
  });
});

describe('rekonsiliasi pesanan tertunda (tanpa webhook)', () => {
  it('pesanan dibayar saat halaman pelanggan sudah ditutup: ditemukan lewat pemeriksaan berkala dan akun terbit', async () => {
    const h = await makeHarness();
    const view = await buy(h);
    h.midtrans.statuses.set(view.id, { transaction_status: 'settlement' });

    h.clock.now += 31_000; // pelanggan tidak membuka halaman lagi
    expect(await h.service.reconcilePending()).toBe(1);
    await h.service.idle();
    expect(h.store.getOrder(view.id)).toMatchObject({ paymentStatus: 'paid', issuanceStatus: 'issued' });
    expect(h.router.onlineUsers()).toHaveLength(1);
  });

  it('dibatasi: tidak memeriksa ulang sebelum 30 detik, tidak memeriksa pesanan yang sudah lama lewat, tidak menyentuh yang sudah final', async () => {
    const h = await makeHarness();
    const fresh = await buy(h);
    h.midtrans.statuses.set(fresh.id, { transaction_status: 'pending' });
    h.clock.now += 31_000;
    expect(await h.service.reconcilePending()).toBe(1);
    expect(await h.service.reconcilePending()).toBe(0); // baru saja diperiksa
    expect(h.midtrans.statusCalls).toHaveLength(1);

    h.clock.now += 60 * 60_000; // jauh melewati batas waktu bayar
    expect(await h.service.reconcilePending()).toBe(0);

    const paid = await makeHarness();
    const v = await buy(paid);
    await pay(paid, v.id);
    await paid.service.idle();
    paid.clock.now += 31_000;
    expect(await paid.service.reconcilePending()).toBe(0);
  });

  it('kegagalan penyedia pada satu pesanan tidak menghentikan pemeriksaan pesanan lain', async () => {
    const h = await makeHarness();
    const a = await buy(h);
    const b = await buy(h);
    h.midtrans.statusFailures.add(a.id);
    h.midtrans.statuses.set(b.id, { transaction_status: 'settlement' });

    h.clock.now += 31_000;
    expect(await h.service.reconcilePending()).toBe(2);
    await h.service.idle();
    expect(h.store.getOrder(b.id)?.paymentStatus).toBe('paid');
    expect(h.store.getOrder(a.id)?.paymentStatus).toBe('pending');
    expect(h.logs.some(l => l.startsWith('rekonsiliasi gagal'))).toBe(true);
  });
});

describe('tampilan publik dan admin', () => {
  it('ID pesanan tidak valid: 400; tidak ada: 404', async () => {
    const h = await makeHarness();
    await expectShopError(h.service.getOrderPublic('abc'), 400, 'invalid_order_id');
    await expectShopError(h.service.getOrderPublic("WT-'; DROP TABLE--"), 400);
    await expectShopError(h.service.getOrderPublic('WT-' + 'a'.repeat(22)), 404, 'not_found');
  });

  it('daftar admin tidak memuat string QR; berisi status pembayaran dan penerbitan terpisah', async () => {
    const h = await makeHarness();
    const view = await buy(h);
    await pay(h, view.id);
    await h.service.idle();
    const [row] = h.service.listOrdersForAdmin();
    expect(row).not.toHaveProperty('qrString');
    expect(row).toMatchObject({ id: view.id, paymentStatus: 'paid', issuanceStatus: 'issued', amount: 5000 });
  });

  it('pengaturan divalidasi: harga di luar batas, ID ganda, ID berisi karakter berbahaya, masa berlaku di luar batas', async () => {
    const h = await makeHarness();
    const base = { enabled: true, paymentExpiryMinutes: 15 };
    await expectShopError(h.service.saveSettings({ ...base, packages: [{ ...PKG_1H, price: 100 }] }), 400, 'invalid_settings');
    await expectShopError(h.service.saveSettings({ ...base, packages: [{ ...PKG_1H, price: 5000.5 }] }), 400);
    await expectShopError(h.service.saveSettings({ ...base, packages: [{ ...PKG_1H, price: 99_999_999 }] }), 400);
    await expectShopError(h.service.saveSettings({ ...base, packages: [PKG_1H, PKG_1H] }), 400);
    await expectShopError(h.service.saveSettings({ ...base, packages: [{ ...PKG_1H, id: 'a b<script>' }] }), 400);
    await expectShopError(h.service.saveSettings({ ...base, packages: [{ ...PKG_1H, profileName: 'x\ny' }] }), 400);
    await expectShopError(h.service.saveSettings({ ...base, paymentExpiryMinutes: 1, packages: [] }), 400);
    await expectShopError(h.service.saveSettings('bukan objek'), 400);

    const ok = await h.service.saveSettings({ ...base, packages: [{ ...PKG_1H, price: 7500 }] });
    expect(ok.packages[0].price).toBe(7500);
  });

  it('perubahan harga paket tidak mengubah pesanan yang sudah dibuat (snapshot)', async () => {
    const h = await makeHarness();
    const view = await buy(h);
    await h.service.saveSettings({ enabled: true, paymentExpiryMinutes: 15, packages: [{ ...PKG_1H, price: 9000 }] });
    expect(h.store.getOrder(view.id)!.amount).toBe(5000);
    await pay(h, view.id, '5000.00'); // nominal lama tetap yang berlaku
    await h.service.idle();
    expect(h.store.getOrder(view.id)!.paymentStatus).toBe('paid');
  });

  it('retensi: pesanan lama yang selesai dihapus, yang dibayar tapi belum terbit dipertahankan', async () => {
    const h = await makeHarness({ config: { retentionDays: 1 } });
    const done = await buy(h);
    await pay(h, done.id);
    await h.service.idle();
    h.router.offline = true;
    const stuck = await buy(h);
    await pay(h, stuck.id);
    await h.service.idle();

    h.clock.now += 3 * 86_400_000;
    const removed = await h.service.purgeOld();
    expect(removed).toBe(1);
    expect(h.store.getOrder(done.id)).toBeUndefined(); // selesai dan sudah lama: dihapus
    expect(h.store.getOrder(stuck.id)).toBeDefined(); // sudah dibayar tetapi akun belum terbit: dipertahankan
  });
});
