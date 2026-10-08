/**
 * Router config service dengan enkripsi
 * CRUD untuk konfigurasi router
 * Sesuai DEV-SPEC.md §6.1 & §9
 */

import { db, type RouterConfigDB } from './schema';
import { encryptCredentials, decryptCredentials } from '../crypto/encrypt';
import type { RouterConfig } from '../router/types';

/**
 * Save router config dengan enkripsi kredensial
 */
export async function saveRouterConfig(
  config: RouterConfig,
  passphrase: string
): Promise<number> {
  const { encrypted, iv, salt } = await encryptCredentials(
    config.username,
    config.password,
    passphrase
  );

  const dbConfig: RouterConfigDB = {
    name: config.name,
    host: config.host,
    port: config.port,
    scheme: config.scheme,
    encryptedCredentials: encrypted,
    iv,
    salt,
    allowSelfSigned: config.allowSelfSigned,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Hanya simpan satu config (MVP: single router)
  // Clear existing configs
  await db.router.clear();
  
  return db.router.add(dbConfig);
}

/**
 * Get router config dan decrypt kredensial
 */
export async function getRouterConfig(
  passphrase: string
): Promise<RouterConfig | null> {
  const configs = await db.router.toArray();
  
  if (configs.length === 0) {
    return null;
  }

  // Ambil config pertama (MVP: single router)
  const dbConfig = configs[0];

  try {
    const { username, password } = await decryptCredentials(
      dbConfig.encryptedCredentials,
      dbConfig.iv,
      dbConfig.salt,
      passphrase
    );

    return {
      name: dbConfig.name,
      host: dbConfig.host,
      port: dbConfig.port,
      scheme: dbConfig.scheme,
      username,
      password,
      allowSelfSigned: dbConfig.allowSelfSigned,
    };
  } catch (error) {
    throw new Error('Failed to decrypt credentials. Check passphrase.');
  }
}

/**
 * Check apakah ada router config tersimpan
 */
export async function hasRouterConfig(): Promise<boolean> {
  const count = await db.router.count();
  return count > 0;
}

/**
 * Update router config
 */
export async function updateRouterConfig(
  config: RouterConfig,
  passphrase: string
): Promise<void> {
  const { encrypted, iv, salt } = await encryptCredentials(
    config.username,
    config.password,
    passphrase
  );

  const configs = await db.router.toArray();
  
  if (configs.length === 0) {
    throw new Error('No router config found');
  }

  const existingId = configs[0].id!;

  await db.router.update(existingId, {
    name: config.name,
    host: config.host,
    port: config.port,
    scheme: config.scheme,
    encryptedCredentials: encrypted,
    iv,
    salt,
    allowSelfSigned: config.allowSelfSigned,
    updatedAt: Date.now(),
  });
}

/**
 * Delete router config
 */
export async function deleteRouterConfig(): Promise<void> {
  await db.router.clear();
}

/**
 * Get router info tanpa decrypt (untuk display)
 */
export async function getRouterInfo(): Promise<{
  name: string;
  host: string;
  port: number;
  scheme: string;
} | null> {
  const configs = await db.router.toArray();
  
  if (configs.length === 0) {
    return null;
  }

  const config = configs[0];
  return {
    name: config.name,
    host: config.host,
    port: config.port,
    scheme: config.scheme,
  };
}
