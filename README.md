# WIFI TKJ - Manajemen Hotspot MikroTik

Aplikasi web (React + TypeScript + Vite) untuk mengelola hotspot MikroTik RouterOS v6/v7 satu router:
profil dan paket, pembuatan akun (kode tunggal: username = password), cetak PDF A4 (8 per halaman),
pemantauan perangkat, setup timer di router, dan penjualan akun online lewat Midtrans QRIS.

## Menjalankan

```bash
npm install
npm run dev        # admin di http://localhost:5173 (hanya localhost)
npm test           # semua tes
npm run build && npx vite preview --host 0.0.0.0 --port 4173   # agar halaman /beli bisa dijangkau pelanggan
```

Backend (klien API binary/REST, penjualan online) berjalan sebagai plugin Vite di `server/`, sehingga
`vite build` saja belum cukup untuk produksi; gunakan `vite preview` atau proses Node yang setara.

## Dokumentasi

- `DEV-SPEC.md`, `DESIGN.md`, `tasks.md`: spesifikasi, desain, dan progres.
- `docs/payment-midtrans.md`: penjualan online (setup, keamanan, webhook, Walled Garden, pemulihan, yang belum teruji).
- `docs/spike.md`: hasil uji awal ke router asli.
- `hotspot/`: halaman captive portal (dipasang manual ke router). `shop/`: halaman beli pelanggan.
- `.env.example`: konfigurasi server (Midtrans, kredensial router, dsb.).

## Keamanan singkat

API kontrol router dan API admin penjualan hanya melayani localhost (atau `ADMIN_ALLOWED_IPS`) dan menolak
trafik yang membawa header proxy. Server key Midtrans dan kredensial router hanya ada di `.env` server.
