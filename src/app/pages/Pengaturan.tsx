/**
 * Halaman Pengaturan Aplikasi
 * Sesuai DESIGN.md §4.9 & KEPUTUSAN TERBARU §4, §5
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Database,
  FileText,
  Lock,
  Printer,
  Wifi,
  Radio,
  Server,
  CheckCircle2,
  Unplug,
  RefreshCw,
  Clock,
  Download,
  Upload,
  AlertTriangle,
  QrCode,
  Shield,
} from 'lucide-react';
import { strings } from '../../strings/id';
import { useRouterStore } from '../../stores/router-store';
import { db } from '../../core/db/schema';
import {
  getAppSettings,
  saveAppSettings,
  type MikaAppSettings,
  DEFAULT_APP_SETTINGS,
} from '../../features/settings/settings-service';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogBody,
} from '../../components/ui/dialog';

function RouterSettingsTab() {
  const {
    connectionStatus,
    systemResource,
    overview,
    config,
    setModalOpen,
    disconnect,
    fetchOverview,
  } = useRouterStore();

  const isConnected = connectionStatus === 'connected';

  return (
    <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-2xs space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Koneksi Router MikroTik
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Status dan konfigurasi integrasi dengan MikroTik RouterOS
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-xs transition-colors"
        >
          <Radio className="w-3.5 h-3.5" />
          {isConnected ? 'Ganti / Konfigurasi' : 'Pindai & Hubungkan'}
        </button>
      </div>

      {/* Connection status badge card */}
      <div
        className={`p-4 rounded-xl border flex items-center justify-between ${
          isConnected
            ? 'bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800'
            : 'bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-lg ${
              isConnected
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 dark:bg-gray-800 text-gray-500'
            }`}
          >
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {isConnected
                  ? overview?.resource?.identity || systemResource?.boardName || 'Router Terhubung'
                  : 'Belum Terhubung ke Router'}
              </span>
              {isConnected && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
                  <CheckCircle2 className="w-3 h-3" />
                  Online
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {isConnected && systemResource
                ? `RouterOS v${systemResource.version} (${systemResource.architecture}) · Uptime: ${systemResource.uptime}`
                : 'Pindai router melalui MNDP atau masukkan IP router MikroTik secara manual'}
            </p>
          </div>
        </div>

        {isConnected && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchOverview()}
              title="Perbarui Data"
              className="p-2 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => disconnect()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 bg-white dark:bg-gray-900 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-lg transition-colors"
            >
              <Unplug className="w-3.5 h-3.5" />
              Putuskan
            </button>
          </div>
        )}
      </div>

      {/* Details Table */}
      {isConnected && (
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg divide-y divide-gray-100 dark:divide-gray-800 text-xs">
          <div className="flex justify-between p-3">
            <span className="text-gray-500">Host / IP</span>
            <span className="font-mono font-medium text-gray-900 dark:text-gray-100">
              {overview?.config?.host || config?.host || '—'}
            </span>
          </div>
          <div className="flex justify-between p-3">
            <span className="text-gray-500">Port & Protokol</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {overview?.config?.port || config?.port || 8728} (
              {overview?.config?.protocol?.toUpperCase() || 'API'})
            </span>
          </div>
          <div className="flex justify-between p-3">
            <span className="text-gray-500">Username Login</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {overview?.config?.username || config?.username || 'admin'}
            </span>
          </div>
          <div className="flex justify-between p-3">
            <span className="text-gray-500">Pengguna Hotspot Aktif</span>
            <span className="font-semibold text-green-600 dark:text-green-400">
              {overview?.activeHotspotUsersCount ?? 0} user
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function Pengaturan() {
  const [activeTab, setActiveTab] = useState<'router' | 'voucher' | 'print' | 'backup' | 'security'>('voucher');
  const [settings, setSettings] = useState<MikaAppSettings>(DEFAULT_APP_SETTINGS);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Import / Export state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importConfirmDialog, setImportConfirmDialog] = useState<any | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Load settings on mount
  useEffect(() => {
    getAppSettings().then(setSettings);
  }, []);

  const handleSaveSettings = async () => {
    try {
      await saveAppSettings(settings);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  // Live gapY calculation for Print tab
  const calculatedGapY = useMemo(() => {
    // pageH = 297mm, 4 vouchers * 54mm = 216mm
    const availableSpace = 297 - (settings.marginY * 2) - 216;
    return availableSpace / 3;
  }, [settings.marginY]);

  // Export JSON backup
  const handleExportBackup = async () => {
    try {
      const [batches, plans, rawSettings] = await Promise.all([
        db.batches.toArray(),
        db.plans.toArray(),
        db.settings.toArray(),
      ]);

      const backupData = {
        app: 'Mika MikroTik Voucher Manager',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        batches,
        plans,
        settings: rawSettings,
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-mika-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Gagal mengekspor data');
    }
  };

  // Select file for Import JSON backup
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed.batches || !parsed.plans) {
          throw new Error('Format file cadangan tidak valid');
        }
        setImportConfirmDialog(parsed);
      } catch (err) {
        alert('File JSON tidak valid: ' + (err instanceof Error ? err.message : 'Unknown'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Confirm Import
  const handleConfirmImport = async () => {
    if (!importConfirmDialog) return;
    try {
      setIsImporting(true);
      await db.transaction('rw', db.batches, db.plans, db.settings, async () => {
        await db.batches.clear();
        await db.plans.clear();
        await db.settings.clear();

        if (importConfirmDialog.batches?.length) {
          await db.batches.bulkAdd(importConfirmDialog.batches);
        }
        if (importConfirmDialog.plans?.length) {
          await db.plans.bulkAdd(importConfirmDialog.plans);
        }
        if (importConfirmDialog.settings?.length) {
          await db.settings.bulkAdd(importConfirmDialog.settings);
        }
      });

      const updatedSettings = await getAppSettings();
      setSettings(updatedSettings);
      setImportConfirmDialog(null);
      alert('Impor data berhasil dipulihkan.');
    } catch (err) {
      console.error('Import failed:', err);
      alert('Gagal memulihkan data');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {strings.nav.pengaturan}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Konfigurasi tampilan voucher, pencetakan kertas A4, jam operasional, dan pencadangan data
        </p>
      </div>

      {/* Sub-tab navigation - DESIGN.md §4.9 */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setActiveTab('voucher')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
            activeTab === 'voucher'
              ? 'border-green-600 text-green-600 dark:text-green-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900'
          }`}
        >
          <FileText className="w-4 h-4" />
          Tampilan Voucher
        </button>

        <button
          onClick={() => setActiveTab('print')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
            activeTab === 'print'
              ? 'border-green-600 text-green-600 dark:text-green-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900'
          }`}
        >
          <Printer className="w-4 h-4" />
          Cetak (A4)
        </button>

        <button
          onClick={() => setActiveTab('router')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
            activeTab === 'router'
              ? 'border-green-600 text-green-600 dark:text-green-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900'
          }`}
        >
          <Wifi className="w-4 h-4" />
          Router
        </button>

        <button
          onClick={() => setActiveTab('backup')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
            activeTab === 'backup'
              ? 'border-green-600 text-green-600 dark:text-green-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900'
          }`}
        >
          <Database className="w-4 h-4" />
          Backup & Restore
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
            activeTab === 'security'
              ? 'border-green-600 text-green-600 dark:text-green-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900'
          }`}
        >
          <Lock className="w-4 h-4" />
          Keamanan
        </button>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-xs text-green-700 dark:text-green-300 rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Pengaturan berhasil disimpan.
        </div>
      )}

      {/* Tab Router */}
      {activeTab === 'router' && <RouterSettingsTab />}

      {/* Tab Tampilan Voucher & Jam Operasional */}
      {activeTab === 'voucher' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Form Pengaturan (7 cols) */}
          <div className="lg:col-span-7 bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-5 shadow-xs">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Identitas & Tampilan Voucher
            </h2>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nama Merek (Header Kiri)
                </label>
                <input
                  type="text"
                  maxLength={16}
                  value={settings.brandName}
                  onChange={e => setSettings({ ...settings, brandName: e.target.value })}
                  placeholder="WIFI TKJ"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 font-semibold focus:ring-1 focus:ring-green-600 text-xs"
                />
                <p className="text-[11px] text-gray-400 mt-1">Maksimal 16 karakter (Default: WIFI TKJ)</p>
              </div>

              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  URL Login Hotspot (QR Code)
                </label>
                <input
                  type="text"
                  value={settings.loginUrl}
                  onChange={e => setSettings({ ...settings, loginUrl: e.target.value })}
                  placeholder="http://hotspot.local/login"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 font-mono focus:ring-1 focus:ring-green-600 text-xs"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  URL yang akan disematkan ke QR code voucher beserta parameter username & password.
                </p>
              </div>

              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Catatan Kaki Voucher
                </label>
                <input
                  type="text"
                  value={settings.footnote}
                  onChange={e => setSettings({ ...settings, footnote: e.target.value })}
                  placeholder="1 akun untuk 1 perangkat"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:ring-1 focus:ring-green-600 text-xs"
                />
                <p className="text-[11px] text-gray-400 mt-1">Muncul di baris bawah voucher.</p>
              </div>

              <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-green-600" />
                  Jam Operasional Hotspot (KEPUTUSAN TERBARU §5)
                </h3>
                <p className="text-[11px] text-gray-500 mb-3">
                  Waktu penghitungan masa berlaku voucher aktif. Di luar jam ini kuota voucher dijeda dan hotspot dimatikan.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-600 dark:text-gray-400 mb-1">Jam Buka (Open)</label>
                    <input
                      type="text"
                      pattern="[0-2][0-9]:[0-5][0-9]"
                      value={settings.openTime}
                      onChange={e => setSettings({ ...settings, openTime: e.target.value })}
                      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 font-mono text-xs"
                      placeholder="07:30"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-600 dark:text-gray-400 mb-1">Jam Tutup (Close)</label>
                    <input
                      type="text"
                      pattern="[0-2][0-9]:[0-5][0-9]"
                      value={settings.closeTime}
                      onChange={e => setSettings({ ...settings, closeTime: e.target.value })}
                      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 font-mono text-xs"
                      placeholder="14:30"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3">
                <Button onClick={handleSaveSettings} className="bg-green-600 hover:bg-green-700 text-white gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Simpan Pengaturan
                </Button>
              </div>
            </div>
          </div>

          {/* Live Card Preview (5 cols) */}
          <div className="lg:col-span-5 bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4 shadow-xs">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-green-600" />
              Pratinjau Live Desain D (85 × 54 mm)
            </h3>

            {/* Simulated Voucher Card matching Desain D */}
            <div className="w-full aspect-[85/54] rounded-lg border border-gray-300 dark:border-gray-700 overflow-hidden shadow-md flex flex-col bg-white text-gray-900 select-none">
              {/* Header Hitam (tinggi 17mm ratio ≈ 31%) */}
              <div className="bg-[#111827] text-white p-3 flex flex-col justify-between" style={{ height: '31.5%' }}>
                <div className="flex justify-between items-center text-[10px] text-[#94A3B8] font-medium">
                  <span className="truncate max-w-[120px]">{settings.brandName || 'WIFI TKJ'}</span>
                  <span>Paket 1 Hari</span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-lg font-extrabold text-white leading-none">Rp 5.000</span>
                  <span className="text-xs font-bold text-[#4ADE80] leading-none">1 HARI</span>
                </div>
              </div>

              {/* Body Putih */}
              <div className="flex-1 p-2.5 flex justify-between gap-2">
                <div className="flex-1 flex flex-col justify-between text-[9px] text-[#64748B]">
                  {/* Credentials */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[7.5px] uppercase font-semibold text-[#64748B]">Username</div>
                      <div className="font-mono font-bold text-gray-900 text-xs">k7m2xq</div>
                    </div>
                    <div>
                      <div className="text-[7.5px] uppercase font-semibold text-[#64748B]">Password</div>
                      <div className="font-mono font-bold text-gray-900 text-xs">p9d4ba</div>
                    </div>
                  </div>

                  <div className="h-px bg-gray-200 w-full" />

                  {/* Footnotes */}
                  <div className="space-y-0.5 text-[8px] leading-tight">
                    <div>Berlaku 1 hari sejak login pertama</div>
                    <div>Kecepatan 2 Mbps</div>
                    <div className="text-gray-500">{settings.footnote}</div>
                  </div>
                </div>

                {/* Simulated QR Box */}
                <div className="w-14 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 bg-gray-100 border border-gray-300 rounded flex items-center justify-center p-1">
                    <QrCode className="w-9 h-9 text-gray-800" />
                  </div>
                  <span className="text-[7px] text-gray-500 mt-0.5 text-center leading-tight">
                    Scan login
                  </span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-gray-400">
              Header solid hitam · durasi hijau <span className="font-mono text-green-600">#4ADE80</span> · harga 22 pt tebal.
            </p>
          </div>
        </div>
      )}

      {/* Tab Cetak */}
      {activeTab === 'print' && (
        <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-6 max-w-2xl shadow-xs">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Pengaturan Cetak Kertas A4 (Grid 2 × 4)
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Satu halaman memuat tepat 8 voucher ukuran kartu identitas (85 × 54 mm).
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Margin Vertikal (Y)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="5"
                    max="35"
                    value={settings.marginY}
                    onChange={e => setSettings({ ...settings, marginY: parseFloat(e.target.value) || 15 })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 font-mono text-xs"
                  />
                  <span className="absolute right-3 top-2 text-gray-400">mm</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Default: 15 mm</p>
              </div>

              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Margin Horizontal (Kiri/Kanan)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value="🔒 10.0 mm (Tetap)"
                    disabled
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-500 cursor-not-allowed font-medium text-xs"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Terkunci sesuai spesifikasi Desain D</p>
              </div>
            </div>

            {/* GapY Live Formula Display */}
            <div className="p-3.5 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-gray-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-700 dark:text-gray-300">Jarak Antar Baris (gapY Otomatis):</span>
                <span className="font-mono font-bold text-green-600 dark:text-green-400 text-sm">
                  {calculatedGapY.toFixed(2)} mm
                </span>
              </div>
              <p className="text-[10px] text-gray-400 font-mono">
                Formula: (297 mm - 2 × {settings.marginY} mm - 216 mm) / 3
              </p>
              {calculatedGapY < 0 && (
                <div className="text-red-500 font-semibold text-xs pt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Peringatan: Margin Y terlalu besar! Voucher akan saling bertumpuk.
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Offset Printer X
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    value={settings.offsetX}
                    onChange={e => setSettings({ ...settings, offsetX: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 font-mono text-xs"
                  />
                  <span className="absolute right-3 top-2 text-gray-400">mm</span>
                </div>
              </div>

              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Offset Printer Y
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    value={settings.offsetY}
                    onChange={e => setSettings({ ...settings, offsetY: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 font-mono text-xs"
                  />
                  <span className="absolute right-3 top-2 text-gray-400">mm</span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button onClick={handleSaveSettings} className="bg-green-600 hover:bg-green-700 text-white">
                Simpan Pengaturan Cetak
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Backup & Restore */}
      {activeTab === 'backup' && (
        <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-6 max-w-2xl shadow-xs">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Pencadangan & Pemulihan (Backup & Restore)
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Amankan riwayat voucher dan paket hotspot Anda ke dalam file cadangan lokal.
            </p>
          </div>

          <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs space-y-1 text-amber-800 dark:text-amber-300">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Peringatan Penyimpanan Lokal
            </div>
            <p className="leading-relaxed">
              Seluruh data aplikasi (paket, riwayat batch voucher, pengaturan) tersimpan secara lokal di peramban Anda (IndexedDB). Menghapus riwayat/cache peramban akan menghapus data ini. Lakukan pencadangan rutin ke file JSON.
            </p>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-800 rounded-xl">
              <div>
                <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                  Ekspor Cadangan (JSON)
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Unduh seluruh daftar batch, paket, dan pengaturan ke file JSON.
                </p>
              </div>

              <Button onClick={handleExportBackup} variant="outline" size="sm" className="gap-2 text-xs">
                <Download className="w-3.5 h-3.5" />
                Ekspor JSON
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-800 rounded-xl">
              <div>
                <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                  Impor Cadangan (JSON)
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Pulihkan data dari file JSON yang pernah Anda unduh sebelumnya.
                </p>
              </div>

              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json,application/json"
                  onChange={handleFileSelected}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs text-blue-600 hover:text-blue-700 border-blue-200"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Pilih File JSON
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Keamanan */}
      {activeTab === 'security' && (
        <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-6 max-w-2xl shadow-xs">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-600" />
              Keamanan & Enkripsi
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Kredensial dan data dilindungi dengan standar WebCrypto modern
            </p>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-gray-800 text-xs space-y-2">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Spesifikasi Enkripsi Mika:
            </h3>
            <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-1 text-[11px]">
              <li>Algoritma: <strong>AES-GCM 256-bit</strong> dengan IV acak 12 byte</li>
              <li>Key Derivation: <strong>PBKDF2</strong> dengan 100.000 iterasi & salt acak 16 byte</li>
              <li>Enkripsi berlangsung sepenuhnya di perangkat klien tanpa server backend</li>
            </ul>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-4 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                Kunci Aplikasi Sekarang
              </h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Hapus sesi dan kredensial aktif dari memori.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                sessionStorage.clear();
                window.location.reload();
              }}
              className="text-red-600 hover:text-red-700 border-red-200 gap-1.5 text-xs"
            >
              <Lock className="w-3.5 h-3.5" />
              Kunci Sekarang
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Restore Backup */}
      <Dialog open={!!importConfirmDialog} onOpenChange={() => setImportConfirmDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader onClose={() => setImportConfirmDialog(null)}>
            <DialogTitle className="text-amber-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Pulihkan Cadangan Data?
            </DialogTitle>
            <DialogDescription>
              Tindakan ini akan menimpa seluruh riwayat batch dan paket yang ada saat ini.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3 text-xs">
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-1">
              <p>Jumlah Batch: <strong>{importConfirmDialog?.batches?.length || 0}</strong></p>
              <p>Jumlah Paket: <strong>{importConfirmDialog?.plans?.length || 0}</strong></p>
              <p>Tanggal Ekspor: {importConfirmDialog?.exportedAt || '—'}</p>
            </div>
            <p className="text-gray-500">
              Pastikan Anda telah mengekspor cadangan terbaru jika masih memerlukan data yang ada saat ini.
            </p>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportConfirmDialog(null)}>
              Batal
            </Button>
            <Button
              onClick={handleConfirmImport}
              disabled={isImporting}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isImporting ? 'Memulihkan…' : 'Pulihkan Sekarang'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
