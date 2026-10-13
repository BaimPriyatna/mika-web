# Penjualan Akun Online (Midtrans QRIS)

Pelanggan membeli akun WiFi sendiri lewat halaman `/beli`, membayar dengan QRIS, lalu kode akun muncul otomatis.
Penjualan manual (buat akun, cetak PDF A4) tetap berjalan seperti biasa dan tidak diubah.

> Status: kode dan tes otomatis selesai. **Belum diuji dengan Midtrans sandbox sungguhan dan belum diuji di router sungguhan.**
> Lihat bagian "Yang belum teruji" sebelum membuka penjualan ke pelanggan.

## 1. Alur

```
Pelanggan -> halaman login hotspot -> [Beli Akun] -> /beli (backend) -> pilih paket
backend: buat pesanan (harga dari server) -> Midtrans /v2/charge (QRIS) -> QR ditampilkan
Pelanggan bayar -> Midtrans -> webhook ke backend  (atau backend memeriksa status ke Midtrans)
backend: verifikasi tanda tangan + nominal -> pesanan "dibayar" -> buat akun di router (username = password)
Halaman /beli menampilkan kode -> pelanggan memasukkannya di halaman login hotspot
```

Hal yang dijaga:

- Harga dan paket **selalu dari server**. Browser hanya mengirim ID paket.
- Pesanan berstatus dibayar hanya dari webhook yang tanda tangannya valid (SHA512 dari `order_id + status_code + gross_amount + server key`) atau dari pemeriksaan status langsung ke Midtrans. Nominal dan ID transaksi harus cocok.
- Status pembayaran dan status penerbitan akun **terpisah**. Jika router mati saat pelanggan membayar, pembayaran tetap diakui, akun dicoba lagi otomatis (jeda 30 dtk, berlipat sampai 10 menit, maksimal 30 kali), lalu butuh tindakan admin.
- Kode akun disimpan sebelum akun dibuat di router, dan router diperiksa sebelum membuat akun, sehingga percobaan ulang atau webhook ganda tidak menghasilkan akun ganda.
- Kode **tidak pernah ditampilkan** sebelum akun terbukti ada di router.
- Server key hanya ada di server (`.env`). Tidak dikirim ke browser, tidak ditulis di log, tidak ditaruh di berkas hotspot.

## 2. Keamanan akses (penting)

Halaman beli harus bisa dijangkau pelanggan, sedangkan API kontrol router milik admin berbagi server yang sama.
Karena itu **semua API admin** (`/api/router/*` dan `/api/shop-admin/*`) hanya melayani:

- koneksi dari `localhost` (atau IP yang ditulis di `ADMIN_ALLOWED_IPS`), dan
- yang **tidak** membawa header proxy (`X-Forwarded-For`, `Forwarded`, `X-Real-IP`, `CF-Connecting-IP`, `Via`, dll.), karena tunnel atau reverse proxy meneruskan trafik internet dari localhost, dan
- untuk permintaan yang mengubah data, header `Origin` (jika ada) harus sama dengan `Host` (anti CSRF).

Header CORS terbuka (`Access-Control-Allow-Origin: *`) pada API router sudah dihapus.

Akibatnya aplikasi admin hanya bisa dibuka dari perangkat tempat server berjalan (atau IP yang diizinkan), tidak lewat tunnel.

## 3. Menyiapkan

1. Salin `.env.example` menjadi `.env` dan isi (berkas `.env` sudah ada di `.gitignore`):
   - `MIDTRANS_SERVER_KEY`: server key dari dashboard Midtrans (sandbox dulu).
   - `MIDTRANS_IS_PRODUCTION=false` selama uji coba.
   - `ROUTER_HOST`, `ROUTER_USER`, `ROUTER_PASSWORD`: akun router untuk penerbitan otomatis. Pakai user khusus, bukan `admin`, misalnya:
     ```
     /user group add name=wifitkj-api policy=read,write,api,rest-api
     /user add name=wifitkj-server group=wifitkj-api password=<kuat> address=<IP server>/32
     ```
     Kebutuhan policy ini belum diuji; jika pembuatan akun ditolak, tambahkan policy yang diminta pesan error router.
   - `HOTSPOT_LOGIN_URL`: alamat halaman login hotspot tanpa kredensial, mis. `http://hotspot.tkj/login`.
