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
import { parseRouterDurationToMinutes } from '../../core/utils/validation';
import { buildVoucherComment, parseVoucherComment } from '../setup/router-scripts';
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
});

/**
 * Dilempar jika sebagian user gagal dibuat di router.
 * Voucher yang berhasil tetap disimpan sebagai batch (bisa dicetak).
 */
export class PartialBatchError extends Error {
  readonly batch: VoucherBatch;
  readonly failedCount: number;

  constructor(message: string, batch: VoucherBatch, failedCount: number) {
    super(message);
    this.name = 'PartialBatchError';
    this.batch = batch;
    this.failedCount = failedCount;
  }
}

/**
 * Generate batch voucher dengan multi-paket
 * Satu batch bisa berisi voucher dari beberapa paket berbeda
 */
export async function generateMultiPlanBatch(
  client: RouterClient,
  items: Array<{ planId: string; qty: number }>
): Promise<VoucherBatch> {
  // Validasi input
  const validated = generateBatchSchema.parse({ items });

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

  // Ambil masa berlaku (menit) dari profil di router. Dipakai untuk |v= di comment user,
  // karena vm-cleaner hanya memproses user yang punya |v= dan |u=.
  const routerProfiles = await client.print<{ name: string; 'session-timeout'?: string }>(
    '/ip/hotspot/user/profile'
  );
  const validityByProfile = new Map<string, number | null>();
  for (const rp of routerProfiles) {
    validityByProfile.set(rp.name, parseRouterDurationToMinutes(rp['session-timeout']));
  }
  for (const { plan } of plans) {
    if (!validityByProfile.has(plan.profileName)) {
      throw new Error(`Profil "${plan.profileName}" tidak ditemukan di router`);
    }
  }

  // Get existing users untuk cek duplikat
  const existingUsers = await client.print<HotspotUser>('/ip/hotspot/user');
  const existingUsernames = new Set(existingUsers.map(u => u.name));

  // Generate codes untuk semua paket
  const codes: Array<{ user: string; pass: string; planId: string }> = [];

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

      // Satu kode voucher: password selalu sama dengan username akun itu sendiri
      const password = username;

      codes.push({ user: username, pass: password, planId });
    }
  }

  // Create batch ID
  const batchId = crypto.randomUUID();

  // Create users di router (sequential untuk menghindari race condition)
  const failedUsers: Array<{ code: { user: string; pass: string; planId: string }; error: string }> = [];
  const createdCodes: typeof codes = [];

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
        comment:
          buildVoucherComment(
            batchId,
            planInfo.plan.price,
            validityByProfile.get(planInfo.plan.profileName) ?? null
          ) + `|plan=${code.planId}`,
      };

      // Add limit-bytes-total jika ada
      if (planInfo.plan.limitBytesTotal) {
        body['limit-bytes-total'] = String(planInfo.plan.limitBytesTotal);
      }

      await client.add('/ip/hotspot/user', body);
      createdCodes.push(code);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      failedUsers.push({ code, error: errorMessage });
    }
  }

  // Semua gagal: tidak ada yang perlu disimpan
  if (createdCodes.length === 0) {
    throw new Error(
      `Gagal membuat semua ${codes.length} user. Error pertama: ${failedUsers[0]?.error ?? 'Unknown error'}`
    );
  }

  // Simpan batch HANYA berisi voucher yang benar-benar ada di router,
  // supaya tidak ada user yatim di router tanpa catatan dan batch tetap bisa dicetak.
  const createdByPlan = new Map<string, number>();
  for (const c of createdCodes) {
    createdByPlan.set(c.planId, (createdByPlan.get(c.planId) ?? 0) + 1);
  }
  const batch: VoucherBatch = {
    id: batchId,
    items: [...createdByPlan.entries()].map(([planId, qty]) => ({ planId, qty })),
    createdAt: Date.now(),
    samePassword: true, // selalu user = password; field dipertahankan untuk batch/backup lama
    codes: createdCodes,
  };

  await db.batches.add(batch);

  if (failedUsers.length > 0) {
    throw new PartialBatchError(
      `Gagal membuat ${failedUsers.length} dari ${codes.length} user. ` +
        `${createdCodes.length} voucher berhasil dan tersimpan sebagai batch. ` +
        `Error pertama: ${failedUsers[0].error}`,
      batch,
      failedUsers.length
    );
  }

  return batch;
}

