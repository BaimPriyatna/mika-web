/**
 * Kartu paket voucher
 * Sesuai DESIGN.md §4.4
 */

import { Clock, Edit2, Package, Trash2, Zap } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import type { VoucherPlan } from '../../core/db/schema';

interface PlanCardProps {
  plan: VoucherPlan;
  profile?: {
    name: string;
    rateLimit?: string;
    validity?: string;
  } | null;
  voucherCount?: number;
  onEdit: () => void;
  onDelete: () => void;
}

export function PlanCard({
  plan,
  profile,
  voucherCount = 0,
  onEdit,
  onDelete,
}: PlanCardProps) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatSpeed = (rateLimit?: string) => {
    if (!rateLimit) return null;
    // rateLimit format: "rx/tx" (contoh: "1M/2M")
    const parts = rateLimit.split('/');
    if (parts.length === 2) {
      return `↑${parts[0]} ↓${parts[1]}`;
    }
    return rateLimit;
  };

  const formatValidity = (validity?: string) => {
    if (!validity) return 'Tidak terbatas';
    // Konversi format RouterOS ke bahasa
    const match = validity.match(/^(\d+)([smhdw])$/);
    if (!match) return validity;

    const [, num, unit] = match;
    const units: Record<string, string> = {
      s: 'detik',
      m: 'menit',
      h: 'jam',
      d: 'hari',
      w: 'minggu',
    };

    return `${num} ${units[unit] || unit}`;
  };

  const profileMissing = !profile;

  return (
    <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
            {plan.label}
          </h3>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400">
            {formatPrice(plan.price)}
          </p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-900 rounded transition-colors"
            title="Ubah paket"
          >
            <Edit2 className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-900 rounded transition-colors"
            title="Hapus paket"
          >
            <Trash2 className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        {profileMissing ? (
          <Badge variant="destructive" className="mb-2">
            Profil hilang
          </Badge>
        ) : (
          <>
            {profile?.rateLimit && (
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <Zap className="w-4 h-4" />
                <span>{formatSpeed(profile.rateLimit)}</span>
              </div>
            )}
            {profile?.validity && (
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <Clock className="w-4 h-4" />
                <span>{formatValidity(profile.validity)}</span>
              </div>
            )}
          </>
        )}

        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
          <span className="text-gray-500 flex items-center gap-1.5">
            <Package className="w-4 h-4" />
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {voucherCount}
            </span>{' '}
            voucher tersedia
          </span>
        </div>

        <div className="text-xs text-gray-400 mt-1">
          Profil: <span className="font-mono">{plan.profileName}</span>
        </div>
      </div>
    </div>
  );
}
