// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { GatewayError, WebhookAuthError, WebhookFormatError } from '../gateway.ts';
import { MidtransGateway, mapMidtransStatus } from '../midtrans.ts';
import { SERVER_KEY, makeMidtransMock, signedNotification } from './helpers.ts';

function gateway(opts: { isProduction?: boolean; serverKey?: string } = {}) {
  const mock = makeMidtransMock();
  const gw = new MidtransGateway({
    serverKey: opts.serverKey ?? SERVER_KEY,
    isProduction: opts.isProduction ?? false,
    fetchFn: mock.fetch,
  });
  return { gw, mock };
}

describe('MidtransGateway.createPayment', () => {
  it('mengirim charge QRIS sesuai dokumentasi: URL sandbox, Basic Auth, nominal, kedaluwarsa', async () => {
    const { gw, mock } = gateway();
    const result = await gw.createPayment({ orderId: 'WT-abc', amount: 5000, itemName: 'Paket 1 Jam', expiryMinutes: 15 });

    expect(mock.charges).toHaveLength(1);
    const call = mock.charges[0];
    expect(call.url).toBe('https://api.sandbox.midtrans.com/v2/charge');
    expect(call.headers.Authorization).toBe('Basic ' + Buffer.from(SERVER_KEY + ':').toString('base64'));
    expect(call.body).toMatchObject({
      payment_type: 'qris',
      transaction_details: { order_id: 'WT-abc', gross_amount: 5000 },
      qris: { acquirer: 'gopay' },
      custom_expiry: { expiry_duration: 15, unit: 'minute' },
    });
    expect(result.providerTransactionId).toBe('tx-WT-abc');
    expect(result.qrString).toMatch(/^0002/);
  });

  it('mode produksi memakai api.midtrans.com', async () => {
    const { gw, mock } = gateway({ isProduction: true });
    await gw.createPayment({ orderId: 'WT-1', amount: 1000, itemName: 'x', expiryMinutes: 10 });
    expect(mock.charges[0].url).toBe('https://api.midtrans.com/v2/charge');
  });

  it('nama item dipotong maksimal 50 karakter', async () => {
    const { gw, mock } = gateway();
    await gw.createPayment({ orderId: 'WT-1', amount: 1000, itemName: 'A'.repeat(120), expiryMinutes: 10 });
    const items = mock.charges[0].body.item_details as Array<{ name: string }>;
    expect(items[0].name).toHaveLength(50);
  });

  it('menolak jika Midtrans mengembalikan error atau respons tanpa qr_string', async () => {
    const { gw, mock } = gateway();
    mock.failCharge = true;
    await expect(gw.createPayment({ orderId: 'WT-1', amount: 1000, itemName: 'x', expiryMinutes: 10 })).rejects.toBeInstanceOf(GatewayError);

    const noQr = new MidtransGateway({
      serverKey: SERVER_KEY,
      isProduction: false,
      fetchFn: (async () => new Response(JSON.stringify({ status_code: '201', transaction_id: 't' }), { status: 200 })) as typeof fetch,
    });
    await expect(noQr.createPayment({ orderId: 'WT-1', amount: 1000, itemName: 'x', expiryMinutes: 10 })).rejects.toThrow(/qr_string/);
  });

  it('kegagalan jaringan menjadi GatewayError tanpa membocorkan server key', async () => {
    const gw = new MidtransGateway({
      serverKey: SERVER_KEY,
      isProduction: false,
      fetchFn: (async () => {
        throw new Error(`connect failed using ${SERVER_KEY}`);
      }) as typeof fetch,
    });
    const err = (await gw.createPayment({ orderId: 'WT-1', amount: 1000, itemName: 'x', expiryMinutes: 10 }).catch(e => e)) as Error;
    expect(err).toBeInstanceOf(GatewayError);
    expect(String(err.message)).not.toContain(SERVER_KEY);
  });

  it('isConfigured false jika server key kosong', () => {
    expect(gateway({ serverKey: '' }).gw.isConfigured()).toBe(false);
    expect(gateway().gw.isConfigured()).toBe(true);
  });
});

