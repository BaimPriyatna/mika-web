/**
 * Lease and Device Monitoring Service
 * Sesuai DESIGN.md §4.7 & DEV-SPEC.md §6.7
 */

import type { RouterClient } from '../../core/router/client';
import type { DhcpLease, HotspotActive, HotspotHost, HotspotUser, HotspotProfile } from '../../core/router/types';
import { parseDurationToMinutes } from '../../core/utils/validation';

export interface ActiveUserWithValidity extends HotspotActive {
  remainingMinutes?: number;
  formattedRemaining?: string;
  validityLevel?: 'normal' | 'warning' | 'critical' | 'unknown';
}

/**
 * Format bytes to readable string (e.g. 1.2 MB, 450 KB)
 */
export function formatBytes(bytesStr?: string | number): string {
  const bytes = typeof bytesStr === 'string' ? parseInt(bytesStr, 10) : bytesStr;
  if (!bytes || isNaN(bytes)) return '0 B';

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format sisa menit ke string: '2j 14m' atau '45m'
 */
export function formatMinutesToDuration(minutes: number): string {
  if (minutes <= 0) return 'Habis';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0 && mins > 0) return `${hours}j ${mins}m`;
  if (hours > 0) return `${hours}j`;
  return `${mins}m`;
}

/**
 * Ambil daftar DHCP leases dari router
 */
export async function listDhcpLeases(client: RouterClient): Promise<DhcpLease[]> {
  return await client.print<DhcpLease>('/ip/dhcp-server/lease');
}

/**
 * Ambil daftar Hotspot Active beserta perhitungan sisa masa berlaku
 */
export async function listHotspotActive(client: RouterClient): Promise<ActiveUserWithValidity[]> {
  const [activeUsers, allUsers, profiles] = await Promise.all([
    client.print<HotspotActive>('/ip/hotspot/active'),
    client.print<HotspotUser>('/ip/hotspot/user'),
    client.print<HotspotProfile>('/ip/hotspot/user/profile'),
  ]);

  const userMap = new Map<string, HotspotUser>();
  for (const u of allUsers) {
    userMap.set(u.name, u);
  }

  const profileMap = new Map<string, HotspotProfile>();
  for (const p of profiles) {
    profileMap.set(p.name, p);
  }

  return activeUsers.map(active => {
    const user = userMap.get(active.user);
    const profile = user ? profileMap.get(user.profile) : undefined;

    let remainingMinutes: number | undefined;
    let formattedRemaining: string | undefined;
    let validityLevel: 'normal' | 'warning' | 'critical' | 'unknown' = 'unknown';

    // Parse validity dari profil session-timeout
    const profileTimeout = profile?.['session-timeout'] || profile?.validity;
    const totalValidityMinutes = profileTimeout ? parseDurationToMinutes(profileTimeout) : undefined;

    if (totalValidityMinutes && totalValidityMinutes > 0) {
      // Periksa comment user untuk |u= (used minutes terakumulasi)
      const comment = user?.comment || '';
      const usedMatch = comment.match(/\|u=(\d+)/);
      const usedMinutes = usedMatch ? parseInt(usedMatch[1], 10) : 0;

      const remaining = Math.max(0, totalValidityMinutes - usedMinutes);
      remainingMinutes = remaining;
      formattedRemaining = formatMinutesToDuration(remaining);

      if (remaining <= 10) {
        validityLevel = 'critical'; // Merah (< 10 menit)
      } else if (remaining <= 60) {
        validityLevel = 'warning'; // Kuning (< 1 jam)
      } else {
        validityLevel = 'normal'; // Hijau / normal
      }
    } else if (active['session-time-left']) {
      // Fallback jika MikroTik routerOS mengembalikan session-time-left native
      const nativeMinutes = parseDurationToMinutes(active['session-time-left']);
      if (nativeMinutes !== null && nativeMinutes > 0) {
        remainingMinutes = nativeMinutes;
        formattedRemaining = formatMinutesToDuration(nativeMinutes);
        validityLevel = nativeMinutes <= 10 ? 'critical' : nativeMinutes <= 60 ? 'warning' : 'normal';
      }
    }

    return {
      ...active,
      remainingMinutes,
      formattedRemaining,
      validityLevel,
    };
  });
}

/**
 * Ambil daftar Hotspot Host dari router
 */
export async function listHotspotHost(client: RouterClient): Promise<HotspotHost[]> {
  return await client.print<HotspotHost>('/ip/hotspot/host');
}

/**
 * Putuskan koneksi user aktif (Kick)
 */
export async function kickActiveUser(client: RouterClient, id: string): Promise<void> {
  await client.remove('/ip/hotspot/active', id);
}

/**
 * Jadikan lease dinamis menjadi statis
 */
export async function makeLeaseStatic(client: RouterClient, id: string): Promise<void> {
  try {
    await client.call('/ip/dhcp-server/lease/make-static', { '.id': id });
  } catch {
    // Fallback jika perintah make-static tidak tersedia, update dynamic=no
    await client.set('/ip/dhcp-server/lease', id, { dynamic: 'no' });
  }
}

/**
 * Blokir perangkat DHCP lease
 */
export async function blockLease(client: RouterClient, lease: DhcpLease): Promise<void> {
  if (lease['.id']) {
    // Coba set block-access=yes pada lease
    try {
      await client.set('/ip/dhcp-server/lease', lease['.id'], { 'block-access': 'yes' });
    } catch {
      // Fallback: disable lease
      await client.set('/ip/dhcp-server/lease', lease['.id'], { disabled: 'yes' });
    }
  }

  // Juga tambahkan IP binding blocked jika hotspot ada
  if (lease['mac-address']) {
    try {
      await client.add('/ip/hotspot/ip-binding', {
        'mac-address': lease['mac-address'],
        type: 'blocked',
        comment: 'vm-blocked',
      });
    } catch {
      // Abaikan jika sudah ada
    }
  }
}

/**
 * Buka blokir perangkat DHCP lease
 */
export async function unblockLease(client: RouterClient, lease: DhcpLease): Promise<void> {
  if (lease['.id']) {
    try {
      await client.set('/ip/dhcp-server/lease', lease['.id'], { 'block-access': 'no', disabled: 'no' });
    } catch {
      // Ignore
    }
  }

  // Hapus dari IP binding blocked
  if (lease['mac-address']) {
    try {
      const bindings = await client.print<{ '.id': string; 'mac-address': string }>(
        '/ip/hotspot/ip-binding',
        { 'mac-address': lease['mac-address'] }
      );
      for (const b of bindings) {
        await client.remove('/ip/hotspot/ip-binding', b['.id']);
      }
    } catch {
      // Ignore
    }
  }
}
