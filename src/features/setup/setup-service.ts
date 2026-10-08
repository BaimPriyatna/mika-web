/**
 * Setup Router Service
 * Mengelola instalasi, verifikasi, dan uninstall script masa berlaku & scheduler
 * Sesuai KEPUTUSAN TERBARU §5, §6 dan DESIGN.md §4.8
 */

import type { RouterClient } from '../../core/router/client';
import {
  buildOnLoginScript,
  buildVmCleanerScript,
  buildVmOpenScript,
  buildVmCloseScript,
  DEFAULT_OPERATIONAL_HOURS,
  type OperationalHours,
} from './router-scripts';

export interface SetupChecklistStatus {
  connection: {
    status: 'ok' | 'error';
    details: string;
  };
  hotspotServer: {
    status: 'ok' | 'warning' | 'error';
    details: string;
  };
  clockNtp: {
    status: 'ok' | 'warning';
    synced: boolean;
    details: string;
    currentTime?: string;
    currentDate?: string;
  };
  onLoginScript: {
    status: 'ok' | 'not_installed' | 'diff';
    details: string;
    profilesChecked: number;
    profilesInstalled: number;
  };
  cleanerScheduler: {
    status: 'ok' | 'not_installed' | 'diff';
    details: string;
    installedList: string[];
    missingList: string[];
  };
}

export interface SetupDiffItem {
  name: string;
  type: 'script' | 'scheduler' | 'profile_on_login';
  status: 'matched' | 'missing' | 'different';
  expected: string;
  current?: string;
}

interface SchedulerRow {
  '.id'?: string;
  name: string;
  interval?: string;
  'start-time'?: string;
  'on-event'?: string;
  disabled?: string;
}

interface ProfileRow {
  '.id'?: string;
  name: string;
  'on-login'?: string;
  'session-timeout'?: string;
}

interface ClockRow {
  time?: string;
  date?: string;
  'time-zone-name'?: string;
}

interface NtpRow {
  enabled?: string;
  synced?: string;
  status?: string;
}

/**
 * Cek status checklist setup di router
 */
