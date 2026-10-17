// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
// @ts-expect-error skrip .mjs tanpa tipe
import { buildHotspotShop } from '../scripts/hotspot-shop.mjs';

const root = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const sources = { html: read('shop/index.html'), css: read('shop/shop.css'), js: read('shop/shop.js') };
const built = buildHotspotShop(sources) as Record<string, string>;
const beliHtml = read('hotspot/beli.html');
const beliJs = read('hotspot/beli.js');
const beliConfig = read('hotspot/beli-config.js');

describe('hotspot/beli.* sinkron dengan sumber di shop/', () => {
  it('berkas di hotspot/ sama persis dengan hasil generate (jalankan: npm run sync:hotspot)', () => {
    expect(beliHtml).toBe(built['beli.html']);
    expect(read('hotspot/beli.css')).toBe(built['beli.css']);
    expect(beliJs).toBe(built['beli.js']);
  });

  it('html memuat css, konfigurasi, lalu skrip, dengan path absolut yang dilayani router', () => {
    expect(beliHtml).toContain('href="/beli.css"');
    const config = beliHtml.indexOf('src="/beli-config.js"');
    const script = beliHtml.indexOf('src="/beli.js"');
    expect(config).toBeGreaterThan(0);
    expect(script).toBeGreaterThan(config); // konfigurasi harus dimuat sebelum skrip
    expect(beliHtml).not.toContain('/beli/shop');
    expect(beliHtml).toContain('WIFI TKJ');
    expect(beliHtml).not.toMatch(/voucher/i);
  });

  it('generator menolak sumber yang bentuknya berubah (tidak diam-diam menghasilkan halaman rusak)', () => {
    expect(() => buildHotspotShop({ ...sources, html: sources.html.replace('/beli/shop.css', '/x.css') })).toThrow(/tidak ditemukan/);
    expect(() => buildHotspotShop({ ...sources, html: sources.html.replace('/beli/shop.js', '/x.js') })).toThrow(/tidak ditemukan/);
  });
});

describe('aman disajikan router MikroTik', () => {
  it('tidak ada urutan "$(" di berkas halaman beli: router mengganti $(variabel) pada berkas halaman', () => {
    for (const [name, text] of Object.entries({
      'beli.html': beliHtml,
      'beli.js': beliJs,
      'beli.css': read('hotspot/beli.css'),
      'beli-config.js': beliConfig,
      'shop.js': sources.js,
      'index.html': sources.html,
    })) {
      expect(text, name).not.toContain('$(');
    }
  });

  it('konfigurasi bawaan: alamat backend kosong, login ke /login', () => {
    const dom = new JSDOM('<!DOCTYPE html><html></html>', { runScripts: 'outside-only' });
    (dom.window as unknown as { eval: (s: string) => void }).eval(beliConfig);
    const w = dom.window as unknown as Record<string, unknown>;
    expect(w.SHOP_API_BASE).toBe('');
    expect(w.SHOP_LOGIN_URL).toBe('/login');
    dom.window.close();
  });

  it('tidak memuat rahasia pembayaran atau kredensial router', () => {
    for (const text of [beliHtml, beliJs, beliConfig]) {
      expect(text).not.toMatch(/server[-_ ]?key|SB-Mid|ROUTER_PASSWORD|midtrans\.com/i);
    }
  });
});

// ---- perilaku halaman hotspot (config + skrip) di jsdom

type Json = Record<string, unknown>;
interface Call {
  method: string;
  url: string;
}

let open: JSDOM[] = [];
afterEach(() => {
  open.forEach(d => d.window.close());
  open = [];
});

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

function startHotspotPage(config: string, handler: (c: Call) => { status?: number; json: Json } | undefined, url = 'http://hotspot.tkj/beli.html') {
  const dom = new JSDOM(beliHtml, { url, runScripts: 'outside-only' });
  open.push(dom);
  const win = dom.window as unknown as Window & { eval: (s: string) => unknown; fetch: unknown; setTimeout: unknown };
  const calls: Call[] = [];
  win.fetch = async (input: string, init?: RequestInit) => {
    const call = { method: init?.method ?? 'GET', url: String(input) };
    calls.push(call);
    const r = handler(call) ?? { status: 404, json: { success: false, error: 'tidak ada' } };
    const status = r.status ?? 200;
    return { ok: status < 400, status, json: async () => r.json };
  };
  const real = setTimeout;
  win.setTimeout = (fn: () => void, ms?: number) => real(fn, ms && ms >= 1000 ? 5 : ms);
  win.eval(config); // beli-config.js
  win.eval(beliJs); // beli.js
  return { doc: win.document, calls };
}

const visible = (doc: Document) => ['packages', 'pay', 'processing', 'ready', 'failed'].filter(v => !doc.getElementById('view-' + v)!.hidden);
const BASE = 'http://192.168.20.1:4173';
const ORDER = 'WT-' + 'b'.repeat(22);

