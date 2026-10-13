// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const dir = resolve(__dirname, '../shop');
const html = readFileSync(resolve(dir, 'index.html'), 'utf-8');
const script = readFileSync(resolve(dir, 'shop.js'), 'utf-8');

type Json = Record<string, unknown>;
interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: Json;
}

const ORDER_ID = 'WT-' + 'a'.repeat(22);

function waitFor(cond: () => boolean, ms = 2000): Promise<void> {
  return new Promise((resolveFn, reject) => {
    const start = Date.now();
    const tick = () => {
      if (cond()) return resolveFn();
      if (Date.now() - start > ms) return reject(new Error('waitFor timeout'));
      setTimeout(tick, 10);
    };
    tick();
  });
}

let open: JSDOM[] = [];
afterEach(() => {
  open.forEach(d => d.window.close());
  open = [];
});

function start(
  handler: (call: Call) => { status?: number; json: Json } | undefined,
  url = 'http://localhost/beli'
) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  open.push(dom);
  const win = dom.window as unknown as Window & { eval: (s: string) => unknown; fetch: unknown; setTimeout: unknown };
  const calls: Call[] = [];

  win.fetch = async (input: string, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      path: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? (JSON.parse(String(init.body)) as Json) : undefined,
    };
    calls.push(call);
    const r = handler(call) ?? { status: 404, json: { success: false, error: 'tidak ada' } };
    const status = r.status ?? 200;
    return { ok: status < 400, status, json: async () => r.json };
  };
  // polling 3 detik dipercepat agar tes cepat
  const real = setTimeout;
  win.setTimeout = (fn: () => void, ms?: number) => real(fn, ms && ms >= 1000 ? 5 : ms);

  win.eval(script);
  return { dom, doc: win.document, calls, win };
}

const visible = (doc: Document) =>
  ['packages', 'pay', 'processing', 'ready', 'failed'].filter(v => !doc.getElementById('view-' + v)!.hidden);

const PACKAGES = {
  success: true,
  loginUrl: 'http://hotspot.tkj/login',
  packages: [
    { id: 'plan-1h', label: 'Paket 1 Jam', price: 5000, durationLabel: '1 jam' },
    { id: 'plan-3h', label: '<img src=x onerror=alert(1)>', price: 10000, durationLabel: '3 jam' },
  ],
};

const waitingOrder = {
  id: ORDER_ID,
  state: 'waiting_payment',
  packageName: 'Paket 1 Jam',
  durationLabel: '1 jam',
  amount: 5000,
  expiresAt: Date.now() + 10 * 60_000,
  qrDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
  loginUrl: 'http://hotspot.tkj/login',
};

describe('halaman beli: daftar paket', () => {
  it('menampilkan paket; teks dari server dipasang sebagai teks, bukan HTML', async () => {
    const { doc } = start(c => (c.path === '/api/shop/packages' ? { json: PACKAGES } : undefined));
    await waitFor(() => doc.querySelectorAll('.pkg').length === 2);

    expect(visible(doc)).toEqual(['packages']);
    const names = Array.from(doc.querySelectorAll('.pkg .name')).map(n => n.textContent);
    expect(names).toEqual(['Paket 1 Jam', '<img src=x onerror=alert(1)>']);
    expect(doc.querySelectorAll('.pkg img')).toHaveLength(0);
    expect(doc.querySelector('.pkg .price')?.textContent).toBe('Rp 5.000');
  });

  it('penjualan belum tersedia: pesan ramah, tanpa tombol paket', async () => {
    const { doc } = start(c => (c.path === '/api/shop/packages' ? { json: { success: true, packages: [] } } : undefined));
    await waitFor(() => !doc.getElementById('packages-empty')!.hidden);
    expect(doc.querySelectorAll('.pkg')).toHaveLength(0);
  });

  it('kegagalan memuat paket menampilkan pesan dari server', async () => {
    const { doc } = start(c => (c.path === '/api/shop/packages' ? { status: 503, json: { success: false, error: 'Penjualan online belum tersedia' } } : undefined));
    await waitFor(() => !doc.getElementById('error-banner')!.hidden);
    expect(doc.getElementById('error-banner')!.textContent).toBe('Penjualan online belum tersedia');
  });
});