2. Jalankan server. Agar pelanggan bisa menjangkaunya, server harus mendengarkan di jaringan hotspot:
   ```
   npm run build
   npx vite preview --host 0.0.0.0 --port 4173
   ```
   (`npm run dev` hanya mendengarkan localhost, jadi pelanggan tidak bisa membuka `/beli`.)
3. Buka aplikasi admin dari perangkat server, menu **Penjualan Online**:
   - pilih paket yang dijual dan atur harga (paket dan profil harus sudah dibuat di halaman Paket/Profil),
   - atur batas waktu pembayaran, lalu aktifkan penjualan.
4. Di dashboard Midtrans, isi Notification URL dengan `https://<alamat-publik>/api/shop/webhook/midtrans` (lihat bagian 4).
5. Pasang halaman hotspot yang baru (bagian 5).

## 4. Webhook dan jaringan

Midtrans hanya bisa mengirim notifikasi ke alamat **HTTPS yang bisa dijangkau dari internet**. Jangan membuka API router ke internet demi webhook.

Pilihan jika server ada di jaringan sekolah:

1. **Tunnel** (misalnya Cloudflare Tunnel) ke port server. Hanya `/api/shop/webhook/midtrans` yang perlu publik; API admin tetap menolak trafik tunnel (lihat bagian 2).
2. **Server publik** (VPS) yang tersambung ke router lewat VPN.
3. **Tanpa webhook.** Backend memeriksa status ke Midtrans: setiap 8 detik selama halaman pelanggan terbuka, dan tiap 30 detik di latar belakang untuk pesanan yang masih menunggu bayar (sampai 10 menit setelah batas waktu). Akun tetap terbit otomatis, hanya bisa terlambat beberapa detik. Tombol "Cek status" di halaman admin memaksa pemeriksaan.

## 5. Halaman hotspot dan Walled Garden

File di `hotspot/` dipasang manual ke router (Winbox: Files, folder `hotspot/`). **Simpan salinan file lama dulu.**

- `login.html`: isi `var SHOP_URL = 'http://<alamat-server>:4173/beli';` (di bagian skrip paling bawah). Selama kosong, tombol "Beli Akun" tersembunyi.
- `errors.txt`: pesan kesalahan login berbahasa Indonesia ("Akun tidak valid atau sudah kedaluwarsa", dst.). Router membaca berkas ini dari folder hotspot; jika pesan belum berubah setelah diunggah, nonaktifkan lalu aktifkan lagi server hotspot.
- `error.html`, `alogin.html`, `status.html`, `logout.html`, `radvert.html`, `style.css`: merek WIFI TKJ.

Pelanggan yang belum login hanya bisa membuka alamat yang ada di Walled Garden. Tambahkan alamat server (sesuaikan, lalu uji dari ponsel yang belum login):

```
/ip hotspot walled-garden ip add action=accept dst-address=<IP-server> dst-port=4173 protocol=tcp comment="WIFI TKJ beli akun"
```

Jika server diakses lewat nama domain, gunakan `/ip hotspot walled-garden add dst-host=<domain>`.

**Catatan penting untuk pelanggan:** sebelum akun aktif, WiFi ini belum terhubung ke internet. Aplikasi e-wallet atau mobile banking di ponsel yang sama butuh internet, jadi pelanggan perlu data seluler, atau memindai QR dari perangkat lain. Halaman beli menyebutkan ini. Membuka akses ke domain e-wallet lewat Walled Garden tidak disarankan karena daftar domainnya panjang dan berubah.

Rollback: kembalikan salinan file lama ke folder `hotspot/` router (atau `git checkout <commit-sebelumnya> -- hotspot/`, lalu unggah ulang).

## 6. Data dan pemulihan

