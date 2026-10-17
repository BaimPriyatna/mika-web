#!/usr/bin/env node
/**
 * Menghasilkan halaman beli untuk folder hotspot (disajikan langsung oleh router) dari sumber tunggal di shop/.
 *
 *   node scripts/hotspot-shop.mjs           tulis hotspot/beli.html, beli.css, beli.js
 *   node scripts/hotspot-shop.mjs --check   gagal (exit 1) jika berkas di hotspot/ tidak sama dengan hasil generate
 *
 * Satu sumber (shop/) mencegah dua salinan kode pembayaran yang menyimpang. Konfigurasi alamat backend
 * ada di hotspot/beli-config.js (diedit manual, tidak dihasilkan).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const HEADER =
  '<!-- DIHASILKAN dari shop/index.html oleh scripts/hotspot-shop.mjs. Jangan diedit di sini: ubah sumbernya lalu jalankan\n' +
  '     npm run sync:hotspot. Alamat backend diatur di beli-config.js. -->\n';

function replaceOnce(text, from, to) {
  if (!text.includes(from)) throw new Error(`Bagian yang diharapkan tidak ditemukan di shop/index.html: ${from}`);
  return text.replace(from, to);
}

/** Fungsi murni: dipakai skrip dan tes. */
export function buildHotspotShop({ html, css, js }) {
  let out = html;
  out = replaceOnce(out, '<link rel="stylesheet" href="/beli/shop.css" />', '<link rel="stylesheet" href="/beli.css" />');
  out = replaceOnce(
    out,
    '<script src="/beli/shop.js"></script>',
    '<script src="/beli-config.js"></script>\n  <script src="/beli.js"></script>'
  );
  const marker = '<!DOCTYPE html>\n';
  out = replaceOnce(out, marker, marker + HEADER);
  return { 'beli.html': out, 'beli.css': css, 'beli.js': js };
}

export function readSources() {
  return {
    html: readFileSync(resolve(root, 'shop/index.html'), 'utf-8'),
    css: readFileSync(resolve(root, 'shop/shop.css'), 'utf-8'),
    js: readFileSync(resolve(root, 'shop/shop.js'), 'utf-8'),
  };
}

function main() {
  const built = buildHotspotShop(readSources());
  const check = process.argv.includes('--check');
  let stale = false;
  for (const [name, content] of Object.entries(built)) {
    const target = resolve(root, 'hotspot', name);
    const current = existsSync(target) ? readFileSync(target, 'utf-8') : null;
    if (check) {
      if (current !== content) {
        console.error(`hotspot/${name} tidak sama dengan hasil generate. Jalankan: npm run sync:hotspot`);
        stale = true;
      }
    } else {
      writeFileSync(target, content);
      console.log(`ditulis: hotspot/${name}`);
    }
  }
  if (check) {
    if (stale) process.exit(1);
    console.log('hotspot/beli.* sinkron dengan shop/');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
