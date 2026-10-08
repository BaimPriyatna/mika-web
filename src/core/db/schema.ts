/**
 * Dexie database schema
 * Sesuai DEV-SPEC.md §8
 */

import Dexie, { type Table } from 'dexie';

/**
 * Router configuration dengan kredensial terenkripsi
 */
export interface RouterConfigDB {
  id?: number;
  name: string;
  host: string;
  port: number;
  scheme: 'http' | 'https';
  encryptedCredentials: string; // JSON.stringify({username, password})
  iv: string;
  salt: string;
  allowSelfSigned?: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Voucher plan (paket) - stored locally
 */
export interface VoucherPlan {
  id?: string; // UUID
  label: string;
  profileName: string; // Reference ke HotspotProfile.name di router
  price: number;
  limitBytesTotal?: number; // Kuota opsional
  createdAt: number;
  updatedAt: number;
}

/**
 * Voucher batch - hasil generate
 * Update: mendukung multi-paket dalam satu batch
 */
export interface VoucherBatch {
  id?: string; // UUID
  planId?: string; // Legacy: Reference ke VoucherPlan.id (deprecated, use items)
  qty?: number; // Legacy: total quantity (deprecated, use items)
  items: Array<{
    planId: string; // Reference ke VoucherPlan.id
    qty: number; // Jumlah voucher untuk paket ini
  }>; // Array item paket dengan quantity masing-masing
  createdAt: number;
  printedAt?: number;
  samePassword: boolean;
  codes: Array<{
    user: string;
    pass: string;
    planId: string; // Tambahan: untuk tahu voucher ini pakai paket apa
  }>;
}

/**
 * App settings - key-value store
 */
export interface AppSettings {
  key: string;
  value: string;
}

/**
 * Dexie database class
 */
class MikaDatabase extends Dexie {
  router!: Table<RouterConfigDB, number>;
  plans!: Table<VoucherPlan, string>;
  batches!: Table<VoucherBatch, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super('MikaDB');
    
    // Version 1: Initial schema
    this.version(1).stores({
      router: '++id, host, updatedAt',
      plans: 'id, profileName, createdAt',
      batches: 'id, planId, createdAt, printedAt',
      settings: 'key',
    });

    // Version 2: Multi-paket support untuk VoucherBatch
    this.version(2).stores({
      router: '++id, host, updatedAt',
      plans: 'id, profileName, createdAt',
      batches: 'id, createdAt, printedAt', // Remove planId index karena sekarang array
      settings: 'key',
    }).upgrade(trans => {
      // Migrasi data lama ke format baru
      return trans.table('batches').toCollection().modify((batch: any) => {
        // Jika batch lama (punya planId tunggal), convert ke format baru
        if (batch.planId && !batch.items) {
          batch.items = [{
            planId: batch.planId,
            qty: batch.qty || batch.codes?.length || 0,
          }];
          
          // Update codes untuk include planId
          if (batch.codes && Array.isArray(batch.codes)) {
            batch.codes = batch.codes.map((code: any) => ({
              user: code.user,
              pass: code.pass,
              planId: batch.planId, // Assign planId ke semua codes
            }));
          }
        }
      });
    });
  }
}

// Singleton instance
export const db = new MikaDatabase();

/**
 * Settings keys constants
 */
export const SETTINGS_KEYS = {
  MARGIN_Y: 'pdf.marginY',
  OFFSET_X: 'pdf.offsetX',
  OFFSET_Y: 'pdf.offsetY',
  HOTSPOT_NAME: 'hotspot.name',
  HOTSPOT_LOGO: 'hotspot.logo',
  LOGIN_URL: 'hotspot.loginUrl',
  THEME: 'app.theme',
  PASSPHRASE: 'app.passphrase', // In-memory only, never persisted
} as const;

/**
 * Helper functions untuk settings
 */
export async function getSetting(key: string, defaultValue?: string): Promise<string | null> {
  const setting = await db.settings.get(key);
  return setting?.value ?? defaultValue ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}

export async function deleteSetting(key: string): Promise<void> {
  await db.settings.delete(key);
}

/**
 * Helper untuk get setting sebagai number
 */
export async function getSettingNumber(key: string, defaultValue: number): Promise<number> {
  const value = await getSetting(key);
  if (!value) return defaultValue;
  const num = parseFloat(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Helper untuk get setting sebagai boolean
 */
export async function getSettingBoolean(key: string, defaultValue: boolean): Promise<boolean> {
  const value = await getSetting(key);
  if (!value) return defaultValue;
  return value === 'true';
}