- Transaksi disimpan di `data/shop-store.json` (folder bisa diubah dengan `SHOP_DATA_DIR`). Berkas ditulis atomik (berkas sementara + rename). **Cadangkan folder ini secara berkala.** Jika berkas rusak, server menolak start dan tidak menghapus apa pun.
- Penyimpanan berbasis berkas dipilih karena satu proses dan satu router. Antarmukanya (`server/shop/store.ts`) kecil sehingga bisa diganti SQLite nanti. Tidak aman dijalankan dua proses sekaligus.
- Pesanan final yang lebih tua dari `SHOP_RETENTION_DAYS` (90 hari) dihapus otomatis. Pesanan yang masih menunggu bayar, atau sudah dibayar tetapi akunnya belum terbit, tidak pernah dihapus otomatis.
- Kode akun disimpan apa adanya di data transaksi (sama dengan username di router, jadi tidak menambah rahasia baru). Kredensial router **tidak** disimpan di data transaksi.

Status di halaman admin:

| Pembayaran | Arti |
|---|---|
| Menunggu bayar | QR dibuat, belum ada pembayaran |
| Dibayar | Settlement terverifikasi |
| Kedaluwarsa / Gagal / Dibatalkan | Final, tidak ada akun. Settlement yang datang terlambat tetap diakui |

| Akun | Arti |
|---|---|
| Belum diterbitkan / Sedang dibuat | Antrean |
| Menunggu coba ulang | Router tidak terjangkau atau profil bermasalah; dicoba otomatis |
| Gagal, perlu tindakan | Melewati batas percobaan. Perbaiki penyebab (lihat kolom Catatan), lalu klik **Coba terbitkan lagi** |
| Sudah terbit | Akun ada di router |

Pelanggan yang sudah membayar tetapi akunnya belum terbit melihat pesan "Pembayaran sudah diterima" dan kode pesanan, bukan pesan gagal.

Jika dana dikembalikan oleh Midtrans (refund/chargeback), pesanan ditandai "dana dikembalikan". Akun **tidak** dicabut otomatis; hapus manual bila perlu.

## 7. Pengujian sandbox (sebelum produksi)

1. Pakai server key sandbox dan `MIDTRANS_IS_PRODUCTION=false`. Jangan memakai transaksi nyata untuk uji awal.
2. Buat pesanan dari `/beli`, lalu bayar memakai simulator pembayaran Midtrans sandbox (lihat dokumentasi "Testing payment" Midtrans).
3. Periksa: pesanan menjadi Dibayar, akun muncul di router (`/ip hotspot user print where comment~"sale=online"`), kode tampil di halaman beli, login dengan kode itu berhasil.
4. Ulangi dengan: router dimatikan saat pembayaran, pembayaran dua kali, pembayaran kedaluwarsa, backend dimatikan lalu dihidupkan.

Tes otomatis (`npm test`) memakai Midtrans palsu dan router palsu; itu **bukan** pengganti langkah di atas.

## 8. Yang belum teruji

- Respons dan perilaku Midtrans sandbox sungguhan (format charge QRIS, `custom_expiry`, notifikasi, status API) belum dicoba. Format mengikuti dokumentasi resmi Midtrans, tetapi harus diverifikasi.
- Pembuatan akun otomatis di RouterOS v6 dan v7 sungguhan, termasuk kecukupan policy user router khusus.
- Hubungan dengan timer voucher di router (`vm-cleaner`, `vm-close`): akun online memakai comment yang sama dengan voucher manual (ditambah `sale=online`), tetapi belum diuji bahwa timer memprosesnya.
- Walled Garden, tampilan di ponsel Android/iOS, dan jendela captive portal bawaan.
- Perilaku bila pelanggan membayar sebelum jam operasional (07:30) atau setelah tutup (14:30): penjualan online belum mengenal jam operasional. Akun dibuat, tetapi hotspot mungkin sedang nonaktif.
- Beban: belum diuji dengan banyak pesanan bersamaan.
- Pemindaian QR dari layar yang sama dengan halaman login (alur satu perangkat).
