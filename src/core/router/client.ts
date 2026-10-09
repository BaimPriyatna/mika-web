/**
 * High-level RouterClient
 * Menggunakan backend proxy untuk berkomunikasi dengan router MikroTik
 * Sesuai DEV-SPEC.md §2 & §7
 */

import { queryRouter } from '../../features/connection/api';

export class RouterClient {
  /**
   * Helper: print dengan query ke backend
   */
  async print<T>(path: string, query?: Record<string, string>): Promise<T[]> {
    return queryRouter<T[]>('print', path, query);
  }

  /**
   * Helper: add
   */
  async add(path: string, body: Record<string, string>): Promise<string> {
    return queryRouter<string>('add', path, body);
  }

  /**
   * Helper: set
   */
  async set(path: string, id: string, body: Record<string, string>): Promise<void> {
    await queryRouter('set', path, body, id);
  }

  /**
   * Helper: remove
   */
  async remove(path: string, id: string): Promise<void> {
    await queryRouter('remove', path, undefined, id);
  }

  /**
   * Helper: call (untuk command execution)
   */
  async call<T>(path: string, body?: Record<string, string>): Promise<T[]> {
    // Perintah non-CRUD (mis. make-static), BUKAN print
    return queryRouter<T[]>('call', path, body);
  }
}
