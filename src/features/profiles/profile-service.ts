/**
 * Hotspot profile service
 * CRUD profil hotspot di router
 * Sesuai DEV-SPEC.md §6.2
 */

import type { RouterClient } from '../../core/router/client';
import type { HotspotProfile } from '../../core/router/types';
import { buildRateLimit } from '../../core/router/mappers';
import {
  isValidProfileName,
  isValidRateLimit,
  isValidProfileDuration,
} from '../../core/utils/validation';
import { buildOnLoginScript } from '../setup/router-scripts';

/**
 * Get all hotspot profiles
 */
export async function getProfiles(client: RouterClient): Promise<HotspotProfile[]> {
  return client.print<HotspotProfile>('/ip/hotspot/user/profile');
}

/**
 * Get profile by name
 */
export async function getProfileByName(
  client: RouterClient,
  name: string
): Promise<HotspotProfile | null> {
  const profiles = await getProfiles(client);
  return profiles.find(p => p.name === name) ?? null;
}

/**
 * Create hotspot profile
 */
export async function createProfile(
  client: RouterClient,
  params: {
    name: string;
    uploadSpeed: string; // "2M", "512k"
    downloadSpeed: string;
    validity?: string; // "1h", "3h", "5h", "7h"
    idleTimeout?: string;
    keepaliveTimeout?: string;
    addressPool?: string;
    macCookieTimeout?: string;
  }
): Promise<string> {
  // Validasi
  if (!isValidProfileName(params.name)) {
    throw new Error('Nama profil tidak valid');
  }

  const rateLimit = buildRateLimit(params.uploadSpeed, params.downloadSpeed);
  if (!isValidRateLimit(rateLimit)) {
    throw new Error('Rate limit tidak valid');
  }

  if (params.validity && !isValidProfileDuration(params.validity)) {
    throw new Error('Masa berlaku profil maksimal 7 jam, satuan menit atau jam saja (mis. 30m, 1h, 3h, 5h, 7h)');
  }

  // Check duplikat
  const existing = await getProfileByName(client, params.name);
  if (existing) {
    throw new Error(`Profil dengan nama "${params.name}" sudah ada`);
  }

  const body: Record<string, string> = {
    name: params.name,
    'rate-limit': rateLimit,
    'shared-users': '1', // Dikunci
  };

  // session-timeout adalah parameter untuk masa berlaku di profile
  if (params.validity) {
    body['session-timeout'] = params.validity;
  }

  if (params.idleTimeout) {
    body['idle-timeout'] = params.idleTimeout;
  }

  if (params.keepaliveTimeout) {
    body['keepalive-timeout'] = params.keepaliveTimeout;
  }

  if (params.addressPool) {
    body['address-pool'] = params.addressPool;
  }

  if (params.macCookieTimeout) {
    body['mac-cookie-timeout'] = params.macCookieTimeout;
  }

  // Set on-login script jika ada validity untuk tracking masa berlaku (KEPUTUSAN TERBARU §6)
  if (params.validity) {
    body['on-login'] = buildOnLoginScript();
  }

  return client.add('/ip/hotspot/user/profile', body);
}

/**
 * Update hotspot profile
 */
export async function updateProfile(
  client: RouterClient,
  id: string,
  params: {
    name?: string;
    uploadSpeed?: string;
    downloadSpeed?: string;
    validity?: string;
    idleTimeout?: string;
    keepaliveTimeout?: string;
    addressPool?: string;
    macCookieTimeout?: string;
  }
): Promise<void> {
  const body: Record<string, string> = {};

  if (params.name !== undefined) {
    if (!isValidProfileName(params.name)) {
      throw new Error('Nama profil tidak valid');
    }
    body.name = params.name;
  }

  if (params.uploadSpeed && params.downloadSpeed) {
    const rateLimit = buildRateLimit(params.uploadSpeed, params.downloadSpeed);
    if (!isValidRateLimit(rateLimit)) {
      throw new Error('Rate limit tidak valid');
    }
    body['rate-limit'] = rateLimit;
  }

  if (params.validity !== undefined) {
    if (params.validity && !isValidProfileDuration(params.validity)) {
      throw new Error('Masa berlaku profil maksimal 7 jam, satuan menit atau jam saja (mis. 30m, 1h, 3h, 5h, 7h)');
    }
    body['session-timeout'] = params.validity || 'none';
    
    // Update on-login script
    if (params.validity) {
      body['on-login'] = buildOnLoginScript();
    } else {
      body['on-login'] = '';
    }
  }

  if (params.idleTimeout !== undefined) {
    body['idle-timeout'] = params.idleTimeout;
  }

  if (params.keepaliveTimeout !== undefined) {
    body['keepalive-timeout'] = params.keepaliveTimeout;
  }

  if (params.addressPool !== undefined) {
    body['address-pool'] = params.addressPool;
  }

  if (params.macCookieTimeout !== undefined) {
    body['mac-cookie-timeout'] = params.macCookieTimeout;
  }

  // Selalu enforce shared-users = 1
  body['shared-users'] = '1';

  await client.set('/ip/hotspot/user/profile', id, body);
}

/**
 * Delete hotspot profile
 */
export async function deleteProfile(
  client: RouterClient,
  id: string
): Promise<void> {
  // Check apakah ada user yang menggunakan profil ini
  const users = await client.print<{ profile: string }>('/ip/hotspot/user');
  const profile = (await client.print<HotspotProfile>('/ip/hotspot/user/profile', { '.id': id }))[0];
  
  if (!profile) {
    throw new Error('Profil tidak ditemukan');
  }

  const usersWithProfile = users.filter(u => u.profile === profile.name);
  
  if (usersWithProfile.length > 0) {
    throw new Error(
      `Profil tidak bisa dihapus karena masih digunakan oleh ${usersWithProfile.length} user`
    );
  }

  await client.remove('/ip/hotspot/user/profile', id);
}

/**
 * Fix profile dengan shared-users != 1
 */
export async function fixProfileSharedUsers(
  client: RouterClient,
  id: string
): Promise<void> {
  await client.set('/ip/hotspot/user/profile', id, {
    'shared-users': '1',
  });
}

/**
 * Check profiles dengan shared-users != 1
 */
export async function getProfilesNeedingFix(
  client: RouterClient
): Promise<HotspotProfile[]> {
  const profiles = await getProfiles(client);
  return profiles.filter(p => p['shared-users'] !== '1');
}