describe('MidtransGateway.verifyWebhook', () => {
  it('menerima notifikasi bertanda tangan benar dan menormalkan nominal "5000.00"', async () => {
    const { gw } = gateway();
    const event = await gw.verifyWebhook(signedNotification('WT-abc', 'settlement', '5000.00'));
    expect(event).toMatchObject({ orderId: 'WT-abc', amount: 5000, status: 'paid', rawStatus: 'settlement', providerTransactionId: 'tx-WT-abc' });
  });

  it('menerima tanda tangan heksadesimal huruf besar', async () => {
    const { gw } = gateway();
    const n = signedNotification('WT-abc', 'settlement', '5000.00');
    n.signature_key = n.signature_key.toUpperCase();
    await expect(gw.verifyWebhook(n)).resolves.toMatchObject({ status: 'paid' });
  });

  it('menolak tanda tangan dari server key lain', async () => {
    const { gw } = gateway();
    const forged = signedNotification('WT-abc', 'settlement', '5000.00', {}, 'SB-Mid-server-ATTACKER');
    await expect(gw.verifyWebhook(forged)).rejects.toBeInstanceOf(WebhookAuthError);
  });

  it('menolak jika nominal diubah setelah ditandatangani', async () => {
    const { gw } = gateway();
    const n = signedNotification('WT-abc', 'settlement', '5000.00');
    n.gross_amount = '1.00';
    await expect(gw.verifyWebhook(n)).rejects.toBeInstanceOf(WebhookAuthError);
  });

  it('menolak jika order_id atau status_code diubah', async () => {
    const { gw } = gateway();
    const a = signedNotification('WT-abc', 'settlement', '5000.00');
    a.order_id = 'WT-other';
    await expect(gw.verifyWebhook(a)).rejects.toBeInstanceOf(WebhookAuthError);
    const b = signedNotification('WT-abc', 'settlement', '5000.00');
    b.status_code = '201';
    await expect(gw.verifyWebhook(b)).rejects.toBeInstanceOf(WebhookAuthError);
  });

  it('menolak payload yang bukan objek atau tidak lengkap', async () => {
    const { gw } = gateway();
    await expect(gw.verifyWebhook(null)).rejects.toBeInstanceOf(WebhookFormatError);
    await expect(gw.verifyWebhook('x')).rejects.toBeInstanceOf(WebhookFormatError);
    await expect(gw.verifyWebhook({})).rejects.toBeInstanceOf(WebhookFormatError);
    const n = signedNotification('WT-abc', 'settlement', '5000.00') as Record<string, unknown>;
    delete n.signature_key;
    await expect(gw.verifyWebhook(n)).rejects.toBeInstanceOf(WebhookFormatError);
  });

  it('server key kosong: semua notifikasi ditolak (tanda tangan tidak mungkin cocok)', async () => {
    const { gw } = gateway({ serverKey: '' });
    await expect(gw.verifyWebhook(signedNotification('WT-abc', 'settlement', '5000.00', {}, 'SB-Mid-server-X'))).rejects.toBeInstanceOf(WebhookAuthError);
  });
});

describe('pemetaan status Midtrans', () => {
  it.each([
    ['settlement', undefined, 'paid'],
    ['pending', undefined, 'pending'],
    ['expire', undefined, 'expired'],
    ['cancel', undefined, 'cancelled'],
    ['deny', undefined, 'failed'],
    ['failure', undefined, 'failed'],
    ['capture', 'accept', 'paid'],
    ['capture', 'challenge', 'pending'],
    ['sesuatu-baru', undefined, 'unknown'],
  ])('%s (fraud=%s) -> %s', (status, fraud, expected) => {
    expect(mapMidtransStatus(status, fraud).status).toBe(expected);
  });

  it.each(['refund', 'partial_refund', 'chargeback', 'partial_chargeback'])('%s ditandai refunded', status => {
    expect(mapMidtransStatus(status)).toEqual({ status: 'paid', refunded: true });
  });
});

describe('MidtransGateway.fetchStatus', () => {
  it('mengembalikan status dari API status', async () => {
    const { gw, mock } = gateway();
    mock.statuses.set('WT-abc', { transaction_status: 'settlement', gross_amount: '5000.00' });
    const event = await gw.fetchStatus('WT-abc');
    expect(event).toMatchObject({ orderId: 'WT-abc', amount: 5000, status: 'paid' });
  });

  it('null jika pesanan tidak dikenal penyedia (HTTP 404 atau status_code 404)', async () => {
    const { gw } = gateway();
    expect(await gw.fetchStatus('WT-none')).toBeNull();
    const body404 = new MidtransGateway({
      serverKey: SERVER_KEY,
      isProduction: false,
      fetchFn: (async () => new Response(JSON.stringify({ status_code: '404' }), { status: 200 })) as typeof fetch,
    });
    expect(await body404.fetchStatus('WT-x')).toBeNull();
  });

  it('menolak respons untuk pesanan lain atau server error', async () => {
    const other = new MidtransGateway({
      serverKey: SERVER_KEY,
      isProduction: false,
      fetchFn: (async () => new Response(JSON.stringify({ status_code: '200', order_id: 'WT-lain', transaction_status: 'settlement', gross_amount: '5000.00' }), { status: 200 })) as typeof fetch,
    });
    await expect(other.fetchStatus('WT-abc')).rejects.toBeInstanceOf(GatewayError);
    const down = new MidtransGateway({
      serverKey: SERVER_KEY,
      isProduction: false,
      fetchFn: (async () => new Response('{}', { status: 500 })) as typeof fetch,
    });
    await expect(down.fetchStatus('WT-abc')).rejects.toBeInstanceOf(GatewayError);
  });
});