describe('halaman beli: alur pembelian', () => {
  it('beli -> QR + nominal -> polling -> kode akun; tautan login tanpa kredensial', async () => {
    let polls = 0;
    const { doc, calls, win } = start(c => {
      if (c.path === '/api/shop/packages') return { json: PACKAGES };
      if (c.method === 'POST' && c.path === '/api/shop/orders') return { status: 201, json: { success: true, order: waitingOrder } };
      if (c.path === `/api/shop/orders/${ORDER_ID}`) {
        polls++;
        if (polls < 2) return { json: { success: true, order: waitingOrder } };
        return { json: { success: true, order: { ...waitingOrder, state: 'ready', code: 'K7M2XQ', qrDataUrl: undefined } } };
      }
      return undefined;
    });
    await waitFor(() => doc.querySelectorAll('.pkg').length === 2);
    (doc.querySelector('.pkg') as HTMLButtonElement).click();

    await waitFor(() => visible(doc).includes('pay'));
    expect(doc.getElementById('pay-amount')!.textContent).toBe('Rp 5.000');
    expect(doc.getElementById('pay-package')!.textContent).toBe('Paket 1 Jam');
    expect(doc.getElementById('pay-qr')!.getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(doc.getElementById('pay-ref')!.textContent).toBe(ORDER_ID);
    expect(doc.getElementById('pay-timer')!.textContent).toMatch(/^\d\d:\d\d$/);
    expect(win.location.search).toBe(`?o=${ORDER_ID}`);

    const post = calls.find(c => c.method === 'POST')!;
    expect(post.body).toEqual({ packageId: 'plan-1h' }); // tanpa harga dari browser
    expect(post.headers['Idempotency-Key']).toMatch(/^[0-9a-f]{32}$/);

    await waitFor(() => visible(doc).includes('ready'));
    expect(visible(doc)).toEqual(['ready']);
    expect(doc.getElementById('ready-code')!.textContent).toBe('K7M2XQ');
    const link = doc.getElementById('btn-login') as HTMLAnchorElement;
    expect(link.hidden).toBe(false);
    expect(link.getAttribute('href')).toBe('http://hotspot.tkj/login');
    expect(link.getAttribute('href')).not.toMatch(/username|password|K7M2XQ/);
  });

  it('klik ganda hanya mengirim satu permintaan pembelian', async () => {
    const { doc, calls } = start(c => {
      if (c.path === '/api/shop/packages') return { json: PACKAGES };
      if (c.method === 'POST') return { status: 201, json: { success: true, order: waitingOrder } };
      return { json: { success: true, order: waitingOrder } };
    });
    await waitFor(() => doc.querySelectorAll('.pkg').length === 2);
    const btn = doc.querySelector('.pkg') as HTMLButtonElement;
    btn.click();
    btn.click();
    btn.click();
    await waitFor(() => visible(doc).includes('pay'));
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(1);
  });

  it('pembelian ditolak server: pesan tampil dan tombol paket aktif lagi', async () => {
    const { doc } = start(c => {
      if (c.path === '/api/shop/packages') return { json: PACKAGES };
      if (c.method === 'POST') return { status: 502, json: { success: false, error: 'Gagal membuat pembayaran. Silakan coba lagi.' } };
      return undefined;
    });
    await waitFor(() => doc.querySelectorAll('.pkg').length === 2);
    (doc.querySelector('.pkg') as HTMLButtonElement).click();
    await waitFor(() => !doc.getElementById('error-banner')!.hidden);
    expect(doc.getElementById('error-banner')!.textContent).toBe('Gagal membuat pembayaran. Silakan coba lagi.');
    await waitFor(() => !(doc.querySelector('.pkg') as HTMLButtonElement).disabled);
    expect(visible(doc)).toEqual(['packages']);
  });
});

describe('halaman beli: melanjutkan pesanan', () => {
  it('?o=ID: diproses lalu siap; kode hanya tampil saat siap', async () => {
    let released = false; // tes mengendalikan kapan penerbitan selesai (tanpa bergantung pada waktu)
    const { doc } = start(
      c => {
        if (c.path !== `/api/shop/orders/${ORDER_ID}`) return undefined;
        if (!released) {
          return { json: { success: true, order: { ...waitingOrder, state: 'processing', qrDataUrl: undefined, message: 'Pembayaran sudah diterima. Akun sedang diproses.' } } };
        }
        return { json: { success: true, order: { ...waitingOrder, state: 'ready', code: 'AB3CD4', qrDataUrl: undefined } } };
      },
      `http://localhost/beli?o=${ORDER_ID}`
    );
    await waitFor(() => visible(doc).includes('processing'));
    expect(doc.getElementById('processing-msg')!.textContent).toContain('Pembayaran sudah diterima');
    expect(visible(doc)).toEqual(['processing']);
    expect(doc.getElementById('ready-code')!.textContent).toBe('');

    released = true;
    await waitFor(() => visible(doc).includes('ready'));
    expect(doc.getElementById('ready-code')!.textContent).toBe('AB3CD4');
  });

  it('pesanan tidak ditemukan (404): kembali ke daftar paket dan lupakan ID', async () => {
    const { doc, win } = start(
      c => {
        if (c.path === '/api/shop/packages') return { json: PACKAGES };
        return { status: 404, json: { success: false, error: 'Pesanan tidak ditemukan' } };
      },
      `http://localhost/beli?o=${ORDER_ID}`
    );
    await waitFor(() => visible(doc).includes('packages'));
    expect(win.location.search).toBe('');
  });

  it('kedaluwarsa dan gagal: pesan jelas dengan kode pesanan untuk petugas', async () => {
    const expired = start(
      c => (c.path === `/api/shop/orders/${ORDER_ID}` ? { json: { success: true, order: { ...waitingOrder, state: 'expired', qrDataUrl: undefined } } } : undefined),
      `http://localhost/beli?o=${ORDER_ID}`
    );
    await waitFor(() => visible(expired.doc).includes('failed'));
    expect(expired.doc.getElementById('failed-title')!.textContent).toBe('Waktu pembayaran habis');
    expect(expired.doc.getElementById('failed-msg')!.textContent).toContain(ORDER_ID);

    const failed = start(
      c => (c.path === `/api/shop/orders/${ORDER_ID}` ? { json: { success: true, order: { ...waitingOrder, state: 'failed', qrDataUrl: undefined } } } : undefined),
      `http://localhost/beli?o=${ORDER_ID}`
    );
    await waitFor(() => visible(failed.doc).includes('failed'));
    expect(failed.doc.getElementById('failed-title')!.textContent).toBe('Pembayaran tidak berhasil');
  });

  it('nama paket berisi HTML tidak dieksekusi di halaman pembayaran maupun hasil', async () => {
    const evil = { ...waitingOrder, packageName: '<img src=x onerror=alert(1)>' };
    const { doc } = start(
      c => (c.path === `/api/shop/orders/${ORDER_ID}` ? { json: { success: true, order: evil } } : undefined),
      `http://localhost/beli?o=${ORDER_ID}`
    );
    await waitFor(() => visible(doc).includes('pay'));
    expect(doc.getElementById('pay-package')!.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(doc.querySelectorAll('#view-pay img')).toHaveLength(1); // hanya gambar QR
  });
});

describe('halaman beli: konten', () => {
  it('istilah pelanggan "akun", merek WIFI TKJ, dan peringatan perlu internet lain untuk membayar', () => {
    expect(html).toContain('WIFI TKJ');
    expect(html).toMatch(/Kode akun|kode akun/);
    expect(html).not.toMatch(/voucher/i);
    expect(html).toMatch(/data seluler|perangkat yang punya internet/);
    const code = script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // tanpa komentar
    expect(code).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);
    expect(script).not.toMatch(/server[-_ ]?key|SB-Mid/i);
  });
});
