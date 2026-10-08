/**
 * Router types and interfaces
 * Sesuai DEV-SPEC.md §5
 */

export interface RouterConfig {
  name: string;
  host: string;
  port: number;
  scheme: 'http' | 'https';
  username: string;
  password: string;
  allowSelfSigned?: boolean;
}

export interface RouterTransport {
  readonly kind: 'rest' | 'api';
  connect(cfg: RouterConfig): Promise<void>;
  disconnect(): Promise<void>;
  print<T>(path: string, query?: Record<string, string>): Promise<T[]>;
  add(path: string, body: Record<string, string>): Promise<string>;
  set(path: string, id: string, body: Record<string, string>): Promise<void>;
  remove(path: string, id: string): Promise<void>;
  call<T>(path: string, body?: Record<string, string>): Promise<T[]>;
}

export interface SystemResource {
  version: string;
  boardName: string;
  platform: string;
  cpuLoad: number;
  freeMemory: number;
  totalMemory: number;
  uptime: string;
  architecture: string;
}

export interface HotspotProfile {
  '.id': string;
  name: string;
  'rate-limit'?: string;
  'shared-users'?: string;
  'session-timeout'?: string; // Masa berlaku profil
  validity?: string; // Deprecated, gunakan session-timeout
  'idle-timeout'?: string;
  'keepalive-timeout'?: string;
  'address-pool'?: string;
  'mac-cookie-timeout'?: string;
  'on-login'?: string;
  comment?: string;
}

export interface HotspotUser {
  '.id': string;
  name: string;
  password: string;
  profile: string;
  comment?: string;
  disabled?: string;
  'limit-bytes-total'?: string;
}

export interface HotspotActive {
  '.id': string;
  user: string;
  address: string;
  'mac-address': string;
  'login-by': string;
  uptime: string;
  'session-time-left'?: string;
  'idle-time'?: string;
  'bytes-in': string;
  'bytes-out': string;
}

export interface HotspotHost {
  '.id': string;
  'mac-address': string;
  address: string;
  'to-address': string;
  server: string;
  uptime: string;
  authorized?: string;
  'idle-time'?: string;
  'bytes-in': string;
  'bytes-out': string;
}

export interface DhcpLease {
  '.id': string;
  address: string;
  'mac-address': string;
  'client-id'?: string;
  hostname?: string;
  server: string;
  status: string;
  'expires-after'?: string;
  'last-seen'?: string;
  'active-address'?: string;
  'active-mac-address'?: string;
  'active-client-id'?: string;
  'active-server'?: string;
  dynamic?: string;
  disabled?: string;
  comment?: string;
}

export interface SystemScheduler {
  '.id': string;
  name: string;
  'start-date': string;
  'start-time': string;
  interval: string;
  'on-event': string;
  disabled?: string;
  'next-run'?: string;
  'run-count'?: string;
  comment?: string;
}

export interface SystemScript {
  '.id': string;
  name: string;
  source: string;
  'last-started'?: string;
  'run-count'?: string;
  owner: string;
  policy: string;
  comment?: string;
}

export interface SystemClock {
  time: string;
  date: string;
  'time-zone-name': string;
  'time-zone-autodetect'?: string;
  'gmt-offset'?: string;
  'dst-active'?: string;
}

export interface SystemNtpClient {
  enabled: string;
  mode?: string;
  'server-dns-names'?: string;
  servers?: string;
  status?: string;
  'synced-server'?: string;
  'synced-stratum'?: string;
  'system-offset'?: string;
}

export type ConnectionStatus = 'not-connected' | 'connecting' | 'connected' | 'disconnected' | 'error';