/**
 * Generate batch voucher (legacy - single plan)
 * Dipertahankan untuk backward compatibility
 */
export async function generateBatch(
  client: RouterClient,
  planId: string,
  qty: number
): Promise<VoucherBatch> {
  // Validasi input dengan legacy schema
  const validated = legacyGenerateBatchSchema.parse({ planId, qty });

  // Delegate ke generateMultiPlanBatch
  return generateMultiPlanBatch(
    client,
    [{ planId: validated.planId, qty: validated.qty }]
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

export interface DeleteBatchResult {
  removedFromRouter: number;
  failed: Array<{ user: string; error: string }>;
  removedLocal: boolean;
}

interface ActiveSession {
  '.id': string;
  user: string;
}

/**
 * Putuskan sesi aktif untuk sekumpulan username. Gagal di sini tidak fatal.
 */
async function kickSessions(client: RouterClient, usernames: Set<string>): Promise<void> {
  if (usernames.size === 0) return;
  try {
    const active = await client.print<ActiveSession>('/ip/hotspot/active');
    for (const session of active) {
      if (usernames.has(session.user)) {
        await client.remove('/ip/hotspot/active', session['.id']);
      }
    }
  } catch (error) {
    console.error('Failed to kick active sessions:', error);
  }
}

/**
 * User di router yang benar-benar milik batch ini (nama cocok DAN comment batch cocok),
 * supaya user lain dengan nama sama tidak ikut terhapus.
 */
function findBatchUsers(routerUsers: HotspotUser[], batch: VoucherBatch): HotspotUser[] {
  const names = new Set(batch.codes.map(c => c.user));
  const prefix = `vm|b=${batch.id}`;
  return routerUsers.filter(u => names.has(u.name) && (u.comment ?? '').startsWith(prefix));
}

/**
 * Delete batch beserta user-nya di router.
 * - Dengan client: user dan sesi aktif dihapus dari router. Jika ada yang gagal,
 *   riwayat lokal TIDAK dihapus (agar bisa dicoba lagi) dan daftar gagal dikembalikan.
 * - localOnly = true (atau client null): hanya hapus riwayat lokal, router tidak disentuh.
 */
export async function deleteBatch(
  client: RouterClient | null,
  id: string,
  options: { localOnly?: boolean } = {}
): Promise<DeleteBatchResult> {
  const batch = await db.batches.get(id);
  if (!batch) {
    throw new Error('Batch tidak ditemukan');
  }

  const result: DeleteBatchResult = { removedFromRouter: 0, failed: [], removedLocal: false };

  if (client && !options.localOnly) {
    const routerUsers = await client.print<HotspotUser>('/ip/hotspot/user');
    const batchUsers = findBatchUsers(routerUsers, batch);

    await kickSessions(client, new Set(batchUsers.map(u => u.name)));

    for (const user of batchUsers) {
      try {
        await client.remove('/ip/hotspot/user', user['.id']);
        result.removedFromRouter++;
      } catch (error) {
        result.failed.push({
          user: user.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    if (result.failed.length > 0) {
      return result;
    }
  }

  await db.batches.delete(id);
  result.removedLocal = true;
  return result;
}

/**
 * Hapus satu akun voucher dari batch (router + riwayat lokal).
 * Jika akun terakhir dihapus, batch ikut dihapus.
 */
export async function deleteVoucherAccount(
  client: RouterClient | null,
  batchId: string,
  username: string,
  options: { localOnly?: boolean } = {}
): Promise<{ batchDeleted: boolean }> {
  const batch = await db.batches.get(batchId);
  if (!batch) {
    throw new Error('Batch tidak ditemukan');
  }
  if (!batch.codes.some(c => c.user === username)) {
    throw new Error(`Akun ${username} tidak ada di batch ini`);
  }

  if (client && !options.localOnly) {
    const routerUsers = await client.print<HotspotUser>('/ip/hotspot/user');
    const target = findBatchUsers(routerUsers, batch).find(u => u.name === username);
    if (target) {
      await kickSessions(client, new Set([username]));
      await client.remove('/ip/hotspot/user', target['.id']);
    }
    // Jika tidak ada di router, akun sudah kedaluwarsa/terhapus: cukup bersihkan riwayat.
  }

  const remaining = batch.codes.filter(c => c.user !== username);
  if (remaining.length === 0) {
    await db.batches.delete(batchId);
    return { batchDeleted: true };
  }

  const qtyByPlan = new Map<string, number>();
  for (const c of remaining) {
    qtyByPlan.set(c.planId, (qtyByPlan.get(c.planId) ?? 0) + 1);
  }
  await db.batches.update(batchId, {
    codes: remaining,
    items: [...qtyByPlan.entries()].map(([planId, qty]) => ({ planId, qty })),
  });
  return { batchDeleted: false };
}

export type AccountStatus = 'new' | 'active' | 'expired';

export interface AccountInfo {
  status: AccountStatus;
  usedMinutes?: number;
  validityMinutes?: number;
}

export interface BatchStatusDetail {
  accounts: Record<string, AccountInfo>;
  newCount: number;
  activeCount: number;
  expiredCount: number;
}

/**
 * Klasifikasi tiap akun dalam batch terhadap daftar user di router (fungsi murni).
 * - expired: user sudah tidak ada di router (dibersihkan vm-cleaner/vm-close)
 * - new: ada di router, belum pernah login (belum ada |u=)
 * - active: ada di router dan sudah login
 */
export function classifyBatchAccounts(
  batch: VoucherBatch,
  routerUsers: HotspotUser[]
): BatchStatusDetail {
  const byName = new Map<string, HotspotUser>();
  for (const u of routerUsers) byName.set(u.name, u);

  const detail: BatchStatusDetail = { accounts: {}, newCount: 0, activeCount: 0, expiredCount: 0 };
  const prefix = `vm|b=${batch.id}`;

  for (const code of batch.codes) {
    const rUser = byName.get(code.user);
    const comment = rUser?.comment ?? '';
    if (!rUser || !comment.startsWith(prefix)) {
      detail.accounts[code.user] = { status: 'expired' };
      detail.expiredCount++;
      continue;
    }
    const meta = parseVoucherComment(comment);
    if (!meta.hasStarted) {
      detail.accounts[code.user] = { status: 'new', validityMinutes: meta.validityMinutes };
      detail.newCount++;
    } else {
      detail.accounts[code.user] = {
        status: 'active',
        usedMinutes: meta.usedMinutes,
        validityMinutes: meta.validityMinutes,
      };
      detail.activeCount++;
    }
  }
  return detail;
}

/**
 * Status semua batch dengan SATU kali baca user hotspot dari router.
 * Mengembalikan null jika router tidak bisa dibaca (status tidak diketahui).
 */
export async function getBatchStatusMap(
  client: RouterClient,
  batches: VoucherBatch[]
): Promise<Record<string, BatchStatusDetail> | null> {
  let routerUsers: HotspotUser[];
  try {
    routerUsers = await client.print<HotspotUser>('/ip/hotspot/user');
  } catch {
    return null;
  }
  const map: Record<string, BatchStatusDetail> = {};
  for (const b of batches) {
    if (b.id) map[b.id] = classifyBatchAccounts(b, routerUsers);
  }
  return map;
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

export interface BatchStatusSummary {
  newCount: number;
  activeCount: number;
  expiredCount: number;
  isAllExpired: boolean;
}

/**
 * Cek status voucher dalam batch terhadap router
 * Status:
 * - Baru: user masih ada di router dan belum login (tidak ada |u= di comment)
 *   // TODO (KEPUTUSAN TERBARU §10): masa berlaku voucher yang belum pernah login (sementara: tidak kedaluwarsa)
 * - Aktif: user ada di router, sudah login (|u= ada) dan sisa waktu masih ada
 * - Kedaluwarsa: user sudah terhapus dari router (dibersihkan vm-cleaner/vm-close) ATAU jatah waktunya habis
 */
export async function checkBatchStatus(
  client: RouterClient,
  batch: VoucherBatch
): Promise<BatchStatusSummary> {
  let routerUsers: HotspotUser[];
  try {
    routerUsers = await client.print<HotspotUser>('/ip/hotspot/user');
  } catch {
    // Jika router tidak bisa diakses, kembalikan default
    return {
      newCount: batch.codes.length,
      activeCount: 0,
      expiredCount: 0,
      isAllExpired: false,
    };
  }

  const routerUserMap = new Map<string, HotspotUser>();
  for (const u of routerUsers) {
    routerUserMap.set(u.name, u);
  }

  let newCount = 0;
  let activeCount = 0;
  let expiredCount = 0;

  for (const code of batch.codes) {
    const rUser = routerUserMap.get(code.user);
    if (!rUser) {
      // User sudah terhapus dari router (artinya sudah pernah login dan habis masa berlakunya)
      expiredCount++;
    } else {
      const c = rUser.comment || '';
      if (!c.includes('|u=')) {
        // Belum pernah login
        newCount++;
      } else {
        // Sudah login
        activeCount++;
      }
    }
  }

  const isAllExpired = batch.codes.length > 0 && expiredCount === batch.codes.length;

  return {
    newCount,
    activeCount,
    expiredCount,
    isAllExpired,
  };
}

/**
 * Hapus batch yang seluruh vouchernya sudah kedaluwarsa (KEPUTUSAN TERBARU §9)
 * Hanya batch yang seluruh vouchernya sudah expired yang akan dihapus.
 */
export async function deleteExpiredBatches(
  client: RouterClient
): Promise<{ deletedBatchesCount: number; deletedVouchersCount: number }> {
  const allBatches = await db.batches.toArray();
  let deletedBatchesCount = 0;
  let deletedVouchersCount = 0;

  let routerUsers: HotspotUser[];
  try {
    routerUsers = await client.print<HotspotUser>('/ip/hotspot/user');
  } catch {
    // Jika tidak dapat membaca router, jangan hapus apa pun demi keamanan
    return { deletedBatchesCount: 0, deletedVouchersCount: 0 };
  }

  const routerUserMap = new Map<string, HotspotUser>();
  for (const u of routerUsers) {
    routerUserMap.set(u.name, u);
  }

  for (const batch of allBatches) {
    if (!batch.codes || batch.codes.length === 0) continue;

    let expiredCount = 0;
    for (const code of batch.codes) {
      const rUser = routerUserMap.get(code.user);
      if (!rUser) {
        expiredCount++;
      }
    }

    // Hanya jika SELURUH voucher dalam batch sudah kedaluwarsa
    if (expiredCount === batch.codes.length) {
      // Hapus sisa user/scheduler di router jika masih ada
      for (const code of batch.codes) {
        const rUser = routerUserMap.get(code.user);
        if (rUser && rUser['.id']) {
          try {
            await client.remove('/ip/hotspot/user', rUser['.id']);
          } catch {
            // Ignore
          }
        }
      }

      if (batch.id) {
        await db.batches.delete(batch.id);
      }
      deletedBatchesCount++;
      deletedVouchersCount += batch.codes.length;
    }
  }

  return { deletedBatchesCount, deletedVouchersCount };
}

