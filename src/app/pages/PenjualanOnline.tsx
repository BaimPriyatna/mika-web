/**
 * Halaman admin Penjualan Online: pengaturan paket yang dijual, status penyedia pembayaran,
 * dan daftar transaksi (pembayaran + penerbitan akun). Hanya bisa diakses dari perangkat server.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Save } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { getAllPlans } from '../../features/plans/plan-service';
import { getProfiles } from '../../features/profiles/profile-service';
import { parseRouterDurationToMinutes } from '../../core/utils/validation';
import { useRouterStore } from '../../stores/router-store';
import {
  ISSUANCE_LABEL,
  PAYMENT_LABEL,
  buildPackageRows,
  formatRupiah,
  needsAttention,
  rowsToPackages,
  shopAdminApi,
  type AdminOrder,
  type PackageRow,
  type ShopStatus,
} from '../../features/shop/shop-admin-api';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
}

function StatusLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600 shrink-0" aria-label="OK" />
      ) : (
        <AlertCircle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" aria-label="Perlu tindakan" />
      )}
      <span>{children}</span>
    </li>
  );
}

export function PenjualanOnline() {
  const { client } = useRouterStore();
  const [status, setStatus] = useState<ShopStatus | null>(null);
  const [rows, setRows] = useState<PackageRow[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [expiry, setExpiry] = useState(15);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const st = await shopAdminApi.getStatus();
      setStatus(st);
      setEnabled(st.settings.enabled);
      setExpiry(st.settings.paymentExpiryMinutes);

      const plans = await getAllPlans();
      const validity: Record<string, number | null> = {};
      if (client) {
        try {
          for (const p of await getProfiles(client)) {
            validity[p.name] = parseRouterDurationToMinutes(p['session-timeout']);
          }
        } catch {
          // router tidak terbaca: pakai masa berlaku yang sudah tersimpan di server
        }
      }
      setRows(buildPackageRows(plans, st.settings.packages, validity));
      setOrders((await shopAdminApi.listOrders(100)).orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  // Daftar transaksi diperbarui berkala (berhenti saat tab tidak aktif)
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        setOrders((await shopAdminApi.listOrders(100)).orders);
      } catch {
        // abaikan; pesan error muncul saat muat ulang manual
      }
    }, 10_000);
    return () => clearInterval(timer);
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await shopAdminApi.saveSettings({
        enabled,
        paymentExpiryMinutes: expiry,
        packages: rowsToPackages(rows),
      });
      setNotice('Pengaturan tersimpan.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const act = async (id: string, kind: 'retry' | 'refresh') => {
    setBusyOrder(id);
    setError(null);
    try {
      if (kind === 'retry') await shopAdminApi.retryIssuance(id);
      else await shopAdminApi.refreshOrder(id);
      setOrders((await shopAdminApi.listOrders(100)).orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aksi gagal');
    } finally {
      setBusyOrder(null);
    }
  };

  const updateRow = (id: string, patch: Partial<PackageRow>) =>
    setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)));

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Memuat…
      </div>
    );
  }

  const attention = orders.filter(needsAttention);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Penjualan Online</h1>
        <p className="text-sm text-gray-500">Pelanggan membeli akun lewat QRIS di halaman /beli. Akun dibuat otomatis setelah pembayaran terverifikasi.</p>
      </div>

      {error && (
        <p role="alert" className="text-sm rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-green-700 dark:text-green-400">{notice}</p>}

      {attention.length > 0 && (
        <p role="alert" className="text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-800 px-3 py-2 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200">
          {attention.length} pesanan sudah dibayar tetapi akunnya belum terbit. Periksa koneksi router lalu klik “Coba terbitkan lagi”.
        </p>
      )}

      {/* Status konfigurasi */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
        <h2 className="font-semibold">Status konfigurasi</h2>
        <ul className="space-y-2">
          <StatusLine ok={!!status?.providerConfigured}>
            Midtrans ({status?.environment ?? 'sandbox'}):{' '}
            {status?.providerConfigured ? 'server key terpasang di server' : <>belum diatur. Isi <code>MIDTRANS_SERVER_KEY</code> di berkas <code>.env</code> lalu jalankan ulang server.</>}
          </StatusLine>
          <StatusLine ok={!!status?.routerConfigured}>
            Router untuk penerbitan otomatis:{' '}
            {status?.routerConfigured ? `kredensial server terpasang (${status.routerHost})` : <>belum diatur. Isi <code>ROUTER_HOST</code>, <code>ROUTER_USER</code>, <code>ROUTER_PASSWORD</code> di <code>.env</code>; tanpa ini penerbitan hanya berjalan jika router sedang terhubung dari halaman admin.</>}
          </StatusLine>
          <StatusLine ok={!!status?.hotspotLoginUrlConfigured}>
            Alamat halaman login hotspot (tombol “Buka halaman login”):{' '}
            {status?.hotspotLoginUrlConfigured ? 'terpasang' : <>belum diatur (<code>HOTSPOT_LOGIN_URL</code>).</>}
          </StatusLine>
        </ul>
        <p className="text-xs text-gray-500">
          URL notifikasi untuk dashboard Midtrans: <code>https://&lt;alamat-publik-server&gt;/api/shop/webhook/midtrans</code>. Alamat ini harus bisa dijangkau dari internet. Tanpa itu, status pembayaran tetap diperiksa lewat polling, tetapi bisa tertunda beberapa detik.
        </p>
      </section>

      {/* Pengaturan */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-4">
        <h2 className="font-semibold">Pengaturan penjualan</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          Aktifkan penjualan online
        </label>
        <label className="flex items-center gap-2 text-sm">
          Batas waktu pembayaran
          <input
            type="number"
            min={5}
            max={60}
            value={expiry}
            onChange={e => setExpiry(Number(e.target.value))}
            className="w-20 rounded border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1"
          />
          menit
        </label>

        <div>
          <h3 className="text-sm font-medium mb-2">Paket yang dijual online</h3>
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500">Belum ada paket. Buat dulu di halaman Paket.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500">
                  <tr>
                    <th className="py-1 pr-3">Jual</th>
                    <th className="py-1 pr-3">Paket</th>
                    <th className="py-1 pr-3">Profil</th>
                    <th className="py-1 pr-3">Masa berlaku</th>
                    <th className="py-1">Harga (Rp)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-t border-gray-100 dark:border-gray-900">
                      <td className="py-2 pr-3">
                        <input
                          type="checkbox"
                          aria-label={`Jual ${r.label}`}
                          checked={r.selected}
                          onChange={e => updateRow(r.id, { selected: e.target.checked })}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        {r.label}
                        {r.orphan && <span className="ml-2 text-xs text-amber-600">paket lokal sudah dihapus</span>}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.profileName}</td>
                      <td className="py-2 pr-3">{r.validityMinutes ? `${r.validityMinutes} menit` : '-'}</td>
                      <td className="py-2">
                        <input
                          type="number"
                          min={1000}
                          step={500}
                          value={r.price}
                          onChange={e => updateRow(r.id, { price: Number(e.target.value) })}
                          className="w-28 rounded border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-gray-500 mt-2">Harga yang berlaku adalah harga yang disimpan di server ini, bukan yang dikirim browser pelanggan.</p>
        </div>

        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Simpan pengaturan
        </Button>
      </section>

      {/* Transaksi */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Transaksi</h2>
          <Button variant="outline" size="sm" onClick={() => void load()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Muat ulang
          </Button>
        </div>
        {orders.length === 0 ? (
          <p className="text-sm text-gray-500">Belum ada transaksi.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="py-1 pr-3">Waktu</th>
                  <th className="py-1 pr-3">Paket</th>
                  <th className="py-1 pr-3">Nominal</th>
                  <th className="py-1 pr-3">Pembayaran</th>
                  <th className="py-1 pr-3">Akun</th>
                  <th className="py-1 pr-3">Catatan</th>
                  <th className="py-1 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} className="border-t border-gray-100 dark:border-gray-900 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatTime(o.createdAt)}</td>
                    <td className="py-2 pr-3">
                      {o.packageName}
                      <div className="text-xs text-gray-400 font-mono">{o.id}</div>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatRupiah(o.amount)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {PAYMENT_LABEL[o.paymentStatus]}
                      {o.refunded && <div className="text-xs text-amber-600">dana dikembalikan</div>}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <div>{ISSUANCE_LABEL[o.issuanceStatus]}</div>
                      {o.voucherCode && o.issuanceStatus === 'issued' && (
                        <div className="font-mono font-semibold">{o.voucherCode}</div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-gray-600 dark:text-gray-400 max-w-xs">
                      {o.lastError && <div className="text-red-600 dark:text-red-400">{o.lastError}</div>}
                      {o.anomalies.slice(-2).map(a => (
                        <div key={a}>{a}</div>
                      ))}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {needsAttention(o) && (
                        <Button size="sm" variant="outline" disabled={busyOrder === o.id} onClick={() => void act(o.id, 'retry')}>
                          Coba terbitkan lagi
                        </Button>
                      )}
                      {o.paymentStatus === 'pending' && (
                        <Button size="sm" variant="outline" disabled={busyOrder === o.id} onClick={() => void act(o.id, 'refresh')}>
                          Cek status
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
