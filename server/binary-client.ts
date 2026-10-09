import * as net from 'node:net';
import * as tls from 'node:tls';
import * as crypto from 'node:crypto';
import { encodeSentence, SentenceParser, type ApiSentence } from './binary-protocol.ts';

export interface BinaryClientOptions {
  host: string;
  port?: number;
  username: string;
  password: string;
  useSsl?: boolean;
  timeoutMs?: number;
}

export class BinaryRouterClient {
  private host: string;
  private port: number;
  private username: string;
  private password: string;
  private useSsl: boolean;
  private timeoutMs: number;

  private socket: net.Socket | null = null;
  private parser = new SentenceParser();
  private isConnected = false;

  // Pembaca kalimat: satu listener 'data' permanen mengisi parser, lalu membangunkan penunggu.
  private waiters: Array<{ resolve: (s: ApiSentence) => void; reject: (e: Error) => void }> = [];
  // Antrean perintah: API tanpa tag hanya aman jika satu perintah berjalan pada satu waktu.
  private queue: Promise<unknown> = Promise.resolve();

  get connected(): boolean {
    return this.isConnected;
  }

  constructor(options: BinaryClientOptions) {
    this.host = options.host;
    this.useSsl = !!options.useSsl;
    this.port = options.port || (this.useSsl ? 8729 : 8728);
    this.username = options.username;
    this.password = options.password;
    this.timeoutMs = options.timeoutMs || 10000;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;
      const timeoutTimer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.close();
          reject(new Error(`Koneksi ke ${this.host}:${this.port} timeout (${this.timeoutMs}ms)`));
        }
      }, this.timeoutMs);

      const onConnect = async () => {
        try {
          await this.login();
          clearTimeout(timeoutTimer);
          if (!resolved) {
            resolved = true;
            this.isConnected = true;
            resolve();
          }
        } catch (err) {
          clearTimeout(timeoutTimer);
          this.close();
          if (!resolved) {
            resolved = true;
            reject(err);
          }
        }
      };

      this.parser = new SentenceParser();
      this.waiters = [];

      if (this.useSsl) {
        this.socket = tls.connect(
          {
            host: this.host,
            port: this.port,
            rejectUnauthorized: false,
          },
          onConnect
        );
      } else {
        this.socket = net.createConnection(
          {
            host: this.host,
            port: this.port,
          },
          onConnect
        );
      }

      this.socket.on('data', (chunk: Buffer) => {
        this.parser.append(chunk);
        this.pump();
      });

      this.socket.on('error', (err) => {
        clearTimeout(timeoutTimer);
        this.close();
        this.failWaiters(new Error(`Koneksi router bermasalah: ${err.message}`));
        if (!resolved) {
          resolved = true;
          reject(new Error(`Gagal membuka koneksi TCP ke ${this.host}:${this.port}: ${err.message}`));
        }
      });

      this.socket.on('close', () => {
        this.isConnected = false;
        this.failWaiters(new Error('Koneksi terputus saat membaca data'));
      });
    });
  }

  close() {
    this.isConnected = false;
    this.failWaiters(new Error('Koneksi ditutup'));
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch {}
      this.socket = null;
    }
  }

  /** Serahkan kalimat lengkap yang sudah ada di parser ke penunggu, berurutan. */
  private pump() {
    while (this.waiters.length > 0) {
      const sentence = this.parser.nextSentence();
      if (!sentence) break;
      this.waiters.shift()!.resolve(sentence);
    }
  }

  private failWaiters(err: Error) {
    const pending = this.waiters.splice(0);
    for (const w of pending) w.reject(err);
  }

  private readSentence(): Promise<ApiSentence> {
    const existing = this.parser.nextSentence();
    if (existing) return Promise.resolve(existing);
    if (!this.socket) return Promise.reject(new Error('Socket disconnected'));
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  private async sendWords(words: string[]): Promise<void> {
    if (!this.socket) throw new Error('Socket not connected');
    const data = encodeSentence(words);
    return new Promise((resolve, reject) => {
      this.socket!.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async login(): Promise<void> {
    // Try RouterOS 6.43+ and 7+ plain login first
    await this.sendWords(['/login', `=name=${this.username}`, `=password=${this.password}`]);
    const resp = await this.readSentence();

    if (resp.type === '!done') {
      if (resp.attributes['ret']) {
        // RouterOS older than 6.43 challenge-response required!
        const challengeHex = resp.attributes['ret'];
        const challengeBuf = Buffer.from(challengeHex, 'hex');
        const passBuf = Buffer.from(this.password, 'utf8');
        
        // MD5(\x00 + password + challenge)
        const hasher = crypto.createHash('md5');
        hasher.update(Buffer.from([0x00]));
        hasher.update(passBuf);
        hasher.update(challengeBuf);
        const responseHex = '00' + hasher.digest('hex');

        await this.sendWords([
          '/login',
          `=name=${this.username}`,
          `=response=${responseHex}`,
        ]);

        const chalResp = await this.readSentence();
        if (chalResp.type !== '!done') {
          const msg = chalResp.attributes['message'] || 'Autentikasi challenge-response gagal';
          throw new Error(`Login gagal: ${msg}`);
        }
      }
      return;
    }

    if (resp.type === '!trap') {
      const msg = resp.attributes['message'] || 'Autentikasi gagal (username/password salah)';
      throw new Error(`Login gagal: ${msg}`);
    }

    throw new Error(`Login gagal: respons tidak dikenal (${resp.type})`);
  }

  /** Jalankan fungsi satu per satu (FIFO). Kegagalan satu perintah tidak menghentikan antrean. */
  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Kirim satu kalimat API dan baca balasannya sampai !done.
   * - Setelah !trap RouterOS tetap mengirim !done; harus dibaca sampai habis, kalau tidak
   *   !done itu terbaca sebagai balasan perintah berikutnya (balasan jadi bergeser/kosong).
   */
  private async runCommand(words: string[]): Promise<Record<string, string>[]> {
    await this.sendWords(words);

    const results: Record<string, string>[] = [];
    let trapMessage: string | null = null;

    while (true) {
      const sentence = await this.readSentence();
      if (sentence.type === '!re') {
        results.push(sentence.attributes);
      } else if (sentence.type === '!done') {
        if (!trapMessage && sentence.attributes && Object.keys(sentence.attributes).length > 0) {
          results.push(sentence.attributes);
        }
        break;
      } else if (sentence.type === '!trap') {
        if (trapMessage === null) {
          trapMessage = sentence.attributes['message'] || 'Eksekusi perintah API gagal';
        }
      } else if (sentence.type === '!fatal') {
        this.close();
        throw new Error(`RouterOS Fatal Error: ${sentence.rawWords.join(' ')}`);
      }
      // '!empty' dan tipe lain diabaikan; tetap menunggu !done
    }

    if (trapMessage !== null) {
      throw new Error(`RouterOS Error: ${trapMessage}`);
    }
    return results;
  }

  /** Jalankan perintah dengan antrean + batas waktu. Timeout menutup koneksi (urutan balasan tidak aman lagi). */
  private exec(words: string[]): Promise<Record<string, string>[]> {
    const limit = Math.max(this.timeoutMs, 30000);
    return this.runExclusive(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          this.close();
          reject(new Error(`Perintah ${words[0]} timeout (${limit}ms), koneksi ditutup. Hubungkan ulang.`));
        }, limit);
      });
      try {
        return await Promise.race([this.runCommand(words), timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    });
  }

  /**
   * @param args    atribut perintah  -> "=key=value"
   * @param queries filter print        -> "?key=value" (BUKAN atribut; atribut di print = "unknown parameter")
   */
  async executeCommand(
    command: string,
    args: Record<string, string> = {},
    queries: Record<string, string> = {}
  ): Promise<Record<string, string>[]> {
    const words = [command];
    for (const [key, val] of Object.entries(args)) {
      words.push(`=${key}=${val}`);
    }
    for (const [key, val] of Object.entries(queries)) {
      words.push(`?${key}=${val}`);
    }
    return this.exec(words);
  }

  // Helpers matching paths
  async print(path: string, query: Record<string, string> = {}): Promise<Record<string, string>[]> {
    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    const cmd = `/${cleanPath}/print`;
    // Hanya argumen khusus print yang menjadi atribut; sisanya filter baris (?key=value)
    const args: Record<string, string> = {};
    const queries: Record<string, string> = {};
    for (const [key, val] of Object.entries(query)) {
      if (key === '.proplist' || key === 'count-only' || key === 'detail' || key === 'without-paging') {
        args[key] = val;
      } else {
        queries[key] = val;
      }
    }
    return this.executeCommand(cmd, args, queries);
  }

  /** Jalankan perintah non-CRUD, mis. /ip/dhcp-server/lease/make-static dengan =.id=*1 */
  async call(path: string, body: Record<string, string> = {}): Promise<Record<string, string>[]> {
    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    return this.executeCommand(`/${cleanPath}`, body);
  }

  async add(path: string, body: Record<string, string>): Promise<string> {
    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    const cmd = `/${cleanPath}/add`;
    const res = await this.executeCommand(cmd, body);
    const first = res[0];
    return first?.['ret'] || first?.['.id'] || '';
  }

  async set(path: string, id: string, body: Record<string, string>): Promise<void> {
    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    const cmd = `/${cleanPath}/set`;
    await this.executeCommand(cmd, { '.id': id, ...body });
  }

  async remove(path: string, id: string): Promise<void> {
    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    const cmd = `/${cleanPath}/remove`;
    await this.executeCommand(cmd, { '.id': id });
  }
}
