/**
 * Dialog form untuk buat/edit profil hotspot
 * Sesuai DESIGN.md §4.3 dan DEV-SPEC.md §6.2
 * - shared-users dikunci 1
 * - Input speed: upload & download (satuan k/M) → rate-limit "rx/tx"
 * - Masa berlaku: dihitung sejak login pertama (on-login script)
 * - Opsi lanjutan: idle-timeout, keepalive-timeout, address-pool, mac-cookie-timeout
 */

import { useState, useEffect } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Loader2, Lock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import type { HotspotProfile } from '../../core/router/types';
import { isValidProfileName, isValidDuration, isValidSpeed } from '../../core/utils/validation';

interface ProfileFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile?: HotspotProfile; // Jika ada, mode edit
  onSave: (data: {
    name: string;
    uploadSpeed: string;
    downloadSpeed: string;
    validity?: string;
    idleTimeout?: string;
    keepaliveTimeout?: string;
    addressPool?: string;
    macCookieTimeout?: string;
  }) => Promise<void>;
}

// Unit untuk masa berlaku
type ValidityUnit = 'menit' | 'jam' | 'hari' | 'minggu';

const UNIT_TO_ROUTERS: Record<ValidityUnit, (n: number) => string> = {
  menit: n => `${n}m`,
  jam: n => `${n}h`,
  hari: n => `${n}d`,
  minggu: n => `${n}w`,
};

const ROUTERS_TO_UNIT = (validity: string): { value: number; unit: ValidityUnit } | null => {
  const match = validity.match(/^(\d+)([smhdw])$/);
  if (!match) return null;
  const num = parseInt(match[1]);
  const unitChar = match[2];
  const map: Record<string, ValidityUnit> = {
    m: 'menit', h: 'jam', d: 'hari', w: 'minggu',
  };
  return { value: num, unit: map[unitChar] || 'jam' };
};

// Parse rate-limit "rx/tx" → { upload, download, uploadUnit, downloadUnit }
function parseRateLimitParts(rateLimit: string): {
  upload: string;
  download: string;
  uploadUnit: 'k' | 'M';
  downloadUnit: 'k' | 'M';
} {
  const parts = rateLimit.split('/');
  const parsePart = (part: string): { value: string; unit: 'k' | 'M' } => {
    const match = part.match(/^(\d+)([kM])$/);
    if (!match) return { value: part, unit: 'M' };
    return { value: match[1], unit: match[2] as 'k' | 'M' };
  };
  const upload = parts[0] ? parsePart(parts[0]) : { value: '1', unit: 'M' as 'k' | 'M' };
  const download = parts[1] ? parsePart(parts[1]) : { value: '2', unit: 'M' as 'k' | 'M' };
  return {
    upload: upload.value,
    uploadUnit: upload.unit,
    download: download.value,
    downloadUnit: download.unit,
  };
}

