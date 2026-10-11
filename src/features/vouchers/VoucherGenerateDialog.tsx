/**
 * Voucher Generate Dialog - 2 step wizard
 * Update: mendukung multi-paket dalam satu batch
 * Sesuai DESIGN.md §4.5
 */

import { useState, useMemo } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, Lock, Plus, Minus, X } from 'lucide-react';
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
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Progress } from '../../components/ui/progress';
import { MAX_VOUCHERS_PER_BATCH } from '../../core/constants';
import { generateCode } from '../../core/utils/random-code';
import type { VoucherPlan } from '../../core/db/schema';

interface VoucherGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: VoucherPlan[];
  onGenerate: (items: Array<{ planId: string; qty: number }>) => Promise<void>;
  onSuccess?: (batchId: string) => void; // For future use
}

type Step = 1 | 2;

interface PlanItem {
  planId: string;
  qty: number;
}

export function VoucherGenerateDialog({
  open,
  onOpenChange,
  plans,
  onGenerate,
}: VoucherGenerateDialogProps) {
  const [step, setStep] = useState<Step>(1);
  const [items, setItems] = useState<PlanItem[]>([{ planId: '', qty: 8 }]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sample codes untuk preview
  const sampleCodes = useMemo(() => {
    return [generateCode(), generateCode(), generateCode()];
  }, [open]); // Regenerate saat dialog dibuka

  // Total voucher dari semua item
  const totalQty = items.reduce((sum, item) => sum + (item.qty || 0), 0);
  const remainingSlots = MAX_VOUCHERS_PER_BATCH - totalQty;
  // Baris pertama default 8 voucher memenuhi batch, jadi sisa slot 0 tidak boleh menghalangi
  // penambahan paket lain: slot diambil dari baris dengan jumlah terbanyak saat menambah.
  const canAddMore =
    items.length < plans.length && items.length < MAX_VOUCHERS_PER_BATCH;

  // Cek apakah semua item sudah valid
  const allItemsValid = items.every(item => item.planId && item.qty >= 1);

  // Hitung total nilai
  const totalValue = items.reduce((sum, item) => {
    const plan = plans.find(p => p.id === item.planId);
    return sum + (plan ? plan.price * item.qty : 0);
  }, 0);

  const handleAddItem = () => {
    if (!canAddMore) return;
    const next = items.map(item => ({ ...item }));
    if (remainingSlots <= 0) {
      // Ambil 1 slot dari baris yang jumlahnya paling banyak (minimal tersisa 1)
      let donor = -1;
      next.forEach((item, i) => {
        if (item.qty > 1 && (donor === -1 || item.qty > next[donor].qty)) donor = i;
      });
      if (donor === -1) return; // semua baris sudah 1 voucher
      next[donor].qty -= 1;
    }
    setItems([...next, { planId: '', qty: 1 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemPlanChange = (index: number, planId: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], planId };
    setItems(newItems);
  };

  const handleItemQtyChange = (index: number, qty: number) => {
    // Hitung sisa slot dari item lain
    const otherItemsQty = items.reduce((sum, item, i) =>
      i === index ? sum : sum + item.qty, 0
    );
    const maxForThisItem = MAX_VOUCHERS_PER_BATCH - otherItemsQty;
    const clampedQty = Math.max(1, Math.min(qty, maxForThisItem));

    const newItems = [...items];
    newItems[index] = { ...newItems[index], qty: clampedQty };
    setItems(newItems);
  };

  const incrementItemQty = (index: number) => {
    const currentItem = items[index];
    handleItemQtyChange(index, currentItem.qty + 1);
  };

  const decrementItemQty = (index: number) => {
    const currentItem = items[index];
    handleItemQtyChange(index, currentItem.qty - 1);
  };

  const handleNext = () => {
    if (step === 1 && allItemsValid && totalQty >= 1) {
      setStep(2);
      setError(null);
    }
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      setError(null);
    }
  };

  const handleGenerate = async () => {
    if (!allItemsValid) return;

    setIsGenerating(true);
    setError(null);

    try {
      await onGenerate(items);
      // Success - close dialog
      onOpenChange(false);
      // Reset state
      setStep(1);
      setItems([{ planId: '', qty: 8 }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    if (!isGenerating) {
      onOpenChange(false);
      // Reset after close animation
      setTimeout(() => {
        setStep(1);
        setItems([{ planId: '', qty: 8 }]);
          setError(null);
      }, 200);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(price);
  };

  // Daftar plan yang belum dipilih (untuk dropdown)
  const getAvailablePlans = (currentIndex: number) => {
    const selectedPlanIds = items
      .filter((_, i) => i !== currentIndex)
      .map(item => item.planId)
      .filter(Boolean);

    return plans.filter(p => !selectedPlanIds.includes(p.id!));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader onClose={handleClose}>
          <DialogTitle>Buat Batch Voucher</DialogTitle>
          <DialogDescription>
            {step === 1 ? 'Pilih paket dan jumlah voucher' : 'Konfirmasi pembuatan batch'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
              step >= 1 ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}>
              1
            </div>
            <div className={`flex-1 h-0.5 ${
              step >= 2 ? 'bg-green-600' : 'bg-gray-200 dark:bg-gray-800'
            }`} />
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
              step >= 2 ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}>
              2
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* Step 1: Pilih paket & jumlah */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Daftar Paket & Jumlah */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Pilih Paket & Jumlah</Label>
                  <Badge variant={totalQty > MAX_VOUCHERS_PER_BATCH ? 'destructive' : 'secondary'}>
                    {totalQty}/{MAX_VOUCHERS_PER_BATCH} voucher
                  </Badge>
                </div>

                {plans.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-500">
                    Belum ada paket. Buat paket terlebih dahulu di menu Paket.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((item, index) => {
                      const plan = plans.find(p => p.id === item.planId);
                      const available = getAvailablePlans(index);
                      // Include current selection in available list
                      const allOptions = item.planId
                        ? [...available, plan!].filter(Boolean).sort((a, b) =>
                            (a?.label || '').localeCompare(b?.label || '')
                          )
                        : available;

                      return (
                        <div
                          key={index}
                          className="p-4 rounded-lg border-2 border-gray-200 dark:border-gray-800 space-y-3"
                        >
                          {/* Header baris: dropdown paket + tombol hapus */}
                          <div className="flex items-center gap-2">
                            <select
                              value={item.planId}
                              onChange={e => handleItemPlanChange(index, e.target.value)}
                              className="flex-1 px-3 py-2 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-600"
                            >
                              <option value="">-- Pilih Paket --</option>
                              {allOptions.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.label} ({formatPrice(p.price)})
                                </option>
                              ))}
                            </select>
                            {items.length > 1 && (
                              <button
                                onClick={() => handleRemoveItem(index)}
                                className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-900 text-gray-500 transition-colors flex-shrink-0"
                                title="Hapus paket ini"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Stepper jumlah untuk item ini */}
                          <div className="flex items-center gap-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => decrementItemQty(index)}
                              disabled={item.qty <= 1}
                            >
                              <Minus className="w-4 h-4" />
                            </Button>
                            <div className="flex-1 text-center">
                              <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                                {item.qty}
                              </div>
                              <div className="text-xs text-gray-600 dark:text-gray-400">
                                voucher
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => incrementItemQty(index)}
                              disabled={remainingSlots <= 0 && item.qty >= remainingSlots + item.qty}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>

                          {/* Subtotal per item */}
                          {plan && (
                            <div className="flex justify-between text-sm pt-2 border-t border-gray-100 dark:border-gray-900">
                              <span className="text-gray-500">
                                {formatPrice(plan.price)} × {item.qty}
                              </span>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {formatPrice(plan.price * item.qty)}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Tombol tambah paket */}
                    {canAddMore && (
                      <button
                        onClick={handleAddItem}
                        className="w-full p-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-green-600 hover:bg-green-50 dark:hover:bg-green-900/10 text-sm text-gray-600 dark:text-gray-400 hover:text-green-600 transition-all flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Tambah Paket Lain
                      </button>
                    )}

                    <p className="text-xs text-gray-500 text-center">
                      Maksimal {MAX_VOUCHERS_PER_BATCH} voucher per batch (1 halaman A4).
                      Satu batch boleh berisi beberapa jenis paket: klik &quot;Tambah Paket Lain&quot;,
                      jumlah dibagi dari total {MAX_VOUCHERS_PER_BATCH}.
                      Butuh lebih banyak? Generate lagi setelah selesai.
                    </p>
                  </div>
                )}
              </div>

              {/* Format Kode (Locked) */}
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <div className="flex items-center gap-2 mb-3">
                  <Lock className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Format Kode Terkunci
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  6 karakter, huruf besar + angka (tanpa O, I, L, 0, 1)
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Satu kode dipakai sebagai username sekaligus password.
                </p>
                <div className="flex gap-2">
                  <span className="text-xs text-gray-500">Contoh:</span>
                  <div className="flex gap-2 font-mono text-sm">
                    {sampleCodes.map((code, i) => (
                      <Badge key={i} variant="secondary">{code}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Konfirmasi */}
          {step === 2 && allItemsValid && (
            <div className="space-y-6">
              <div className="p-6 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-4">
                  Ringkasan Batch
                </h3>
                <div className="space-y-4">
                  {/* Daftar paket dalam batch */}
                  <div className="space-y-2">
                    {items.map((item, index) => {
                      const plan = plans.find(p => p.id === item.planId);
                      if (!plan) return null;
                      return (
                        <div key={index} className="flex justify-between text-sm items-center pb-2 border-b border-gray-100 dark:border-gray-900 last:border-0">
                          <div>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {plan.label}
                            </span>
                            <span className="text-gray-500 ml-2">
                              {formatPrice(plan.price)} × {item.qty}
                            </span>
                          </div>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {formatPrice(plan.price * item.qty)}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Total voucher & mode */}
                  <div className="flex justify-between text-sm pt-2">
                    <span className="text-gray-600 dark:text-gray-400">Total voucher</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {totalQty} voucher ({items.length} paket)
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Kode voucher</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Username = Password
                    </span>
                  </div>
                  <div className="pt-3 border-t border-gray-200 dark:border-gray-800">
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        Total Nilai
                      </span>
                      <span className="text-xl font-bold text-green-600">
                        {formatPrice(totalValue)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Daftar profil yang akan dibuat */}
              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>Catatan:</strong> Voucher akan langsung dibuat sebagai hotspot user di router Anda.
                  Pastikan router terhubung dan profil berikut tersedia:
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {items.map((item, index) => {
                    const plan = plans.find(p => p.id === item.planId);
                    if (!plan) return null;
                    return (
                      <Badge key={index} variant="secondary">
                        {plan.profileName}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              {isGenerating && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      Membuat voucher...
                    </span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Harap tunggu
                    </span>
                  </div>
                  <Progress value={50} className="h-2" />
                </div>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isGenerating}>
                Batal
              </Button>
              <Button
                onClick={handleNext}
                disabled={!allItemsValid || plans.length === 0 || totalQty < 1 || totalQty > MAX_VOUCHERS_PER_BATCH || isGenerating}
              >
                Lanjut
                <ChevronRight className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleBack} disabled={isGenerating}>
                <ChevronLeft className="w-4 h-4" />
                Kembali
              </Button>
              <Button onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Membuat...
                  </>
                ) : (
                  <>
                    Buat & Pratinjau Cetak
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