export async function checkSetupStatus(
  client: RouterClient,
  hours: OperationalHours = DEFAULT_OPERATIONAL_HOURS
): Promise<SetupChecklistStatus> {
  // 1. Cek Koneksi & Versi
  let connectionDetails = 'Terhubung';
  try {
    const res = await client.print<Record<string, string>>('/system/resource');
    if (res && res[0]) {
      const v = res[0].version || '';
      const b = res[0]['board-name'] || '';
      connectionDetails = `OK (${b ? b + ', ' : ''}v${v})`;
    }
  } catch (err: unknown) {
    return {
      connection: { status: 'error', details: err instanceof Error ? err.message : 'Gagal terhubung' },
      hotspotServer: { status: 'error', details: 'Belum terhubung' },
      clockNtp: { status: 'warning', synced: false, details: 'Belum terhubung' },
      onLoginScript: { status: 'not_installed', details: 'Belum terhubung', profilesChecked: 0, profilesInstalled: 0 },
      cleanerScheduler: { status: 'not_installed', details: 'Belum terhubung', installedList: [], missingList: [] },
    };
  }

  // 2. Cek Hotspot Server
  let hotspotStatus: 'ok' | 'warning' | 'error' = 'warning';
  let hotspotDetails = 'Tidak ditemukan server hotspot';
  try {
    const servers = await client.print<{ name: string; interface?: string }>('/ip/hotspot');
    if (servers.length > 0) {
      hotspotStatus = 'ok';
      hotspotDetails = servers.map(s => `${s.name}${s.interface ? ` pada ${s.interface}` : ''}`).join(', ');
    }
  } catch {
    hotspotStatus = 'warning';
    hotspotDetails = 'Tidak dapat membaca /ip/hotspot';
  }

  // 3. Cek Jam & NTP
  let ntpSynced = false;
  let ntpDetails = 'NTP tidak aktif · Masa berlaku bisa meleset';
  let curTime = '';
  let curDate = '';

  try {
    const clock = await client.print<ClockRow>('/system/clock');
    if (clock[0]) {
      curTime = clock[0].time || '';
      curDate = clock[0].date || '';

      // Guard check: tahun >= 2024
      const d = curDate;
      let yr = 0;
      if (d.includes('-')) {
        yr = Number(d.substring(0, 4)) || 0;
      } else {
        yr = Number(d.substring(d.length - 4)) || 0;
      }

      // Cek NTP client
      try {
        const ntp = await client.print<NtpRow>('/system/ntp/client');
        if (ntp[0]) {
          const isEnabled = ntp[0].enabled === 'yes' || ntp[0].enabled === 'true';
          const isSynced = ntp[0].synced === 'yes' || ntp[0].synced === 'true' || ntp[0].status === 'synchronized';
          if (isEnabled && isSynced) {
            ntpSynced = true;
          }
        }
      } catch {
        // Jika endpoint ntp client beda (misal v6 lama / SNTP)
      }

      if (yr >= 2024) {
        ntpSynced = true;
      }

      if (ntpSynced) {
        ntpDetails = `✔ Sinkron (${curTime || ''} ${curDate || ''})`;
      } else {
        ntpDetails = `NTP belum sinkron (${curDate || 'waktu lampau'}) · Masa berlaku dijaga tidak menghapus`;
      }
    }
  } catch {
    ntpDetails = 'Gagal memeriksa jam router';
  }

  // 4. Cek On-Login Script di Profil
  let profilesChecked = 0;
  let profilesInstalled = 0;
  let onLoginStatus: 'ok' | 'not_installed' | 'diff';

  try {
    const profiles = await client.print<ProfileRow>('/ip/hotspot/user/profile');
    profilesChecked = profiles.length;
    for (const p of profiles) {
      const scr = (p['on-login'] || '').trim();
      if (scr.includes('vm|') && scr.includes('|u=')) {
        profilesInstalled++;
      }
    }

    if (profilesInstalled > 0 && profilesInstalled === profilesChecked) {
      onLoginStatus = 'ok';
    } else if (profilesInstalled > 0) {
      onLoginStatus = 'diff';
    } else {
      onLoginStatus = 'not_installed';
    }
  } catch {
    onLoginStatus = 'not_installed';
  }

  // 5. Cek Schedulers (vm-cleaner, vm-open, vm-close)
  const targetSchedulers = ['vm-cleaner', 'vm-open', 'vm-close'];
  const installedList: string[] = [];
  const missingList: string[] = [];

  try {
    const schedulers = await client.print<SchedulerRow>('/system/scheduler');
    for (const target of targetSchedulers) {
      const found = schedulers.find(s => s.name === target);
      if (found) {
        installedList.push(target);
      } else {
        missingList.push(target);
      }
    }
  } catch {
    missingList.push(...targetSchedulers);
  }

  let cleanerStatus: 'ok' | 'not_installed' | 'diff';
  if (missingList.length === 0) {
    cleanerStatus = 'ok';
  } else if (installedList.length > 0) {
    cleanerStatus = 'diff';
  } else {
    cleanerStatus = 'not_installed';
  }

  return {
    connection: { status: 'ok', details: connectionDetails },
    hotspotServer: { status: hotspotStatus, details: hotspotDetails },
    clockNtp: {
      status: ntpSynced ? 'ok' : 'warning',
      synced: ntpSynced,
      details: ntpDetails,
      currentTime: curTime,
      currentDate: curDate,
    },
    onLoginScript: {
      status: onLoginStatus,
      details: profilesInstalled === profilesChecked && profilesChecked > 0
        ? `Terpasang pada semua profil (${profilesInstalled}/${profilesChecked})`
        : profilesInstalled > 0
          ? `Sebagian terpasang (${profilesInstalled}/${profilesChecked} profil)`
          : 'Belum terpasang di profil',
      profilesChecked,
      profilesInstalled,
    },
    cleanerScheduler: {
      status: cleanerStatus,
      details: missingList.length === 0
        ? `Semua scheduler aktif (${installedList.join(', ')}) [Jam operasional: ${hours.openTime} - ${hours.closeTime}]`
        : installedList.length > 0
          ? `Sebagian terpasang: ${installedList.join(', ')} (kurang: ${missingList.join(', ')})`
          : 'Belum terpasang',
      installedList,
      missingList,
    },
  };
}