export function ProfileFormDialog({
  open,
  onOpenChange,
  profile,
  onSave,
}: ProfileFormDialogProps) {
  const isEdit = !!profile;

  // Form state
  const [name, setName] = useState('');
  const [upload, setUpload] = useState('1');
  const [uploadUnit, setUploadUnit] = useState<'k' | 'M'>('M');
  const [download, setDownload] = useState('2');
  const [downloadUnit, setDownloadUnit] = useState<'k' | 'M'>('M');

  // Masa berlaku
  const [validityEnabled, setValidityEnabled] = useState(false);
  const [validityValue, setValidityValue] = useState('1');
  const [validityUnit, setValidityUnit] = useState<ValidityUnit>('jam');

  // Opsi lanjutan
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [idleTimeout, setIdleTimeout] = useState('');
  const [keepaliveTimeout, setKeepaliveTimeout] = useState('');
  const [addressPool, setAddressPool] = useState('');
  const [macCookieTimeout, setMacCookieTimeout] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form dari profile yang ada (mode edit)
  useEffect(() => {
    if (!open) return;

    if (profile) {
      setName(profile.name);

      // Parse rate-limit
      if (profile['rate-limit']) {
        const parts = parseRateLimitParts(profile['rate-limit']);
        setUpload(parts.upload);
        setUploadUnit(parts.uploadUnit);
        setDownload(parts.download);
        setDownloadUnit(parts.downloadUnit);
      }

      // Parse validity (support both session-timeout and validity)
      const validityValue = profile['session-timeout'] || profile.validity;
      if (validityValue && validityValue !== 'none') {
        const parsed = ROUTERS_TO_UNIT(validityValue);
        if (parsed) {
          setValidityEnabled(true);
          setValidityValue(String(parsed.value));
          setValidityUnit(parsed.unit);
        }
      } else {
        setValidityEnabled(false);
      }

      // Opsi lanjutan
      setIdleTimeout(profile['idle-timeout'] || '');
      setKeepaliveTimeout(profile['keepalive-timeout'] || '');
      setAddressPool(profile['address-pool'] || '');
      setMacCookieTimeout(profile['mac-cookie-timeout'] || '');
    } else {
      // Reset untuk mode create
      setName('');
      setUpload('1');
      setUploadUnit('M');
      setDownload('2');
      setDownloadUnit('M');
      setValidityEnabled(false);
      setValidityValue('1');
      setValidityUnit('jam');
      setIdleTimeout('');
      setKeepaliveTimeout('');
      setAddressPool('');
      setMacCookieTimeout('');
    }

    setShowAdvanced(false);
    setError(null);
  }, [profile, open]);

  const handleSave = async () => {
    setError(null);

    // Validasi nama
    if (!name.trim()) {
      setError('Nama profil tidak boleh kosong');
      return;
    }
    if (!isValidProfileName(name.trim())) {
      setError('Nama profil hanya boleh huruf, angka, spasi, dash, dan underscore (maks 50 karakter)');
      return;
    }

    // Build speed values
    const uploadSpeed = `${upload}${uploadUnit}`;
    const downloadSpeed = `${download}${downloadUnit}`;

    if (!isValidSpeed(uploadSpeed)) {
      setError('Kecepatan upload tidak valid');
      return;
    }
    if (!isValidSpeed(downloadSpeed)) {
      setError('Kecepatan download tidak valid');
      return;
    }

    // Build validity
    let validity: string | undefined;
    if (validityEnabled) {
      const valNum = parseInt(validityValue, 10);
      if (isNaN(valNum) || valNum <= 0) {
        setError('Nilai masa berlaku harus angka positif');
        return;
      }
      validity = UNIT_TO_ROUTERS[validityUnit](valNum);
      if (!isValidDuration(validity)) {
        setError('Format masa berlaku tidak valid');
        return;
      }
    }

    // Validasi opsi lanjutan jika diisi
    if (idleTimeout && !isValidDuration(idleTimeout)) {
      setError('Format idle-timeout tidak valid (contoh: 10m, 1h)');
      return;
    }
    if (keepaliveTimeout && !isValidDuration(keepaliveTimeout)) {
      setError('Format keepalive-timeout tidak valid (contoh: 10m, 1h)');
      return;
    }
    if (macCookieTimeout && !isValidDuration(macCookieTimeout)) {
      setError('Format mac-cookie-timeout tidak valid (contoh: 1d, 1w)');
      return;
    }

    setIsSaving(true);

    try {
      await onSave({
        name: name.trim(),
        uploadSpeed,
        downloadSpeed,
        validity,
        idleTimeout: idleTimeout || undefined,
        keepaliveTimeout: keepaliveTimeout || undefined,
        addressPool: addressPool || undefined,
        macCookieTimeout: macCookieTimeout || undefined,
      });
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) {
      onOpenChange(false);
    }
  };

  // Preview rate-limit
  const rateLimitPreview = `${upload}${uploadUnit}/${download}${downloadUnit}`;
  const validityPreview = validityEnabled
    ? UNIT_TO_ROUTERS[validityUnit](parseInt(validityValue, 10) || 0)
    : 'Tidak kedaluwarsa';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader onClose={handleClose}>
          <DialogTitle>{isEdit ? 'Ubah Profil' : 'Buat Profil Hotspot'}</DialogTitle>
          <DialogDescription>
            Profil menentukan kecepatan, masa berlaku, dan batasan akses untuk voucher
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            {/* Nama Profil */}
            <div>
              <Label htmlFor="name" className="mb-1.5 block">
                Nama Profil <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Contoh: 1hari-2mbps"
                disabled={isSaving}
                className="font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                Nama profil di RouterOS (hanya huruf, angka, dash, underscore)
              </p>
            </div>

            {/* Kecepatan */}
            <div>
              <Label className="mb-2 block">Kecepatan</Label>
              <div className="grid grid-cols-2 gap-3">
                {/* Upload */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Upload
                  </label>
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      value={upload}
                      onChange={e => setUpload(e.target.value)}
                      min="1"
                      disabled={isSaving}
                      className="flex-1"
                    />
                    <select
                      value={uploadUnit}
                      onChange={e => setUploadUnit(e.target.value as 'k' | 'M')}
                      disabled={isSaving}
                      className="px-2 py-2 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-600"
                    >
                      <option value="k">k (Kbps)</option>
                      <option value="M">M (Mbps)</option>
                    </select>
                  </div>
                </div>
                {/* Download */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Download
                  </label>
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      value={download}
                      onChange={e => setDownload(e.target.value)}
                      min="1"
                      disabled={isSaving}
                      className="flex-1"
                    />
                    <select
                      value={downloadUnit}
                      onChange={e => setDownloadUnit(e.target.value as 'k' | 'M')}
                      disabled={isSaving}
                      className="px-2 py-2 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-600"
                    >
                      <option value="k">k (Kbps)</option>
                      <option value="M">M (Mbps)</option>
                    </select>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1.5">
                rate-limit: <span className="font-mono text-gray-700 dark:text-gray-300">{rateLimitPreview}</span>
              </p>
            </div>

            {/* Masa Berlaku */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Masa Berlaku</Label>
                <button
                  type="button"
                  onClick={() => setValidityEnabled(!validityEnabled)}
                  className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                  style={{
                    backgroundColor: validityEnabled ? '#15803D' : '#CBD5E1',
                  }}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      validityEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              {validityEnabled ? (
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={validityValue}
                    onChange={e => setValidityValue(e.target.value)}
                    min="1"
                    disabled={isSaving}
                    className="flex-1"
                  />
                  <select
                    value={validityUnit}
                    onChange={e => setValidityUnit(e.target.value as ValidityUnit)}
                    disabled={isSaving}
                    className="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-600"
                  >
                    <option value="menit">menit</option>
                    <option value="jam">jam</option>
                    <option value="hari">hari</option>
                    <option value="minggu">minggu</option>
                  </select>
                </div>
              ) : (
                <div className="p-3 rounded-md bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <p className="text-sm text-gray-500">Tidak kedaluwarsa</p>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1.5">
                <span className="font-mono text-gray-700 dark:text-gray-300">{validityPreview}</span>
                {' · '}
                Dihitung sejak login pertama, terus berjalan walau perangkat terputus
              </p>
            </div>

            {/* Pengguna per Akun (Dikunci) */}
            <div>
              <Label className="mb-1.5 block">Pengguna per Akun</Label>
              <div className="flex items-center gap-2 p-3 rounded-md bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <Lock className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">1</span>
                <span className="text-xs text-gray-500">
                  · Dikunci: 1 akun untuk 1 perangkat
                </span>
              </div>
            </div>

            {/* Opsi Lanjutan */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Lanjutan
              </button>
              {showAdvanced && (
                <div className="mt-3 space-y-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  {/* Idle Timeout */}
                  <div>
                    <Label htmlFor="idle" className="mb-1 block text-xs">Idle Timeout</Label>
                    <Input
                      id="idle"
                      value={idleTimeout}
                      onChange={e => setIdleTimeout(e.target.value)}
                      placeholder="Contoh: 10m"
                      disabled={isSaving}
                      className="font-mono text-sm"
                    />
                  </div>
                  {/* Keepalive Timeout */}
                  <div>
                    <Label htmlFor="keepalive" className="mb-1 block text-xs">Keepalive Timeout</Label>
                    <Input
                      id="keepalive"
                      value={keepaliveTimeout}
                      onChange={e => setKeepaliveTimeout(e.target.value)}
                      placeholder="Contoh: 10m"
                      disabled={isSaving}
                      className="font-mono text-sm"
                    />
                  </div>
                  {/* Address Pool */}
                  <div>
                    <Label htmlFor="pool" className="mb-1 block text-xs">Address Pool</Label>
                    <Input
                      id="pool"
                      value={addressPool}
                      onChange={e => setAddressPool(e.target.value)}
                      placeholder="Contoh: hotspot-pool"
                      disabled={isSaving}
                      className="font-mono text-sm"
                    />
                  </div>
                  {/* MAC Cookie Timeout */}
                  <div>
                    <Label htmlFor="cookie" className="mb-1 block text-xs">MAC Cookie Timeout</Label>
                    <Input
                      id="cookie"
                      value={macCookieTimeout}
                      onChange={e => setMacCookieTimeout(e.target.value)}
                      placeholder="Contoh: 1d"
                      disabled={isSaving}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            Batal
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Menyimpan...
              </>
            ) : (
              'Simpan'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
