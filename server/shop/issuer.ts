import type { RouterPort } from './router-port.ts';
import type { Order } from './types.ts';
import { parseRouterDurationToMinutes } from './duration.ts';
import { buildOnlineVoucherComment, generateCode } from './voucher-code.ts';

export interface IssueHooks {
  /** Simpan kode SEBELUM akun dibuat di router, supaya retry memakai kode yang sama dan tidak membuat akun ganda. */
  saveCode(code: string): Promise<void>;
}

function ownedByOrder(comment: string | undefined, orderId: string): boolean {
  return (comment ?? '').startsWith(`vm|b=${orderId}|`);
}

/**
 * Penerbit voucher untuk pesanan yang sudah dibayar. Idempoten:
 *  1. kode dibuat dan disimpan dulu,
 *  2. router dicek: jika akun dengan kode itu sudah ada dan comment-nya milik pesanan ini, dianggap sudah dibuat,
 *  3. jika nama bentrok dengan akun lain, kode diganti,
 *  4. setelah dibuat, akun dibaca ulang untuk verifikasi.
 */
export class VoucherIssuer {
  private readonly router: RouterPort;

  constructor(router: RouterPort) {
    this.router = router;
  }

  async issue(order: Order, hooks: IssueHooks): Promise<string> {
    await this.router.ensureConnected();

    const profiles = await this.router.print('/ip/hotspot/user/profile');
    const profile = profiles.find(p => p.name === order.profileName);
    if (!profile) {
      throw new Error(`Profil "${order.profileName}" tidak ditemukan di router`);
    }
    const sharedUsers = profile['shared-users'];
    if (sharedUsers !== undefined && sharedUsers !== '1') {
      throw new Error(`Profil "${order.profileName}" memakai shared-users=${sharedUsers}; harus 1 (perbaiki di halaman Profil)`);
    }

    const validity = parseRouterDurationToMinutes(profile['session-timeout']) ?? order.validityMinutes;
    const comment = buildOnlineVoucherComment(order.id, order.amount, validity, order.packageId);

    let code = order.voucherCode;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!code) {
        code = generateCode();
        await hooks.saveCode(code);
      }

      const existing = (await this.router.print('/ip/hotspot/user', { name: code })).find(u => u.name === code);
      if (existing) {
        if (ownedByOrder(existing.comment, order.id)) return code; // sudah dibuat pada percobaan sebelumnya
        code = undefined; // bentrok dengan akun lain: ganti kode
        continue;
      }

      await this.router.add('/ip/hotspot/user', {
        name: code,
        password: code,
        profile: order.profileName,
        comment,
      });

      const created = (await this.router.print('/ip/hotspot/user', { name: code })).find(u => u.name === code);
      if (!created || !ownedByOrder(created.comment, order.id)) {
        throw new Error('Akun tidak ditemukan di router setelah dibuat (verifikasi gagal)');
      }
      return code;
    }
    throw new Error('Gagal mendapatkan kode akun yang unik setelah beberapa percobaan');
  }
}
