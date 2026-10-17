// Konfigurasi halaman beli akun (hotspot/beli.html). Berkas ini diedit saat pemasangan; tidak dihasilkan otomatis.
//
// 1. Alamat backend WIFI TKJ yang menjalankan penjualan online, tanpa garis miring di akhir.
//    Contoh: 'http://192.168.20.1:4173'
//    - Alamat ini WAJIB ada di Walled Garden router (pelanggan belum login).
//    - Alamat halaman hotspot ini (mis. http://hotspot.tkj) WAJIB ada di SHOP_ALLOWED_ORIGINS pada .env server.
//    Dibiarkan kosong = halaman menampilkan "Penjualan online belum dikonfigurasi".
window.SHOP_API_BASE = '';

// 2. Halaman login hotspot (satu server dengan halaman ini).
window.SHOP_LOGIN_URL = '/login';
