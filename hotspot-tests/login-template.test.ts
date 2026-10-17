// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

/**
 * Uji hotspot/login.html: template RouterOS dirender sederhana (if/elif/else/endif dan $(var)),
 * lalu dijalankan di jsdom untuk dua mode login: CHAP (login-by=http-chap) dan PAP/non-CHAP.
 */
const dir = resolve(__dirname, '../hotspot');
const loginSrc = readFileSync(resolve(dir, 'login.html'), 'utf-8');
const md5Src = readFileSync(resolve(dir, 'md5.js'), 'utf-8');

type Vars = Record<string, string>;

function truthy(cond: string, vars: Vars): boolean {
  const eq = cond.match(/^\s*([\w-]+)\s*==\s*'([^']*)'\s*$/);
  if (eq) return (vars[eq[1]] ?? '') === eq[2];
  const name = cond.trim();
  return (vars[name] ?? '') !== '';
}

/** Render template MikroTik: $(if x) / $(elif x) / $(else) / $(endif) + $(var) */
function render(src: string, vars: Vars): string {
  const tokenRe = /\$\((if|elif|else|endif)\b([^)]*)\)/g;
  let out = '';
  let last = 0;
  // stack: [parentActive, branchTaken, currentActive]
  const stack: Array<{ parent: boolean; taken: boolean; active: boolean }> = [];
  let active = true;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(src))) {
    if (active) out += src.slice(last, m.index);
    last = m.index + m[0].length;
    const [, kind, arg] = m;
    if (kind === 'if') {
      const cond = active && truthy(arg, vars);
      stack.push({ parent: active, taken: cond, active: cond });
      active = cond;
    } else if (kind === 'elif') {
      const top = stack[stack.length - 1];
      const cond = top.parent && !top.taken && truthy(arg, vars);
      top.taken = top.taken || cond;
      top.active = cond;
      active = cond;
    } else if (kind === 'else') {
      const top = stack[stack.length - 1];
      const cond = top.parent && !top.taken;
      top.taken = true;
      top.active = cond;
      active = cond;
    } else {
      const top = stack.pop()!;
      active = top.parent;
    }
  }
  if (active) out += src.slice(last);
  return out.replace(/\$\(([\w-]+)\)/g, (_, name: string) => vars[name] ?? '');
}

function load(vars: Vars, src: string = loginSrc) {
  const html = render(src, vars);
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://hotspot.tkj/login' });
  const win = dom.window as unknown as Window & Record<string, unknown> & { eval: (s: string) => unknown };
  const doc = win.document;
  // Akses lama ala browser (document.login.username) tidak ada di jsdom; template bawaan MikroTik
  // memakainya, jadi disediakan di sini agar kode halaman diuji apa adanya.
  doc.querySelectorAll('form[name]').forEach(form => {
    // document.<form> sudah didukung jsdom; yang belum: form.<field> (mis. document.login.username)
    (form as HTMLFormElement).querySelectorAll('[name]').forEach(el => {
      const n = el.getAttribute('name')!;
      if (!(n in form)) {
        Object.defineProperty(form, n, { get: () => (form as HTMLFormElement).elements.namedItem(n), configurable: true });
      }
    });
  });
  // md5.js dimuat dari /md5.js di router; di uji ini disuntik langsung
  if (doc.querySelector('script[src="/md5.js"]')) win.eval(md5Src);
  doc.querySelectorAll('script:not([src])').forEach(s => win.eval(s.textContent ?? ''));
  return { dom, win, doc, html };
}

const CHAP = { 'chap-id': '\\123\\045', 'chap-challenge': '\\311\\200', 'link-login-only': 'http://hotspot.tkj/login', 'link-orig': 'http://example.com/' };
const PAP = { 'link-login-only': 'http://hotspot.tkj/login', 'link-orig': 'http://example.com/' };

