/**
 * Voucher plan service
 * CRUD lokal untuk paket voucher
 * Sesuai DEV-SPEC.md §6.4
 */

import { db, type VoucherPlan } from '../../core/db/schema';
import { isValidProfileName, isValidPrice } from '../../core/utils/validation';

// Re-export VoucherPlan type for convenience
export type { VoucherPlan } from '../../core/db/schema';

/**
 * Create plan baru
 */
export async function createPlan(
  label: string,
  profileName: string,
  price: number,
  limitBytesTotal?: number
): Promise<string> {
  // Validasi
  if (!label || label.trim().length === 0) {
    throw new Error('Label tidak boleh kosong');
  }

  if (!isValidProfileName(profileName)) {
    throw new Error('Nama profil tidak valid');
  }

  if (!isValidPrice(price)) {
    throw new Error('Harga tidak valid');
  }

  if (limitBytesTotal !== undefined && limitBytesTotal < 0) {
    throw new Error('Kuota tidak valid');
  }

  const plan: VoucherPlan = {
    id: crypto.randomUUID(),
    label: label.trim(),
    profileName,
    price,
    limitBytesTotal,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await db.plans.add(plan);
  return plan.id!;
}

/**
 * Get plan by ID
 */
export async function getPlan(id: string): Promise<VoucherPlan | null> {
  const plan = await db.plans.get(id);
  return plan ?? null;
}

/**
 * Get all plans
 */
export async function getAllPlans(): Promise<VoucherPlan[]> {
  return db.plans.orderBy('createdAt').reverse().toArray();
}

/**
 * Get plans by profile name
 */
export async function getPlansByProfile(profileName: string): Promise<VoucherPlan[]> {
  return db.plans.where('profileName').equals(profileName).toArray();
}

/**
 * Update plan
 */
export async function updatePlan(
  id: string,
  updates: {
    label?: string;
    profileName?: string;
    price?: number;
    limitBytesTotal?: number;
  }
): Promise<void> {
  const existing = await db.plans.get(id);
  if (!existing) {
    throw new Error('Plan tidak ditemukan');
  }

  // Validasi updates
  if (updates.label !== undefined && updates.label.trim().length === 0) {
    throw new Error('Label tidak boleh kosong');
  }

  if (updates.profileName !== undefined && !isValidProfileName(updates.profileName)) {
    throw new Error('Nama profil tidak valid');
  }

  if (updates.price !== undefined && !isValidPrice(updates.price)) {
    throw new Error('Harga tidak valid');
  }

  if (updates.limitBytesTotal !== undefined && updates.limitBytesTotal < 0) {
    throw new Error('Kuota tidak valid');
  }

  await db.plans.update(id, {
    ...updates,
    updatedAt: Date.now(),
  });
}

/**
 * Delete plan
 */
export async function deletePlan(id: string): Promise<void> {
  // Check apakah ada batch yang menggunakan plan ini
  const batches = await db.batches.where('planId').equals(id).count();
  
  if (batches > 0) {
    throw new Error('Plan tidak bisa dihapus karena masih digunakan oleh batch');
  }

  await db.plans.delete(id);
}

/**
 * Create preset plans untuk quick start
 * Returns array of created plan IDs
 */
export async function createPresetPlans(
  presets: Array<{
    label: string;
    profileName: string;
    price: number;
  }>
): Promise<string[]> {
  const ids: string[] = [];

  for (const preset of presets) {
    const id = await createPlan(preset.label, preset.profileName, preset.price);
    ids.push(id);
  }

  return ids;
}
