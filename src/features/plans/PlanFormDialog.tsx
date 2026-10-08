/**
 * Dialog form untuk buat/edit paket voucher
 * Sesuai DESIGN.md §4.4
 */

import { useState, useEffect } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
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
import type { VoucherPlan } from '../../core/db/schema';

interface PlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: VoucherPlan; // Jika ada, mode edit
  profiles: Array<{ name: string; rateLimit?: string; validity?: string }>; // Profil dari router
  onSave: (data: {
    label: string;
    profileName: string;
    price: number;
    limitBytesTotal?: number;
  }) => Promise<void>;
}

export function PlanFormDialog({
  open,
  onOpenChange,
  plan,
  profiles,
  onSave,
}: PlanFormDialogProps) {
  const [label, setLabel] = useState('');
  const [profileName, setProfileName] = useState('');
  const [price, setPrice] = useState('');
  const [limitBytesTotal, setLimitBytesTotal] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!plan;

  // Initialize form dari plan yang ada
  useEffect(() => {
    if (plan) {
      setLabel(plan.label);
      setProfileName(plan.profileName);
      setPrice(plan.price.toString());
      setLimitBytesTotal(plan.limitBytesTotal ? plan.limitBytesTotal.toString() : '');
    } else {
      // Reset form untuk mode create
      setLabel('');
      setProfileName('');
      setPrice('');
      setLimitBytesTotal('');
    }
    setError(null);
  }, [plan, open]);

  const handleSave = async () => {
    setError(null);

    // Validasi
    if (!label.trim()) {
      setError('Label tidak boleh kosong');
      return;
    }

    if (!profileName) {
      setError('Profil harus dipilih');
      return;
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      setError('Harga harus angka positif');
      return;
    }

    const limitNum = limitBytesTotal ? parseInt(limitBytesTotal, 10) : undefined;
    if (limitBytesTotal && (isNaN(limitNum!) || limitNum! < 0)) {
      setError('Kuota harus angka positif atau kosong');
      return;
    }

    setIsSaving(true);

    try {
      await onSave({
        label: label.trim(),
        profileName,
        price: priceNum,
        limitBytesTotal: limitNum,
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

  const selectedProfile = profiles.find(p => p.name === profileName);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader onClose={handleClose}>
          <DialogTitle>{isEdit ? 'Ubah Paket' : 'Buat Paket'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Perbarui informasi paket voucher'
              : 'Buat paket baru dengan harga dan profil tertentu'}
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
            {/* Label Paket */}
            <div>
              <Label htmlFor="label" className="mb-1.5 block">
                Label Paket <span className="text-red-500">*</span>
              </Label>
              <Input
                id="label"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Contoh: Paket 1 Hari"
                disabled={isSaving}
              />
              <p className="text-xs text-gray-500 mt-1">
                Nama paket yang akan ditampilkan ke pengguna
              </p>
            </div>

            {/* Pilih Profil */}
            <div>
              <Label htmlFor="profile" className="mb-1.5 block">
                Profil Hotspot <span className="text-red-500">*</span>
              </Label>
              <select
                id="profile"
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                disabled={isSaving}
                className="w-full px-3 py-2 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-600"
              >
                <option value="">-- Pilih Profil --</option>
                {profiles.map(p => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
              {selectedProfile && (
                <div className="mt-2 p-2 rounded bg-gray-50 dark:bg-gray-900 text-xs text-gray-600 dark:text-gray-400">
                  {selectedProfile.rateLimit && (
                    <div>Kecepatan: {selectedProfile.rateLimit}</div>
                  )}
                  {selectedProfile.validity && (
                    <div>Masa berlaku: {selectedProfile.validity}</div>
                  )}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Speed dan masa berlaku diambil dari profil
              </p>
            </div>

            {/* Harga */}
            <div>
              <Label htmlFor="price" className="mb-1.5 block">
                Harga (IDR) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="price"
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="5000"
                min="0"
                step="100"
                disabled={isSaving}
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

            {/* Kuota (Opsional) */}
            <div>
              <Label htmlFor="limit" className="mb-1.5 block">
                Kuota Total (bytes) <span className="text-gray-500 text-xs">(opsional)</span>
              </Label>
              <Input
                id="limit"
                type="number"
                value={limitBytesTotal}
                onChange={e => setLimitBytesTotal(e.target.value)}
                placeholder="Kosongkan jika tanpa batas"
                min="0"
                disabled={isSaving}
              />
              <p className="text-xs text-gray-500 mt-1">
                Total byte yang bisa digunakan (download + upload). Kosongkan untuk unlimited.
              </p>
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