/**
 * Pasang seluruh script dan scheduler ke router
 */
export async function installAllSetup(
  client: RouterClient,
  hours: OperationalHours = DEFAULT_OPERATIONAL_HOURS
): Promise<{ installedCount: number; messages: string[] }> {
  const messages: string[] = [];
  let installedCount = 0;

  // 1. Pasang on-login script ke semua profil hotspot
  const onLoginScript = buildOnLoginScript();
  const profiles = await client.print<ProfileRow>('/ip/hotspot/user/profile');

  for (const p of profiles) {
    if (p['.id']) {
      await client.set('/ip/hotspot/user/profile', p['.id'], {
        'on-login': onLoginScript,
      });
      installedCount++;
      messages.push(`Script on-login dipasang ke profil "${p.name}"`);
    }
  }

  // 2. Pasang / update scheduler vm-cleaner (interval 5m)
  const cleanerScript = buildVmCleanerScript(hours);
  await upsertScheduler(client, 'vm-cleaner', {
    interval: '5m',
    'start-time': 'startup',
    'on-event': cleanerScript,
  });
  installedCount++;
  messages.push('Scheduler "vm-cleaner" dipasang (interval 5m)');

  // 3. Pasang / update scheduler vm-open (07:30, interval 1d)
  const openScript = buildVmOpenScript();
  await upsertScheduler(client, 'vm-open', {
    interval: '1d',
    'start-time': `${hours.openTime}:00`,
    'on-event': openScript,
  });
  installedCount++;
  messages.push(`Scheduler "vm-open" dipasang (${hours.openTime}, interval 1d)`);

  // 4. Pasang / update scheduler vm-close (14:30, interval 1d)
  const closeScript = buildVmCloseScript();
  await upsertScheduler(client, 'vm-close', {
    interval: '1d',
    'start-time': `${hours.closeTime}:00`,
    'on-event': closeScript,
  });
  installedCount++;
  messages.push(`Scheduler "vm-close" dipasang (${hours.closeTime}, interval 1d)`);

  return { installedCount, messages };
}

/**
 * Helper upsert scheduler di /system/scheduler
 */
async function upsertScheduler(
  client: RouterClient,
  name: string,
  data: { interval: string; 'start-time': string; 'on-event': string }
): Promise<void> {
  const existing = await client.print<SchedulerRow>('/system/scheduler', { name });
  if (existing.length > 0 && existing[0]['.id']) {
    await client.set('/system/scheduler', existing[0]['.id'], {
      interval: data.interval,
      'start-time': data['start-time'],
      'on-event': data['on-event'],
      disabled: 'no',
    });
  } else {
    await client.add('/system/scheduler', {
      name,
      interval: data.interval,
      'start-time': data['start-time'],
      'on-event': data['on-event'],
      disabled: 'no',
    });
  }
}

/**
 * Verifikasi dan generate diff script di router
 */
