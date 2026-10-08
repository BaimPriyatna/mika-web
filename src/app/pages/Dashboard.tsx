import { strings } from '../../strings/id';
import {
  Clock,
  Cpu,
  Server,
  Users,
  Wifi,
  Ticket,
  Plus,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  Printer,
  Radio,
} from 'lucide-react';
import { useRouterStore } from '../../stores/router-store';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { db, type VoucherBatch } from '../../core/db/schema';

export function Dashboard() {
  const navigate = useNavigate();
  const {
    connectionStatus,
    systemResource,
    overview,
    setModalOpen,
    fetchOverview,
  } = useRouterStore();

  const isConnected = connectionStatus === 'connected';

  const [latestBatch, setLatestBatch] = useState<VoucherBatch | null>(null);

  useEffect(() => {
    db.batches.orderBy('createdAt').reverse().first().then(b => setLatestBatch(b || null));
  }, []);

  // Auto-refresh overview every 10 seconds when tab is visible
  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchOverview();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isConnected, fetchOverview]);

  // Calculate RAM usage
  let ramUsagePercent = 0;
  if (systemResource && systemResource.totalMemory > 0) {
    const used = systemResource.totalMemory - systemResource.freeMemory;
    ramUsagePercent = Math.min(100, Math.max(0, Math.round((used / systemResource.totalMemory) * 100)));
  }

  const cpuLoad = systemResource?.cpuLoad ?? 0;
  const routerTitle = overview?.resource?.identity || systemResource?.boardName || 'MikroTik Router';
  const routerVersion = systemResource?.version ? `v${systemResource.version}` : '';
  const uptime = systemResource?.uptime || '—';
  const activeUsers = overview?.activeHotspotUsersCount ?? 0;
  const totalUsers = overview?.totalHotspotUsersCount ?? 0;
  const leasesCount = overview?.dhcpLeasesCount ?? 0;

  return (
    <div className="space-y-6">
      {/* Title & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            {strings.nav.dashboard}
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Ringkasan status MikroTik Hotspot Voucher & statistik jaringan
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isConnected && (
            <button
              onClick={() => fetchOverview()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Segarkan
            </button>
          )}

          {latestBatch && latestBatch.id && (
            <button
              onClick={() => navigate(`/voucher/cetak/${latestBatch.id}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/60 hover:bg-green-100 dark:hover:bg-green-900 border border-green-200 dark:border-green-800 rounded-lg transition-colors shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              Cetak Batch Terakhir
            </button>
          )}

          <button
            onClick={() => navigate('/voucher')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            Buat Voucher
          </button>
        </div>
      </div>

      {/* Hero Banner when NOT connected */}
      {!isConnected && (
        <div className="p-6 bg-gradient-to-r from-emerald-900/10 via-green-900/5 to-transparent border border-green-200 dark:border-green-800/60 rounded-xl relative overflow-hidden">
          <div className="max-w-xl space-y-3 relative z-10">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 rounded-full text-xs font-medium">
              <Radio className="w-3.5 h-3.5 animate-pulse text-green-600" />
              Deteksi Otomatis RouterOS v6 & v7
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Router Belum Terhubung
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              Mika memerlukan koneksi ke router MikroTik Anda untuk memuat profil hotspot, memantau pengguna aktif, dan mencetak voucher. Gunakan pemindai MNDP untuk menemukan router secara otomatis di jaringan lokal.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-all"
              >
                <Wifi className="w-4 h-4" />
                Pindai & Hubungkan Router
                <ArrowRight className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-400">
                Mendukung port API 8728, 8729 (SSL), serta REST port 80/443
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Grid 4 kartu status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Router Card */}
        <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-2xs hover:border-gray-300 dark:hover:border-gray-700 transition-all">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-green-600 dark:text-green-400" />
              <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Router</h3>
            </div>
            {isConnected && (
              <span className="w-2 h-2 rounded-full bg-green-500 ring-4 ring-green-100 dark:ring-green-950" />
            )}
          </div>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
            {isConnected ? routerTitle : 'Belum Konek'}
          </p>
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
            <span>{isConnected ? routerVersion : 'Klik Hubungkan'}</span>
            <span>{isConnected ? `Uptime ${uptime}` : ''}</span>
          </div>
        </div>

        {/* Pengguna Aktif */}
        <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-2xs hover:border-gray-300 dark:hover:border-gray-700 transition-all">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Pengguna Aktif</h3>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 font-medium rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
              Hotspot
            </span>
          </div>
          <p className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">
            {activeUsers}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            dari {totalUsers} voucher terdaftar ({leasesCount} DHCP leases)
          </p>
        </div>

        {/* CPU / RAM */}
        <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-2xs hover:border-gray-300 dark:hover:border-gray-700 transition-all">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Beban CPU / RAM</h3>
            </div>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              {cpuLoad}% · {ramUsagePercent}%
            </span>
          </div>
          <div className="space-y-1.5 mt-2">
            <div>
              <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
                <span>CPU</span>
                <span>{cpuLoad}%</span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    cpuLoad > 85 ? 'bg-red-500' : cpuLoad > 60 ? 'bg-amber-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, cpuLoad))}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
                <span>RAM</span>
                <span>{ramUsagePercent}%</span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    ramUsagePercent > 85 ? 'bg-red-500' : ramUsagePercent > 60 ? 'bg-amber-500' : 'bg-purple-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, ramUsagePercent))}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Status Sistem */}
        <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-2xs hover:border-gray-300 dark:hover:border-gray-700 transition-all">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Kesehatan Sistem</h3>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">Optimal</p>
              </>
            ) : (
              <p className="text-lg font-semibold text-gray-400">Offline</p>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {isConnected
              ? `${overview?.interfacesCount || 0} Interface aktif · ${overview?.hotspotServersCount || 1} Server HS`
              : 'Hubungkan router'}
          </p>
        </div>
      </div>

      {/* Main sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Voucher Status Breakdown */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Ticket className="w-5 h-5 text-green-600" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Status Voucher Hotspot
              </h2>
            </div>
            <button
              onClick={() => navigate('/voucher')}
              className="text-xs font-medium text-green-600 dark:text-green-400 hover:underline flex items-center gap-1"
            >
              Lihat Semua Voucher <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-100 dark:border-gray-800/80">
            <div className="text-center sm:text-left">
              <div className="flex items-center gap-2 mb-1 justify-center sm:justify-start">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="text-xs text-gray-500">Tersedia</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {Math.max(0, totalUsers - activeUsers)}
              </p>
            </div>

            <div className="text-center sm:text-left border-x border-gray-200 dark:border-gray-800 px-4">
              <div className="flex items-center gap-2 mb-1 justify-center sm:justify-start">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="text-xs text-gray-500">Aktif</span>
              </div>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {activeUsers}
              </p>
            </div>

            <div className="text-center sm:text-left">
              <div className="flex items-center gap-2 mb-1 justify-center sm:justify-start">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                <span className="text-xs text-gray-500">Total User</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {totalUsers}
              </p>
            </div>
          </div>

          <div className="p-4 border border-dashed border-gray-200 dark:border-gray-800 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Format kode voucher standar Mika: 6 karakter acak kombinasi huruf dan angka (1 batch = 8 voucher / 1 lembar A4).
            </div>
            <button
              onClick={() => navigate('/voucher')}
              className="shrink-0 px-3.5 py-1.5 text-xs font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950 hover:bg-green-100 dark:hover:bg-green-900 rounded-md border border-green-200 dark:border-green-800 transition-colors"
            >
              Generate Batch Baru
            </button>
          </div>
        </div>

        {/* Router Details Card */}
        <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Detail Perangkat
            </h2>
            <button
              onClick={() => setModalOpen(true)}
              className="text-xs text-green-600 dark:text-green-400 hover:underline"
            >
              Konfigurasi
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
              <span className="text-gray-500">Nama Identity</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[150px]">
                {overview?.resource?.identity || 'MikroTik'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
              <span className="text-gray-500">Model Board</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                {systemResource?.boardName || '—'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
              <span className="text-gray-500">Versi RouterOS</span>
              <span className="font-mono text-gray-800 dark:text-gray-200">
                {systemResource?.version || '—'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
              <span className="text-gray-500">Arsitektur</span>
              <span className="font-mono text-gray-800 dark:text-gray-200">
                {systemResource?.architecture || '—'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
              <span className="text-gray-500">Memori Bebas</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                {systemResource?.freeMemory
                  ? `${Math.round(systemResource.freeMemory / (1024 * 1024))} MB`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-gray-500">Storage Bebas</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                {overview?.resource?.freeHddSpace
                  ? `${Math.round(overview.resource.freeHddSpace / (1024 * 1024))} MB`
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
