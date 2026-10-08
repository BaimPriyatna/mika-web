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

      this.socket.on('error', (err) => {
        clearTimeout(timeoutTimer);
        this.close();
        if (!resolved) {
          resolved = true;
          reject(new Error(`Gagal membuka koneksi TCP ke ${this.host}:${this.port}: ${err.message}`));
        }
      });

      this.socket.on('close', () => {
        this.isConnected = false;
      });
    });
  }

  close() {
    this.isConnected = false;
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch {}
      this.socket = null;
    }
  }

  private async readSentence(): Promise<ApiSentence> {
    const existing = this.parser.nextSentence();
    if (existing) {
      return existing;
    }

    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error('Socket disconnected'));
      }

      const onData = (chunk: Buffer) => {
        this.parser.append(chunk);
        const sentence = this.parser.nextSentence();
        if (sentence) {
          cleanup();
          resolve(sentence);
        }
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const onClose = () => {
        cleanup();
        reject(new Error('Koneksi terputus saat membaca data'));
      };

      const cleanup = () => {
        this.socket?.off('data', onData);
        this.socket?.off('error', onError);
        this.socket?.off('close', onClose);
      };

      this.socket.on('data', onData);
      this.socket.on('error', onError);
      this.socket.on('close', onClose);
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

  async executeCommand(command: string, args: Record<string, string> = {}): Promise<Record<string, string>[]> {
    const words = [command];
    for (const [key, val] of Object.entries(args)) {
      words.push(`=${key}=${val}`);
    }

    await this.sendWords(words);

    const results: Record<string, string>[] = [];
    while (true) {
      const sentence = await this.readSentence();
      if (sentence.type === '!re') {
        results.push(sentence.attributes);
      } else if (sentence.type === '!done') {
        if (sentence.attributes && Object.keys(sentence.attributes).length > 0) {
          results.push(sentence.attributes);
        }
        break;
      } else if (sentence.type === '!trap') {
        const msg = sentence.attributes['message'] || 'Eksekusi perintah API gagal';
        throw new Error(`RouterOS Error: ${msg}`);
      } else if (sentence.type === '!fatal') {
        this.close();
        throw new Error(`RouterOS Fatal Error: ${sentence.rawWords.join(' ')}`);
      }
    }

    return results;
  }

  // Helpers matching paths
  async print(path: string, query: Record<string, string> = {}): Promise<Record<string, string>[]> {
    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    const cmd = `/${cleanPath}/print`;
    return this.executeCommand(cmd, query);
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