export async function verifySetupDiff(
  client: RouterClient,
  hours: OperationalHours = DEFAULT_OPERATIONAL_HOURS
): Promise<SetupDiffItem[]> {
  const diffs: SetupDiffItem[] = [];

  // Verifikasi On-Login di Profiles
  const expectedOnLogin = buildOnLoginScript();
  try {
    const profiles = await client.print<ProfileRow>('/ip/hotspot/user/profile');
    for (const p of profiles) {
      const cur = (p['on-login'] || '').trim();
      if (!cur) {
        diffs.push({
          name: `Profil: ${p.name}`,
          type: 'profile_on_login',
          status: 'missing',
          expected: expectedOnLogin,
        });
      } else if (cur === expectedOnLogin) {
        diffs.push({
          name: `Profil: ${p.name}`,
          type: 'profile_on_login',
          status: 'matched',
          expected: expectedOnLogin,
          current: cur,
        });
      } else {
        diffs.push({
          name: `Profil: ${p.name}`,
          type: 'profile_on_login',
          status: 'different',
          expected: expectedOnLogin,
          current: cur,
        });
      }
    }
  } catch {
    // Ignore
  }

  // Verifikasi Schedulers
  const schedulersExpected: Record<string, string> = {
    'vm-cleaner': buildVmCleanerScript(hours),
    'vm-open': buildVmOpenScript(),
    'vm-close': buildVmCloseScript(),
  };

  try {
    const schedulers = await client.print<SchedulerRow>('/system/scheduler');
    for (const [sName, expectedScript] of Object.entries(schedulersExpected)) {
      const found = schedulers.find(s => s.name === sName);
      if (!found) {
        diffs.push({
          name: sName,
          type: 'scheduler',
          status: 'missing',
          expected: expectedScript,
        });
      } else {
        const curEvent = (found['on-event'] || '').trim();
        if (curEvent === expectedScript.trim()) {
          diffs.push({
            name: sName,
            type: 'scheduler',
            status: 'matched',
            expected: expectedScript,
            current: curEvent,
          });
        } else {
          diffs.push({
            name: sName,
            type: 'scheduler',
            status: 'different',
            expected: expectedScript,
            current: curEvent,
          });
        }
      }
    }
  } catch {
    // Ignore
  }

  return diffs;
}

/**
 * Copot semua objek prefix "vm-" dari router
 * Menghapus hanya scheduler/script berawalan "vm-"
 * dan membersihkan field on-login dari profil hotspot.
 */
export async function uninstallAllSetup(
  client: RouterClient
): Promise<{ removedCount: number; messages: string[] }> {
  const messages: string[] = [];
  let removedCount = 0;

  // 1. Bersihkan field on-login dari profil hotspot
  try {
    const profiles = await client.print<ProfileRow>('/ip/hotspot/user/profile');
    for (const p of profiles) {
      const onLogin = p['on-login'] || '';
      if (p['.id'] && (onLogin.includes('vm|') || onLogin.includes('$user'))) {
        await client.set('/ip/hotspot/user/profile', p['.id'], {
          'on-login': '',
        });
        removedCount++;
        messages.push(`Dibersihkan script on-login dari profil "${p.name}"`);
      }
    }
  } catch (err: unknown) {
    messages.push(`Peringatan saat membersihkan profil: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Hapus schedulers berawalan "vm-"
  try {
    const schedulers = await client.print<SchedulerRow>('/system/scheduler');
    for (const s of schedulers) {
      if (s.name && s.name.startsWith('vm-') && s['.id']) {
        await client.remove('/system/scheduler', s['.id']);
        removedCount++;
        messages.push(`Dihapus scheduler "${s.name}"`);
      }
    }
  } catch (err: unknown) {
    messages.push(`Peringatan saat menghapus scheduler: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Hapus scripts berawalan "vm-" jika ada
  try {
    const scripts = await client.print<{ '.id'?: string; name: string }>('/system/script');
    for (const sc of scripts) {
      if (sc.name && sc.name.startsWith('vm-') && sc['.id']) {
        await client.remove('/system/script', sc['.id']);
        removedCount++;
        messages.push(`Dihapus script "${sc.name}"`);
      }
    }
  } catch {
    // Abaikan jika /system/script kosong
  }

  return { removedCount, messages };
}