describe('halaman beli di folder hotspot', () => {
  it('alamat backend kosong: tidak memanggil jaringan, menampilkan pesan belum dikonfigurasi', () => {
    const { doc, calls } = startHotspotPage(beliConfig, () => undefined);
    expect(calls).toHaveLength(0);
    expect(visible(doc)).toEqual(['packages']);
    expect(doc.getElementById('error-banner')!.textContent).toContain('belum dikonfigurasi');
    expect(doc.getElementById('packages-empty')!.hidden).toBe(false);
  });

  it('semua panggilan API menuju alamat backend yang dikonfigurasi (dengan garis miring akhir dibersihkan)', async () => {
    const config = `window.SHOP_API_BASE = '${BASE}/'; window.SHOP_LOGIN_URL = '/login';`;
    const { doc, calls } = startHotspotPage(config, c => {
      if (c.url === `${BASE}/api/shop/packages`) {
        return { json: { success: true, packages: [{ id: 'p1', label: 'Paket 1 Jam', price: 5000, durationLabel: '1 jam' }] } };
      }
      if (c.method === 'POST' && c.url === `${BASE}/api/shop/orders`) {
        return { status: 201, json: { success: true, order: { id: ORDER, state: 'waiting_payment', packageName: 'Paket 1 Jam', durationLabel: '1 jam', amount: 5000, expiresAt: Date.now() + 600000, qrDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' } } };
      }
      if (c.url === `${BASE}/api/shop/orders/${ORDER}`) {
        return { json: { success: true, order: { id: ORDER, state: 'ready', packageName: 'Paket 1 Jam', durationLabel: '1 jam', amount: 5000, expiresAt: 1, code: 'K7M2XQ' } } };
      }
      return undefined;
    });

    await waitFor(() => doc.querySelectorAll('.pkg').length === 1);
    (doc.querySelector('.pkg') as HTMLButtonElement).click();
    await waitFor(() => visible(doc).includes('ready'));

    expect(doc.getElementById('ready-code')!.textContent).toBe('K7M2XQ');
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const c of calls) {
      expect(c.url.startsWith(BASE + '/api/shop/'), c.url).toBe(true);
      expect(c.url).not.toContain('//api'); // garis miring ganda dibersihkan
    }
  });

  it('tombol login memakai /login (bawaan konfigurasi) bila server tidak mengirim alamat login; tanpa kredensial di URL', async () => {
    const config = `window.SHOP_API_BASE = '${BASE}'; window.SHOP_LOGIN_URL = '/login';`;
    const { doc } = startHotspotPage(
      config,
      c => (c.url === `${BASE}/api/shop/orders/${ORDER}` ? { json: { success: true, order: { id: ORDER, state: 'ready', packageName: 'P', durationLabel: '', amount: 5000, expiresAt: 1, code: 'AB3CD4', loginUrl: null } } } : undefined),
      `http://hotspot.tkj/beli.html?o=${ORDER}`
    );
    await waitFor(() => visible(doc).includes('ready'));
    const link = doc.getElementById('btn-login') as HTMLAnchorElement;
    expect(link.hidden).toBe(false);
    expect(link.getAttribute('href')).toBe('/login');
    expect(link.getAttribute('href')).not.toMatch(/username|password|AB3CD4/);
  });

  it('alamat login dari server menggantikan bawaan konfigurasi', async () => {
    const config = `window.SHOP_API_BASE = '${BASE}'; window.SHOP_LOGIN_URL = '/login';`;
    const { doc } = startHotspotPage(
      config,
      c => (c.url === `${BASE}/api/shop/orders/${ORDER}` ? { json: { success: true, order: { id: ORDER, state: 'ready', packageName: 'P', durationLabel: '', amount: 5000, expiresAt: 1, code: 'AB3CD4', loginUrl: 'http://hotspot.tkj/login' } } } : undefined),
      `http://hotspot.tkj/beli.html?o=${ORDER}`
    );
    await waitFor(() => visible(doc).includes('ready'));
    expect((doc.getElementById('btn-login') as HTMLAnchorElement).getAttribute('href')).toBe('http://hotspot.tkj/login');
  });

  it('backend tidak terjangkau: pesan kesalahan tampil, bukan halaman kosong', async () => {
    const config = `window.SHOP_API_BASE = '${BASE}';`;
    const { doc } = startHotspotPage(config, c => (c.url === `${BASE}/api/shop/packages` ? { status: 503, json: { success: false, error: 'Penjualan online belum tersedia' } } : undefined));
    await waitFor(() => !doc.getElementById('error-banner')!.hidden);
    expect(doc.getElementById('error-banner')!.textContent).toBe('Penjualan online belum tersedia');
  });
});
