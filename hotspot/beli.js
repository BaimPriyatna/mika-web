/* Halaman beli akun WIFI TKJ.
 * Tanpa pustaka luar. Semua teks dari server dimasukkan lewat textContent (bukan innerHTML).
 * Status di sini hanya untuk tampilan: server (webhook + cek ke penyedia pembayaran) adalah sumber kebenaran. */
(function () {
  'use strict';

  // Konfigurasi opsional (diatur oleh hotspot/beli-config.js saat halaman ini disajikan dari router):
  //  - SHOP_API_BASE: alamat backend (mis. http://192.168.20.1:4173). Tidak diatur = backend yang sama (halaman /beli).
  //  - SHOP_LOGIN_URL: alamat halaman login hotspot jika server tidak mengirimkannya.
  var API_BASE = typeof window.SHOP_API_BASE === 'string' ? window.SHOP_API_BASE.replace(/\/+$/, '') : null;
  var NOT_CONFIGURED = API_BASE === '';
  var STORAGE_KEY = 'wifitkj_order';
  var POLL_MS = 3000;
  var byId = function (id) { return document.getElementById(id); };

  var views = ['packages', 'pay', 'processing', 'ready', 'failed'];
  var pollTimer = null;
  var tickTimer = null;
  var currentOrder = null;
  var loginUrl = window.SHOP_LOGIN_URL || null;
  var busy = false;

  function show(name) {
    views.forEach(function (v) { byId('view-' + v).hidden = v !== name; });
  }

  function setError(text) {
    var el = byId('error-banner');
    el.textContent = text || '';
    el.hidden = !text;
  }

  function rupiah(n) {
    return 'Rp ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function randomKey() {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  function api(method, path, body, headers) {
    var opts = { method: method, headers: Object.assign({ Accept: 'application/json' }, headers || {}) };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch((API_BASE || '') + path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok || json.success === false) {
          var err = new Error(json.error || 'Terjadi kesalahan. Coba lagi.');
          err.status = res.status;
          throw err;
        }
        return json;
      });
    });
  }

  function stopTimers() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  function remember(id) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* penyimpanan bisa diblokir di browser captive portal */ }
    try { history.replaceState(null, '', '?o=' + encodeURIComponent(id)); } catch (e) { /* abaikan */ }
  }

  function forget() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* abaikan */ }
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* abaikan */ }
  }

  function savedOrderId() {
    var q = new URLSearchParams(location.search).get('o');
    if (q) return q;
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  // ---- daftar paket
  function loadPackages() {
    stopTimers();
    currentOrder = null;
    setError('');
    api('GET', '/api/shop/packages').then(function (data) {
      loginUrl = data.loginUrl || loginUrl;
      var list = byId('package-list');
      list.textContent = '';
      var packages = data.packages || [];
      byId('packages-empty').hidden = packages.length > 0;
      packages.forEach(function (p) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pkg';
        var left = document.createElement('span');
        var name = document.createElement('span');
        name.className = 'name';
        name.textContent = p.label;
        left.appendChild(name);
        if (p.durationLabel) {
          var dur = document.createElement('span');
          dur.className = 'dur';
          dur.textContent = ' ' + p.durationLabel;
          left.appendChild(document.createElement('br'));
          left.appendChild(dur);
        }
        var price = document.createElement('span');
        price.className = 'price';
        price.textContent = rupiah(p.price);
        btn.appendChild(left);
        btn.appendChild(price);
        btn.addEventListener('click', function () { buy(p.id, btn); });
        list.appendChild(btn);
      });
      show('packages');
    }).catch(function (err) {
      show('packages');
      byId('packages-empty').hidden = false;
      setError(err.message);
    });
  }

  // ---- beli
  var pendingKey = null;
  var pendingPackage = null;

  function buy(packageId, btn) {
    if (busy) return;
    busy = true;
    setError('');
    // Kunci idempotensi dipertahankan selama paket yang sama dicoba ulang (klik ganda / jaringan lambat)
    if (pendingPackage !== packageId || !pendingKey) {
      pendingKey = randomKey();
      pendingPackage = packageId;
    }
    document.querySelectorAll('.pkg').forEach(function (b) { b.disabled = true; });
    api('POST', '/api/shop/orders', { packageId: packageId }, { 'Idempotency-Key': pendingKey })
      .then(function (data) {
        pendingKey = null;
        pendingPackage = null;
        remember(data.order.id);
        render(data.order);
      })
      .catch(function (err) {
        setError(err.message);
        document.querySelectorAll('.pkg').forEach(function (b) { b.disabled = false; });
      })
      .then(function () { busy = false; });
    void btn;
  }

  // ---- tampilan sesuai status dari server
  function render(order) {
    currentOrder = order;
    if (order.loginUrl) loginUrl = order.loginUrl;
    setError('');

    if (order.state === 'waiting_payment') {
      byId('pay-package').textContent = order.packageName;
      byId('pay-duration').textContent = order.durationLabel ? order.durationLabel : '';
      byId('pay-amount').textContent = rupiah(order.amount);
      byId('pay-ref').textContent = order.id;
      if (order.qrDataUrl) byId('pay-qr').src = order.qrDataUrl;
      show('pay');
      startTick(order.expiresAt);
      schedulePoll(order.id);
    } else if (order.state === 'processing') {
      byId('processing-msg').textContent = order.message || 'Akun sedang diproses...';
      byId('processing-ref').textContent = order.id;
      show('processing');
      schedulePoll(order.id);
    } else if (order.state === 'ready') {
      stopTimers();
      byId('ready-package').textContent = order.packageName;
      byId('ready-duration').textContent = order.durationLabel ? order.durationLabel : '';
      byId('ready-code').textContent = order.code || '';
      var link = byId('btn-login');
      if (loginUrl) {
        link.href = loginUrl; // tanpa kredensial di URL; kode disalin/ditempel manual
        link.hidden = false;
      }
      show('ready');
    } else {
      stopTimers();
      var expired = order.state === 'expired';
      byId('failed-title').textContent = expired ? 'Waktu pembayaran habis' : 'Pembayaran tidak berhasil';
      byId('failed-msg').textContent = expired
        ? 'Kode QRIS sudah kedaluwarsa. Jika Anda sudah membayar, tunggu sebentar atau hubungi petugas dengan kode pesanan ' + order.id + '. Jika belum, pilih paket lagi.'
        : 'Pesanan dibatalkan atau ditolak. Jika saldo Anda terpotong, hubungi petugas dengan kode pesanan ' + order.id + '.';
      show('failed');
    }
  }

  function startTick(expiresAt) {
    if (tickTimer) clearInterval(tickTimer);
    function tick() {
      var left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      var m = Math.floor(left / 60);
      var s = left % 60;
      byId('pay-timer').textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }
    tick();
    tickTimer = setInterval(tick, 1000);
  }

  function schedulePoll(id) {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(function () { poll(id); }, POLL_MS);
  }

  function poll(id) {
    api('GET', '/api/shop/orders/' + encodeURIComponent(id)).then(function (data) {
      render(data.order);
    }).catch(function (err) {
      if (err.status === 404 || err.status === 400) {
        forget();
        loadPackages();
        return;
      }
      setError('Koneksi terganggu, mencoba lagi...');
      schedulePoll(id); // jaringan sementara putus: tetap lanjut
    });
  }

  // ---- tombol
  byId('btn-copy').addEventListener('click', function () {
    var code = byId('ready-code').textContent;
    var done = function () { byId('copy-note').hidden = false; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, function () { selectCode(); });
    } else {
      selectCode();
    }
  });

  function selectCode() {
    var range = document.createRange();
    range.selectNodeContents(byId('ready-code'));
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    byId('copy-note').textContent = 'Tekan dan tahan kode untuk menyalin.';
    byId('copy-note').hidden = false;
  }

  byId('btn-cancel-view').addEventListener('click', function () { forget(); loadPackages(); });
  byId('btn-retry').addEventListener('click', function () { forget(); loadPackages(); });

  // ---- mulai
  var saved = savedOrderId();
  if (NOT_CONFIGURED) {
    // Halaman hotspot dipasang tetapi alamat backend belum diisi di beli-config.js
    show('packages');
    byId('packages-empty').hidden = false;
    setError('Penjualan online belum dikonfigurasi. Silakan beli akun langsung dari petugas.');
  } else if (saved) {
    api('GET', '/api/shop/orders/' + encodeURIComponent(saved)).then(function (data) {
      render(data.order);
    }).catch(function () {
      forget();
      loadPackages();
    });
  } else {
    loadPackages();
  }
})();
