/**
 * Voucher service
 * Generate batch voucher dengan validasi ketat
 * Sesuai DEV-SPEC.md §6.5
 */

import { z } from 'zod';
import { db, type VoucherBatch } from '../../core/db/schema';
import type { RouterClient } from '../../core/router/client';
import type { HotspotUser } from '../../core/router/types';
import { generateCode } from '../../core/utils/random-code';
import { getPlan } from '../plans/plan-service';
import { MAX_VOUCHERS_PER_BATCH } from '../../core/constants';

// Re-export VoucherBatch type for convenience
export type { VoucherBatch } from '../../core/db/schema';

/**
 * Schema validasi untuk generate batch
 * Update: mendukung multi-paket
 */
const generateBatchSchema = z.object({
  items: z.array(
    z.object({
      planId: z.string().min(1, 'Plan ID tidak boleh kosong'),
      qty: z.number().int('Jumlah harus bilangan bulat').min(1, 'Minimal 1 voucher per paket'),
    })
  ).min(1, 'Minimal 1 paket'),
  samePassword: z.boolean(),
}).refine(
  (data) => {
    const totalQty = data.items.reduce((sum, item) => sum + item.qty, 0);
    return totalQty >= 1 && totalQty <= MAX_VOUCHERS_PER_BATCH;
  },
  {
    message: `Total voucher harus antara 1 dan ${MAX_VOUCHERS_PER_BATCH}`,
  }
);

// Legacy schema untuk backward compatibility
const legacyGenerateBatchSchema = z.object({
  planId: z.string().min(1, 'Plan ID tidak boleh kosong'),
  qty: z
    .number()
    .int('Jumlah harus bilangan bulat')
    .min(1, 'Minimal 1 voucher')
    .max(MAX_VOUCHERS_PER_BATCH, `Maksimal ${MAX_VOUCHERS_PER_BATCH} voucher per batch`),
  samePassword: z.boolean(),
});

/**
 * Generate batch voucher dengan multi-paket
 * Satu batch bisa berisi voucher dari beberapa paket berbeda
 */
export async function generateMultiPlanBatch(
  client: RouterClient,
  items: Array<{ planId: string; qty: number }>,
  samePassword: boolean
): Promise<VoucherBatch> {
  // Validasi input
  const validated = generateBatchSchema.parse({ items, samePassword });

  // Get all plans dan validasi
  const plans = await Promise.all(
    validated.items.map(async item => {
      const plan = await getPlan(item.planId);
      if (!plan) {
        throw new Error(`Plan dengan ID ${item.planId} tidak ditemukan`);
      }
      return { ...item, plan };
    })
  );

  // Get existing users untuk cek duplikat
  const existingUsers = await client.print<HotspotUser>('/ip/hotspot/user');
  const existingUsernames = new Set(existingUsers.map(u => u.name));

  // Generate codes untuk semua paket
  const codes: Array<{ user: string; pass: string; planId: string }> = [];
  const sharedPassword = samePassword ? generateCode() : '';

  // Generate codes per paket
  for (const { planId, qty } of validated.items) {
    for (let i = 0; i < qty; i++) {
      let username = '';
      let attempts = 0;
      const maxAttempts = 20;

      // Generate username yang unique
      do {
        username = generateCode();
        attempts++;
        
        if (attempts > maxAttempts) {
          throw new Error(
            'Gagal generate username unik setelah ' + maxAttempts + ' percobaan. Coba lagi.'
          );
        }
      } while (
        existingUsernames.has(username) ||
        codes.some(c => c.user === username)
      );

      const password = samePassword ? sharedPassword : generateCode();

      codes.push({ user: username, pass: password, planId });
    }
  }

  // Create batch ID
  const batchId = crypto.randomUUID();

  // Create users di router (sequential untuk menghindari race condition)
  const failedUsers: Array<{ code: { user: string; pass: string; planId: string }; error: string }> = [];

  for (const code of codes) {
    try {
      const planInfo = plans.find(p => p.planId === code.planId);
      if (!planInfo) {
        throw new Error(`Plan info untuk ${code.planId} tidak ditemukan`);
      }

      const body: Record<string, string> = {
        name: code.user,
        password: code.pass,
        profile: planInfo.plan.profileName,
        comment: `vm|b=${batchId}|p=${planInfo.plan.price}|plan=${code.planId}`,
      };

      // Add limit-bytes-total jika ada
      if (planInfo.plan.limitBytesTotal) {
        body['limit-bytes-total'] = String(planInfo.plan.limitBytesTotal);
      }

      await client.add('/ip/hotspot/user', body);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      failedUsers.push({ code, error: errorMessage });
    }
  }

  // Jika ada yang gagal, throw error dengan detail
  if (failedUsers.length > 0) {
    const failedCount = failedUsers.length;
    const successCount = codes.length - failedCount;
    
    throw new Error(
      `Gagal membuat ${failedCount} dari ${codes.length} user. ` +
      `Berhasil: ${successCount}. ` +
      `Error pertama: ${failedUsers[0].error}`
    );
  }

  // Save batch ke Dexie
  const batch: VoucherBatch = {
    id: batchId,
    items: validated.items,
    createdAt: Date.now(),
    samePassword: validated.samePassword,
    codes,
  };

  await db.batches.add(batch);

  return batch;
}

/**
 * Generate batch voucher (legacy - single plan)
 * Dipertahankan untuk backward compatibility
 */
