import type { RouterManager } from '../router-manager.ts';
import type { RouterCredentials } from './config.ts';

/** Akses ke router yang dibutuhkan penerbitan voucher: dibatasi agar mudah diganti saat uji. */
export interface RouterPort {
  ensureConnected(): Promise<void>;
  print(path: string, query?: Record<string, string>): Promise<Record<string, string>[]>;
  add(path: string, body: Record<string, string>): Promise<string>;
}

/**
 * Memakai RouterManager yang sudah ada (klien API binary/REST). Jika belum terhubung, backend
 * menyambung sendiri memakai kredensial di environment server. Jika perintah gagal karena koneksi
 * putus, sambungan dibuka ulang sekali lalu perintah diulang.
 */
export class ManagerRouterPort implements RouterPort {
  private readonly manager: RouterManager;
  private readonly credentials: RouterCredentials | null;
  private connecting: Promise<void> | null = null;

  constructor(manager: RouterManager, credentials: RouterCredentials | null) {
    this.manager = manager;
    this.credentials = credentials;
  }

  async ensureConnected(): Promise<void> {
    if (this.manager.isConnected()) return;
    if (!this.credentials) {
      throw new Error(
        'Router belum terhubung dan kredensial router server (ROUTER_HOST, ROUTER_USER, ROUTER_PASSWORD) belum diatur'
      );
    }
    if (!this.connecting) {
      const c = this.credentials;
      this.connecting = this.manager
        .connect({
          host: c.host,
          port: c.port,
          username: c.username,
          password: c.password,
          protocol: c.protocol,
        })
        .then(() => undefined)
        .finally(() => {
          this.connecting = null;
        });
    }
    await this.connecting;
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureConnected();
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const connectionLost = /Koneksi|Socket|timeout|ECONN|EPIPE|ETIMEDOUT|terputus|ditutup/i.test(message);
      if (!connectionLost || !this.credentials) throw err;
      this.manager.disconnect();
      await this.ensureConnected();
      return fn();
    }
  }

  print(path: string, query?: Record<string, string>) {
    return this.run(() => this.manager.print(path, query));
  }

  add(path: string, body: Record<string, string>) {
    return this.run(() => this.manager.add(path, body));
  }
}
