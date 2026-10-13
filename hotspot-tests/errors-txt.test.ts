// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * hotspot/errors.txt adalah berkas pesan kesalahan bawaan MikroTik yang dibaca router.
 * Pesan diterjemahkan ke bahasa Indonesia dengan istilah "akun", tanpa mengubah daftar kunci
 * maupun variabel $(...) (dibandingkan dengan berkas bawaan lv/errors.txt).
 */
function parse(file: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of readFileSync(resolve(__dirname, '../hotspot', file), 'utf-8').split('\n')) {
    const m = line.match(/^([a-z-]+) = (.*)$/);
    if (m) result[m[1]] = m[2].trim();
  }
  return result;
}

const vars = (text: string) => (text.match(/\$\([^)]+\)/g) ?? []).sort();
const stripVars = (text: string) => text.replace(/\$\([^)]+\)/g, '');

const id = parse('errors.txt');
const stock = parse('lv/errors.txt');

describe('hotspot/errors.txt', () => {
  it('memuat kunci yang sama dengan berkas bawaan (tidak ada yang hilang atau tambahan)', () => {
    expect(Object.keys(id).sort()).toEqual(Object.keys(stock).sort());
    expect(Object.keys(id).length).toBeGreaterThanOrEqual(16);
  });

  it('variabel $(...) tiap pesan sama dengan berkas bawaan, supaya data tetap terisi router', () => {
    for (const key of Object.keys(stock)) {
      expect(vars(id[key]), key).toEqual(vars(stock[key]));
    }
  });

  it('"invalid username or password" menjadi pesan akun, bukan username/password', () => {
    expect(id['invalid-username']).toBe('Akun tidak valid atau sudah kedaluwarsa');
  });

  it('pesan terkait pengguna memakai kata "akun" dan sudah berbahasa Indonesia', () => {
    for (const key of ['user-session-limit', 'wrong-mac-username', 'invalid-mac', 'uptime-limit', 'traffic-limit', 'invalid-username']) {
      expect(id[key].toLowerCase(), key).toContain('akun');
    }
    for (const [key, text] of Object.entries(id)) {
      expect(text.length, key).toBeGreaterThan(0);
      expect(stripVars(text), key).not.toMatch(/\b(invalid|user|username|password|session|logged|limit|reached|allowed)\b/i);
      expect(text, key).not.toMatch(/voucher/i);
      expect(text, key).toMatch(/^[\x20-\x7e]+$/); // ASCII murni
    }
  });

  it('akun yang sedang dipakai di perangkat lain dijelaskan jelas (1 akun 1 perangkat)', () => {
    expect(id['user-session-limit']).toBe('akun $(username) sedang dipakai di perangkat lain');
  });
});