export async function generateBatch(
  client: RouterClient,
  planId: string,
  qty: number,
  samePassword: boolean
): Promise<VoucherBatch> {
  // Validasi input dengan legacy schema
  const validated = legacyGenerateBatchSchema.parse({ planId, qty, samePassword });

  // Delegate ke generateMultiPlanBatch
  return generateMultiPlanBatch(
    client,
    [{ planId: validated.planId, qty: validated.qty }],
    validated.samePassword
  );
}

/**
 * Get batch by ID
 */
export async function getBatch(id: string): Promise<VoucherBatch | null> {
  const batch = await db.batches.get(id);
  return batch ?? null;
}

/**
 * Get all batches
 */
export async function getAllBatches(): Promise<VoucherBatch[]> {
  return db.batches.orderBy('createdAt').reverse().toArray();
}

/**
 * Get batches by plan
 * Update: mendukung multi-paket
 */
export async function getBatchesByPlan(planId: string): Promise<VoucherBatch[]> {
  const allBatches = await db.batches.toArray();
  
  // Filter batches yang mengandung planId (baik di items maupun legacy planId field)
  return allBatches.filter(batch => {
    // Check legacy planId field
    if (batch.planId === planId) return true;
    
    // Check items array
    if (batch.items && batch.items.some(item => item.planId === planId)) return true;
    
    return false;
  });
}

/**
 * Mark batch as printed
 */
export async function markBatchAsPrinted(id: string): Promise<void> {
  const batch = await db.batches.get(id);
  if (!batch) {
    throw new Error('Batch tidak ditemukan');
  }

  await db.batches.update(id, {
    printedAt: Date.now(),
  });
}

/**
 * Delete batch dan semua user terkait di router
 */
export async function deleteBatch(
  client: RouterClient,
  id: string
): Promise<void> {
  const batch = await db.batches.get(id);
  if (!batch) {
    throw new Error('Batch tidak ditemukan');
  }

  // Get users dari router dengan comment yang match batch ID
  const users = await client.print<HotspotUser>('/ip/hotspot/user');
  const batchUsers = users.filter(u => 
    u.comment?.includes(`vm|b=${id}`)
  );

  // Delete users dari router
  for (const user of batchUsers) {
    try {
      await client.remove('/ip/hotspot/user', user['.id']);
      
      // Also remove scheduler if exists
      const schedulerName = `vm-${user.name}`;
      const schedulers = await client.print<{ '.id': string; name: string }>(
        '/system/scheduler',
        { name: schedulerName }
      );
      
      if (schedulers.length > 0) {
        await client.remove('/system/scheduler', schedulers[0]['.id']);
      }
    } catch (error) {
      console.error(`Failed to delete user ${user.name}:`, error);
      // Continue deleting other users
    }
  }

  // Delete batch dari Dexie
  await db.batches.delete(id);
}

/**
 * Get voucher statistics
 * Update: mendukung multi-paket
 */
export async function getVoucherStats(): Promise<{
  totalBatches: number;
  totalVouchers: number;
  printedBatches: number;
  unprintedBatches: number;
}> {
  const batches = await db.batches.toArray();
  
  const totalBatches = batches.length;
  
  // Calculate total vouchers from codes array (lebih akurat)
  const totalVouchers = batches.reduce((sum, b) => sum + (b.codes?.length || 0), 0);
  
  const printedBatches = batches.filter(b => b.printedAt).length;
  const unprintedBatches = batches.filter(b => !b.printedAt).length;

  return {
    totalBatches,
    totalVouchers,
    printedBatches,
    unprintedBatches,
  };
}

/**
 * Recover batches dari router
 * Berguna jika IndexedDB hilang tapi user masih ada di router
 * Update: mendukung multi-paket
 */
export async function recoverBatchesFromRouter(
  client: RouterClient
): Promise<VoucherBatch[]> {
  const users = await client.print<HotspotUser>('/ip/hotspot/user');
  
  // Filter users dengan comment vm|b=...
  const voucherUsers = users.filter(u => u.comment?.startsWith('vm|b='));
  
  // Group by batch ID
  const batchMap = new Map<string, HotspotUser[]>();
  
  for (const user of voucherUsers) {
    const match = user.comment?.match(/vm\|b=([^|]+)/);
    if (match) {
      const batchId = match[1];
      if (!batchMap.has(batchId)) {
        batchMap.set(batchId, []);
      }
      batchMap.get(batchId)!.push(user);
    }
  }

  // Create batch objects
  const recoveredBatches: VoucherBatch[] = [];

  for (const [batchId, users] of batchMap.entries()) {
    // Coba extract planId dari comment
    const planIds = new Set<string>();
    const codes: Array<{ user: string; pass: string; planId: string }> = [];
    
    for (const user of users) {
      const planMatch = user.comment?.match(/\|plan=([^|]+)/);
      const planId = planMatch ? planMatch[1] : '';
      
      if (planId) {
        planIds.add(planId);
      }
      
      codes.push({
        user: user.name,
        pass: user.password,
        planId: planId || 'unknown',
      });
    }

    // Build items array
    const items: Array<{ planId: string; qty: number }> = [];
    for (const planId of planIds) {
      const qty = codes.filter(c => c.planId === planId).length;
      items.push({ planId, qty });
    }

    const batch: VoucherBatch = {
      id: batchId,
      items: items.length > 0 ? items : [{ planId: '', qty: users.length }],
      createdAt: Date.now(), // Unknown
      samePassword: false, // Unknown
      codes,
    };

    recoveredBatches.push(batch);
    
    // Save to Dexie
    await db.batches.add(batch);
  }

  return recoveredBatches;
}
