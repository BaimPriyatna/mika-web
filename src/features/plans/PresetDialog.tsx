/**
 * Dialog untuk membuat preset paket (profil + paket sekaligus)
 * Sesuai DEV-SPEC.md §6.4 dan DESIGN.md §4.4
 */

import { useState, useEffect } from 'react';
import { AlertCircle, Loader2, Zap } from 'lucide-react';
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

interface PresetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetType: '1h' | '3h' | '5h' | '7h' | null;
  onConfirm: (data: {
    label: string;
    profileName: string;
    uploadSpeed: string;
    downloadSpeed: string;
    validity: string;
    price: number;
  }) => Promise<void>;
}

const PRESET_CONFIGS = {
  '1h': {
    label: 'Paket 1 Jam',
    profileName: '1jam-2mbps',
    validity: '1h',
    uploadSpeed: '1M',
    downloadSpeed: '2M',
    suggestedPrice: 2000,
  },
  '3h': {
    label: 'Paket 3 Jam',
    profileName: '3jam-2mbps',
    validity: '3h',
    uploadSpeed: '1M',
    downloadSpeed: '2M',
    suggestedPrice: 5000,
  },
  '5h': {
    label: 'Paket 5 Jam',
    profileName: '5jam-2mbps',
    validity: '5h',
    uploadSpeed: '1M',
    downloadSpeed: '2M',
    suggestedPrice: 8000,
  },
  '7h': {
    label: 'Paket 7 Jam',
    profileName: '7jam-2mbps',
    validity: '7h',
    uploadSpeed: '1M',
    downloadSpeed: '2M',
    suggestedPrice: 10000,
  },
} as const;

export function PresetDialog({
  open,
  onOpenChange,
  presetType,
  onConfirm,
}: PresetDialogProps) {
  const preset = presetType ? PRESET_CONFIGS[presetType] : null;
  
  const [label, setLabel] = useState('');
  const [profileName, setProfileName] = useState('');
  const [uploadSpeed, setUploadSpeed] = useState('');
  const [downloadSpeed, setDownloadSpeed] = useState('');
  const [price, setPrice] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize saat preset berubah
  useEffect(() => {
    if (preset && open) {
      setLabel(preset.label);
      setProfileName(preset.profileName);
      setUploadSpeed(preset.uploadSpeed);
      setDownloadSpeed(preset.downloadSpeed);
      setPrice(preset.suggestedPrice.toString());
      setError(null);
    }
  }, [preset, open]);

  const handleConfirm = async () => {
    if (!preset) return;

    setError(null);

    // Validasi
    if (!label.trim()) {
      setError('Label tidak boleh kosong');
      return;
    }

    if (!profileName.trim()) {
      setError('Nama profil tidak boleh kosong');
      return;
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      setError('Harga harus angka positif');
      return;
    }

    setIsCreating(true);

    try {
      await onConfirm({
        label: label.trim(),
        profileName: profileName.trim(),
        uploadSpeed: uploadSpeed.trim(),
        downloadSpeed: downloadSpeed.trim(),
        validity: preset.validity,
        price: priceNum,
      });
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      setError(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      onOpenChange(false);
    }
  };

  if (!preset) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader onClose={handleClose}>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-green-600" />
            <DialogTitle>Buat dari Preset</DialogTitle>
          </div>
          <DialogDescription>
            Profil dan paket akan dibuat sekaligus dengan pengaturan standar. Anda bisa menyesuaikan
            harga sebelum membuat.
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
            {/* Preview Preset */}
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Masa berlaku:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {preset.validity}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Kecepatan:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    Upload {uploadSpeed} / Download {downloadSpeed}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Nama profil:</span>
                  <span className="font-mono text-xs text-gray-900 dark:text-gray-100">
                    {profileName}
                  </span>
                </div>
              </div>
            </div>

            {/* Label Paket (bisa diedit) */}
            <div>
              <Label htmlFor="label" className="mb-1.5 block">
                Label Paket
              </Label>
              <Input
                id="label"
                value={label}
                onChange={e => setLabel(e.target.value)}
                disabled={isCreating}
              />
            </div>

            {/* Harga (bisa diedit) */}
            <div>
              <Label htmlFor="price" className="mb-1.5 block">
                Harga (IDR)
              </Label>
              <Input
                id="price"
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                min="0"
                step="100"
                disabled={isCreating}
              />
              {price && !isNaN(parseFloat(price)) && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {new Intl.NumberFormat('id-ID', {
                    style: 'currency',
                    currency: 'IDR',
                    minimumFractionDigits: 0,
                  }).format(parseFloat(price))}
                </p>
              )}
            </div>

            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
              <strong>Catatan:</strong> Profil hotspot dan paket akan dibuat sekaligus. Jika profil
              dengan nama yang sama sudah ada, hanya paket yang akan dibuat.
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Batal
          </Button>
          <Button onClick={handleConfirm} disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Membuat...
              </>
            ) : (
              'Buat Sekarang'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
