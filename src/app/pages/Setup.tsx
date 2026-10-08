/**
 * Halaman Setup Router
 * Mengelola instalasi, checklist, verifikasi diff, dan copot script operasional (prefix vm-)
 * Sesuai KEPUTUSAN TERBARU §5, §6 dan DESIGN.md §4.8
 */

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Upload,
  XCircle,
  RefreshCw,
  Copy,
  Check,
  Clock,
  ShieldCheck,
  Server,
  FileCode,
  AlertCircle,
} from 'lucide-react';
import { strings } from '../../strings/id';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '../../components/ui/dialog';
import { useRouterStore } from '../../stores/router-store';
import {
  checkSetupStatus,
  installAllSetup,
  verifySetupDiff,
  uninstallAllSetup,
  type SetupChecklistStatus,
  type SetupDiffItem,
} from '../../features/setup/setup-service';
import {
  buildOnLoginScript,
  buildVmCleanerScript,
  buildVmOpenScript,
  buildVmCloseScript,
  DEFAULT_OPERATIONAL_HOURS,
  type OperationalHours,
} from '../../features/setup/router-scripts';

export function Setup() {
  const { client, connectionStatus, setModalOpen } = useRouterStore();
  const isConnected = connectionStatus === 'connected';
  const [operationalHours] = useState<OperationalHours>(DEFAULT_OPERATIONAL_HOURS);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<SetupChecklistStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Dialogs
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [showUninstallDialog, setShowUninstallDialog] = useState(false);
  const [showNtpGuideDialog, setShowNtpGuideDialog] = useState(false);

  // Sub-states
  const [isInstalling, setIsInstalling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [diffItems, setDiffItems] = useState<SetupDiffItem[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!client || !isConnected) return;
    setLoading(true);
    setActionError(null);
    try {
      const res = await checkSetupStatus(client, operationalHours);
      setStatus(res);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal memeriksa status router');
    } finally {
      setLoading(false);
    }
  }, [client, isConnected, operationalHours]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleInstall = async () => {
    if (!client) return;
    setIsInstalling(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await installAllSetup(client, operationalHours);
      setActionSuccess(`Berhasil memasang ${res.installedCount} komponen ke router.`);
      setShowInstallDialog(false);
      await fetchStatus();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal memasang script ke router');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleVerify = async () => {
    if (!client) return;
    setIsVerifying(true);
    setActionError(null);
    try {
      const diffs = await verifySetupDiff(client, operationalHours);
      setDiffItems(diffs);
      setShowVerifyDialog(true);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal memverifikasi script');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleUninstall = async () => {
    if (!client) return;
    setIsUninstalling(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await uninstallAllSetup(client);
      setActionSuccess(`Berhasil mencopot ${res.removedCount} objek 'vm-' dari router.`);
      setShowUninstallDialog(false);
      await fetchStatus();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal mencopot objek dari router');
    } finally {
      setIsUninstalling(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
          {strings.nav.setupRouter}
        </h1>
        <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-8 text-center space-y-4">
          <Server className="w-12 h-12 text-gray-400 mx-auto" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Router Belum Terhubung
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
            Hubungkan router MikroTik terlebih dahulu untuk memeriksa konfigurasi, memasang script masa berlaku, dan scheduler pembersih voucher.
          </p>
          <Button onClick={() => setModalOpen(true)} className="gap-2">
            <Server className="w-4 h-4" />
            Hubungkan Router Sekarang
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {strings.nav.setupRouter}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Konfigurasi otomasi jam operasional ({operationalHours.openTime} - {operationalHours.closeTime}) dan masa berlaku voucher
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchStatus}
          disabled={loading}
          className="gap-2 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Periksa Ulang
        </Button>
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 flex items-start gap-3 text-green-800 dark:text-green-300 text-sm">
          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          <div>{actionSuccess}</div>
        </div>
      )}

      {actionError && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-start gap-3 text-red-800 dark:text-red-300 text-sm">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div>{actionError}</div>
        </div>
      )}

      {/* Checklist Status Sesuai DESIGN.md §4.8 */}
      <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-900 overflow-hidden shadow-xs">
        {/* Item 1: Koneksi */}
        <div className="p-4.5 flex items-start gap-4">
          <div className="mt-0.5 shrink-0">
            {status?.connection.status === 'ok' ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Koneksi API / REST Router
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300">
                Terhubung
              </span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {status?.connection.details || 'Memeriksa…'}
            </p>
          </div>
        </div>

        {/* Item 2: Hotspot Server */}
        <div className="p-4.5 flex items-start gap-4">
          <div className="mt-0.5 shrink-0">
            {status?.hotspotServer.status === 'ok' ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            ) : status?.hotspotServer.status === 'warning' ? (
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Server Hotspot
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {status?.hotspotServer.details || 'Memeriksa…'}
            </p>
          </div>
        </div>

        {/* Item 3: Jam & NTP (Guard NTP) */}
        <div className="p-4.5 flex items-start gap-4">
          <div className="mt-0.5 shrink-0">
            {status?.clockNtp.synced ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Jam & NTP (Guard NTP)
              </h3>
              <button
                type="button"
                onClick={() => setShowNtpGuideDialog(true)}
                className="text-xs text-green-600 dark:text-green-400 hover:underline font-medium"
              >
                Panduan NTP
              </button>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {status?.clockNtp.details || 'Memeriksa jam router…'}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              ⓘ Guard NTP: Jika jam router belum sinkron, scheduler pembersih otomatis tidak akan menghapus voucher apa pun demi keamanan.
            </p>
          </div>
        </div>

        {/* Item 4: Script On-Login Profil */}
        <div className="p-4.5 flex items-start gap-4">
          <div className="mt-0.5 shrink-0">
            {status?.onLoginScript.status === 'ok' ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            ) : status?.onLoginScript.status === 'diff' ? (
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
            ) : (
              <XCircle className="w-5 h-5 text-gray-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Script Masa Berlaku (on-login)
              </h3>
              {status?.onLoginScript.status !== 'ok' && (
                <button
                  type="button"
                  onClick={() => setShowInstallDialog(true)}
                  className="text-xs text-green-600 dark:text-green-400 font-medium hover:underline"
                >
                  Pasang
                </button>
              )}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {status?.onLoginScript.details || 'Memeriksa profil hotspot…'}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Menandai login pertama pada comment user (vm|...|u=0) tanpa membuat scheduler per-user.
            </p>
          </div>
        </div>

        {/* Item 5: Scheduler Pembersih & Operasional */}
        <div className="p-4.5 flex items-start gap-4">
          <div className="mt-0.5 shrink-0">
            {status?.cleanerScheduler.status === 'ok' ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            ) : status?.cleanerScheduler.status === 'diff' ? (
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
            ) : (
              <XCircle className="w-5 h-5 text-gray-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Scheduler Jam Operasional & Pembersih
              </h3>
              {status?.cleanerScheduler.status !== 'ok' && (
                <button
                  type="button"
                  onClick={() => setShowInstallDialog(true)}
                  className="text-xs text-green-600 dark:text-green-400 font-medium hover:underline"
                >
                  Pasang
                </button>
              )}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {status?.cleanerScheduler.details || 'Memeriksa scheduler…'}
            </p>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
              <div className="bg-gray-50 dark:bg-gray-900/60 p-2 rounded-md border border-gray-100 dark:border-gray-800">
                <span className="font-semibold text-gray-700 dark:text-gray-300 block">vm-open (07:30)</span>
                Bersihkan sisa kemarin, buka hotspot.
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/60 p-2 rounded-md border border-gray-100 dark:border-gray-800">
                <span className="font-semibold text-gray-700 dark:text-gray-300 block">vm-cleaner (5 mnt)</span>
                Tambah menit terpakai & hapus yang habis.
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/60 p-2 rounded-md border border-gray-100 dark:border-gray-800">
                <span className="font-semibold text-gray-700 dark:text-gray-300 block">vm-close (14:30)</span>
                Kick aktif, hanguskan sisa hari ini, tutup hotspot.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => setShowInstallDialog(true)}
          className="gap-2 bg-green-600 hover:bg-green-700 text-white"
        >
          <Download className="w-4 h-4" />
          Pasang Semua
        </Button>

        <Button
          variant="outline"
          onClick={handleVerify}
          disabled={isVerifying}
          className="gap-2"
        >
          <CheckCircle2 className="w-4 h-4" />
          {isVerifying ? 'Memverifikasi…' : 'Verifikasi'}
        </Button>

        <Button
          variant="outline"
          onClick={() => setShowUninstallDialog(true)}
          className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 border-red-200 dark:border-red-900"
        >
          <Upload className="w-4 h-4" />
          Copot
        </Button>
      </div>

      {/* Info Callout */}
      <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 flex items-start gap-3 text-xs text-blue-900 dark:text-blue-300">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">Keamanan Router & Prefix Standar</p>
          <p className="text-blue-800/80 dark:text-blue-300/80">
            Semua otomasi yang dipasang hanya menggunakan prefix <code className="font-mono bg-blue-100 dark:bg-blue-900/50 px-1 py-0.5 rounded text-[11px]">vm-</code>. Tombol <strong>Copot</strong> hanya akan menghapus objek berawalan tersebut dan tidak akan mengganggu konfigurasi router lainnya.
          </p>
        </div>
      </div>

      {/* Dialog 1: Konfirmasi Pasang Semua */}
      <Dialog open={showInstallDialog} onOpenChange={setShowInstallDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader onClose={() => setShowInstallDialog(false)}>
            <DialogTitle>Pasang Script & Scheduler Router</DialogTitle>
            <DialogDescription>
              Tinjau daftar script dan scheduler yang akan dipasang ke router MikroTik Anda.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4 overflow-y-auto pr-1">
            <div className="text-xs text-gray-600 dark:text-gray-400">
              Berikut objek dengan prefix <strong className="font-mono text-gray-900 dark:text-gray-100">vm-</strong> yang akan dibuat:
              <ul className="list-disc list-inside mt-1.5 space-y-1 text-gray-700 dark:text-gray-300">
                <li>Script on-login pada semua profil hotspot (<code className="font-mono">/ip hotspot user profile</code>)</li>
                <li>Scheduler <strong className="font-mono">vm-cleaner</strong> (interval 5 menit, guard jam {operationalHours.openTime}-{operationalHours.closeTime} & NTP)</li>
                <li>Scheduler <strong className="font-mono">vm-open</strong> (jam {operationalHours.openTime}, interval 1 hari)</li>
                <li>Scheduler <strong className="font-mono">vm-close</strong> (jam {operationalHours.closeTime}, interval 1 hari)</li>
              </ul>
            </div>

            {/* Code Box: On-Login */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5" /> 1. on-login Script (Profil Hotspot)
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(buildOnLoginScript(), 'on-login')}
                  className="flex items-center gap-1 text-green-600 dark:text-green-400 hover:underline"
                >
                  {copiedCode === 'on-login' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  Salin
                </button>
              </div>
              <pre className="p-3 bg-gray-900 text-gray-100 rounded-lg text-xs font-mono overflow-x-auto max-h-28">
                {buildOnLoginScript()}
              </pre>
            </div>

            {/* Code Box: vm-cleaner */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> 2. vm-cleaner (Tiap 5 Menit)
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(buildVmCleanerScript(operationalHours), 'cleaner')}
                  className="flex items-center gap-1 text-green-600 dark:text-green-400 hover:underline"
                >
                  {copiedCode === 'cleaner' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  Salin
                </button>
              </div>
              <pre className="p-3 bg-gray-900 text-gray-100 rounded-lg text-xs font-mono overflow-x-auto max-h-32">
                {buildVmCleanerScript(operationalHours)}
              </pre>
            </div>
            {/* Code Box: vm-open */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> 3. vm-open (Buka Hotspot Jam {operationalHours.openTime})
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(buildVmOpenScript(), 'vm-open')}
                  className="flex items-center gap-1 text-green-600 dark:text-green-400 hover:underline"
                >
                  {copiedCode === 'vm-open' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  Salin
                </button>
              </div>
              <pre className="p-3 bg-gray-900 text-gray-100 rounded-lg text-xs font-mono overflow-x-auto max-h-28">
                {buildVmOpenScript()}
              </pre>
            </div>

            {/* Code Box: vm-close */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> 4. vm-close (Tutup Hotspot Jam {operationalHours.closeTime})
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(buildVmCloseScript(), 'vm-close')}
                  className="flex items-center gap-1 text-green-600 dark:text-green-400 hover:underline"
                >
                  {copiedCode === 'vm-close' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  Salin
                </button>
              </div>
              <pre className="p-3 bg-gray-900 text-gray-100 rounded-lg text-xs font-mono overflow-x-auto max-h-28">
                {buildVmCloseScript()}
              </pre>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInstallDialog(false)}>
              Batal
            </Button>
            <Button
              onClick={handleInstall}
              disabled={isInstalling}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              {isInstalling ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Memasang…
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" /> Pasang Sekarang
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 2: Verifikasi & Diff */}
      <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader onClose={() => setShowVerifyDialog(false)}>
            <DialogTitle>Hasil Verifikasi Script Router</DialogTitle>
            <DialogDescription>
              Perbandingan konfigurasi aktif di router dengan spesifikasi aplikasi.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3 overflow-y-auto pr-1">
            {diffItems.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">Tidak ada objek yang diperiksa.</p>
            ) : (
              <div className="space-y-2">
                {diffItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                        {item.name}
                      </span>
                      {item.status === 'matched' ? (
                        <span className="px-2 py-0.5 text-[11px] rounded-full font-medium bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Cocok
                        </span>
                      ) : item.status === 'different' ? (
                        <span className="px-2 py-0.5 text-[11px] rounded-full font-medium bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Berbeda
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[11px] rounded-full font-medium bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> Belum Ada
                        </span>
                      )}
                    </div>
                    {item.status !== 'matched' && (
                      <p className="text-[11px] text-gray-500">
                        {item.status === 'different'
                          ? 'Script di router memiliki versi berbeda. Klik "Pasang Semua" untuk memperbarui.'
                          : 'Komponen belum ditemukan di router.'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <Button onClick={() => setShowVerifyDialog(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 3: Konfirmasi Copot */}
      <Dialog open={showUninstallDialog} onOpenChange={setShowUninstallDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader onClose={() => setShowUninstallDialog(false)}>
            <DialogTitle className="text-red-600 dark:text-red-400">
              Copot Script & Scheduler?
            </DialogTitle>
            <DialogDescription>
              Tindakan ini akan membersihkan semua otomasi voucher dari router.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Objek berikut akan dihapus dari router:
            </p>
            <ul className="list-disc list-inside text-xs text-gray-600 dark:text-gray-400 space-y-1">
              <li>Semua scheduler berawalan <code className="font-mono text-gray-900 dark:text-gray-100">vm-*</code> (<code className="font-mono">vm-cleaner</code>, <code className="font-mono">vm-open</code>, <code className="font-mono">vm-close</code>)</li>
              <li>Field on-login pada profil hotspot akan dikosongkan</li>
              <li>Akun user dan data router lainnya <strong>TIDAK</strong> akan disentuh</li>
            </ul>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUninstallDialog(false)}>
              Batal
            </Button>
            <Button
              onClick={handleUninstall}
              disabled={isUninstalling}
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
            >
              {isUninstalling ? 'Mencopot…' : 'Ya, Copot Objek vm-'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 4: Panduan NTP */}
      <Dialog open={showNtpGuideDialog} onOpenChange={setShowNtpGuideDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader onClose={() => setShowNtpGuideDialog(false)}>
            <DialogTitle>Panduan Pengaturan NTP MikroTik</DialogTitle>
            <DialogDescription>
              Agar perhitungan masa berlaku voucher tidak meleset, router harus memiliki waktu yang akurat.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Buka terminal Winbox / SSH router dan jalankan perintah berikut:
            </p>
            <pre className="p-3 bg-gray-900 text-green-400 rounded-lg text-xs font-mono overflow-x-auto">
              {`/system ntp client set enabled=yes\n/system clock set time-zone-name=Asia/Jakarta`}
            </pre>
            <p className="text-xs text-gray-500">
              Untuk RouterOS v6, Anda dapat memasukkan server NTP Indonesia:
            </p>
            <pre className="p-3 bg-gray-900 text-green-400 rounded-lg text-xs font-mono overflow-x-auto">
              {`/system ntp client set primary-ntp=103.111.49.20 secondary-ntp=103.28.188.163`}
            </pre>
          </DialogBody>

          <DialogFooter>
            <Button onClick={() => setShowNtpGuideDialog(false)}>
              Saya Mengerti
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