describe('hotspot/login.html: satu kode voucher', () => {
  it('hanya ada satu kolom yang terlihat; password disembunyikan', () => {
    const { doc } = load(CHAP);
    const form = doc.forms.namedItem('login')!;
    const visible = Array.from(form.querySelectorAll('input')).filter(i => i.type !== 'hidden' && i.type !== 'submit');
    expect(visible).toHaveLength(1);
    expect(visible[0].name).toBe('username');
    expect(form.querySelector('input[type="password"]')).toBeNull();
    expect((form.querySelector('input[name="password"]') as HTMLInputElement).type).toBe('hidden');
    expect(doc.body.textContent).toContain('Kode Akun');
  });

  it('mode CHAP: username = kode, password = MD5(chap-id + kode + challenge)', () => {
    const { win, doc } = load(CHAP);
    const form = doc.forms.namedItem('login')!;
    const sendin = doc.forms.namedItem('sendin')!;
    let submitted = false;
    (sendin as unknown as { submit: () => void }).submit = () => {
      submitted = true;
    };
    (form.elements.namedItem('username') as HTMLInputElement).value = 'K7M2XQ';

    const result = (win as unknown as { doLogin: () => boolean }).doLogin();

    // chap-id/challenge dari router berupa escape oktal di dalam literal JS ('\\123'), jadi diurai oleh JS
    const w = win as unknown as { hexMD5: (s: string) => string; eval: (s: string) => string };
    const expected = w.hexMD5(w.eval("'" + CHAP['chap-id'] + "K7M2XQ" + CHAP['chap-challenge'] + "'"));
    expect(result).toBe(false); // form biasa dibatalkan, form sendin yang dikirim
    expect(submitted).toBe(true);
    expect((sendin.elements.namedItem('username') as HTMLInputElement).value).toBe('K7M2XQ');
    expect((sendin.elements.namedItem('password') as HTMLInputElement).value).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{32}$/);
    // password polos tidak pernah dikirim pada mode CHAP
    expect((sendin.elements.namedItem('password') as HTMLInputElement).value).not.toBe('K7M2XQ');
  });

  it('mode CHAP: hasil MD5 sama dengan perhitungan RouterOS (md5 byte-per-byte)', async () => {
    const { createHash } = await import('node:crypto');
    const { win, doc } = load(CHAP);
    const sendin = doc.forms.namedItem('sendin')!;
    (sendin as unknown as { submit: () => void }).submit = () => undefined;
    (doc.forms.namedItem('login')!.elements.namedItem('username') as HTMLInputElement).value = 'AB3CD4';
    (win as unknown as { doLogin: () => boolean }).doLogin();
    // chap-id/challenge pada router adalah escape oktal \123 → byte 0x53; template menuliskannya apa adanya ke JS
    const js = (win as unknown as { eval: (s: string) => string }).eval("'" + CHAP['chap-id'] + "AB3CD4" + CHAP['chap-challenge'] + "'");
    const expected = createHash('md5').update(Buffer.from(js, 'latin1')).digest('hex');
    expect((sendin.elements.namedItem('password') as HTMLInputElement).value).toBe(expected);
  });

  it('mode non-CHAP (PAP): password tersembunyi diisi sama dengan kode, form dikirim apa adanya', () => {
    const { win, doc } = load(PAP);
    expect(doc.forms.namedItem('sendin')).toBeNull();
    expect(doc.querySelector('script[src="/md5.js"]')).toBeNull();
    const form = doc.forms.namedItem('login')!;
    (form.elements.namedItem('username') as HTMLInputElement).value = 'K7M2XQ';
    const result = (win as unknown as { doLogin: () => boolean }).doLogin();
    expect(result).toBe(true);
    expect((form.elements.namedItem('password') as HTMLInputElement).value).toBe('K7M2XQ');
  });

  it('form login selalu memakai doLogin dan tetap mengirim ke link-login-only', () => {
    for (const vars of [CHAP, PAP]) {
      const { doc } = load(vars);
      const form = doc.forms.namedItem('login')!;
      expect(form.getAttribute('onsubmit')).toBe('return doLogin()');
      expect(form.getAttribute('action')).toBe('http://hotspot.tkj/login');
      expect((form.elements.namedItem('dst') as HTMLInputElement).value).toBe('http://example.com/');
    }
  });

  it('input kode: keyboard huruf besar di ponsel, tanpa autokoreksi, nilai tidak diubah otomatis', () => {
    const { doc } = load(CHAP);
    const input = doc.getElementById('username')!;
    expect(input.getAttribute('autocapitalize')).toBe('characters');
    expect(input.getAttribute('autocorrect')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
  });

  it('pesan error dan link uji coba tetap berfungsi', () => {
    const withError = load({ ...CHAP, error: 'invalid username or password' });
    expect(withError.doc.querySelector('.alert-danger')?.textContent).toContain('invalid username or password');
    const withTrial = load({ ...CHAP, trial: 'yes', 'link-orig-esc': 'x', 'mac-esc': 'AA' });
    expect(withTrial.html).toContain('username=T-AA');
    const plain = load(CHAP);
    expect(plain.doc.querySelector('.alert-danger')).toBeNull();
  });

  it('tidak ada variabel template RouterOS yang tertinggal di hasil render', () => {
    const { html } = load({ ...CHAP, ip: '192.168.100.5', mac: 'AA:BB' });
    expect(html).not.toMatch(/\$\((if|elif|else|endif)/);
  });

  it('teks halaman menyebut "kode akun", bukan "voucher"', () => {
    const { doc, html } = load(CHAP);
    expect(doc.querySelector('label[for="username"]')?.textContent).toBe('Kode Akun');
    expect(doc.getElementById('username')?.getAttribute('placeholder')).toBe('Masukkan kode akun');
    expect(html).not.toMatch(/voucher/i);
  });
});

describe('halaman hotspot: merek WIFI TKJ', () => {
  const pages = ['login', 'alogin', 'error', 'status', 'logout', 'radvert'];

  it.each(pages)('%s.html memakai merek WIFI TKJ dan tanpa kata "voucher"/"Sekolah"', page => {
    const src = readFileSync(resolve(dir, `${page}.html`), 'utf-8');
    // radvert.html punya judul sendiri ("Pengumuman / Informasi Hotspot"); footer-nya tetap WIFI TKJ
    if (page !== 'radvert') expect(src).toMatch(/<title>WIFI TKJ<\/title>/);
    expect(src).toContain('<div>WIFI TKJ</div>');
    expect(src).not.toMatch(/voucher/i);
    expect(src).not.toMatch(/sekolah/i);
  });

  it('judul kartu login adalah WIFI TKJ', () => {
    const { doc } = load(CHAP);
    expect(doc.querySelector('h1.school-name')?.textContent).toBe('WIFI TKJ');
  });

  it('style.css tidak lagi menyebut nama lama', () => {
    expect(readFileSync(resolve(dir, 'style.css'), 'utf-8')).not.toMatch(/sekolah/i);
  });
});

describe('hotspot/login.html: tombol Beli Akun', () => {
  it('bawaan: tombol tampil dan menaut ke beli.html (halaman beli yang disajikan router)', () => {
    const { doc } = load(CHAP);
    expect((doc.getElementById('beli-wrap') as HTMLElement).style.display).toBe('block');
    expect(doc.getElementById('beli-link')?.getAttribute('href')).toBe('beli.html');
    expect(doc.getElementById('beli-link')?.textContent).toBe('Beli Akun');
  });

  it('tersembunyi jika SHOP_URL dikosongkan', () => {
    const src = loginSrc.replace("var SHOP_URL = 'beli.html';", "var SHOP_URL = '';");
    const { doc } = load(CHAP, src);
    expect(doc.getElementById('beli-wrap')?.getAttribute('style')).toContain('display: none');
    expect(doc.getElementById('beli-link')?.getAttribute('href')).toBe('#');
  });

  it('SHOP_URL bisa diganti ke alamat lain', () => {
    const src = loginSrc.replace("var SHOP_URL = 'beli.html';", "var SHOP_URL = 'http://192.168.20.1:4173/beli';");
    const { doc } = load(CHAP, src);
    expect(doc.getElementById('beli-link')?.getAttribute('href')).toBe('http://192.168.20.1:4173/beli');
  });

  it('menyebut "akun" dan tidak memuat rahasia pembayaran apa pun', () => {
    expect(loginSrc).not.toMatch(/server[-_ ]?key|midtrans|SB-Mid/i);
    expect(loginSrc).not.toMatch(/voucher/i);
  });

  it('pesan error dari router (sudah diterjemahkan errors.txt) tampil apa adanya', () => {
    const { doc } = load({ ...CHAP, error: 'Akun tidak valid atau sudah kedaluwarsa' });
    expect(doc.querySelector('.alert-danger')?.textContent?.trim()).toBe('Akun tidak valid atau sudah kedaluwarsa');
  });
});
