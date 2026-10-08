/**
 * Core type definitions for the MikroTik Hotspot Voucher Manager
 */

// ============================================================================
// Router Configuration & Transport
// ============================================================================

export interface RouterConfig {
  name: string;
  host: string;
  port: number; // 80/443 (REST), 8728/8729 (API)
  scheme: 'http' | 'https';
  username: string;
  password: string; // only in memory at runtime
  allowSelfSigned?: boolean; // only effective in wrapper
}

export interface RouterTransport {
  readonly kind: 'rest' | 'api';
  connect(cfg: RouterConfig): Promise<void>;
  disconnect(): Promise<void>;
  print<T>(path: string, query?: Record<string, string>): Promise<T[]>;
  add(path: string, body: Record<string, string>): Promise<string>; // return id
  set(path: string, id: string, body: Record<string, string>): Promise<void>;
  remove(path: string, id: string): Promise<void>;
  call<T>(path: string, body?: Record<string, string>): Promise<T[]>;
}

export interface RawSocket {
  open(
    host: string,
    port: number,
    opts?: { tls?: boolean; allowSelfSigned?: boolean }
  ): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  onData(cb: (chunk: Uint8Array) => void): void;
  close(): Promise<void>;
}

// ============================================================================
// System Information
// ============================================================================

export interface SystemResource {
  version: string;
  boardName: string;
  platform: string;
  uptime: string;
  cpuLoad: number;
  freeMemory: number;
  totalMemory: number;
}

export interface SystemClock {
  date: string;
  time: string;
  timeZone: string;
  gmtOffset: string;
}

export interface NtpClient {
  enabled: boolean;
  mode: string;
  servers: string[];
  status: string;
}

// ============================================================================
// Hotspot Profile
// ============================================================================

export interface HotspotProfile {
  id: string;
  name: string;
  rateLimit: string; // "rx/tx", example "2M/5M"
  sharedUsers: 1; // locked to 1
  validity?: string; // "3h", "1d", "30d": counted from first login
  idleTimeout?: string;
  keepaliveTimeout?: string;
  addressPool?: string;
  macCookieTimeout?: string;
  onLogin?: string; // script name
}

// ============================================================================
// Voucher Plans & Batches
// ============================================================================

export interface VoucherPlan {
  id: string;
  label: string; // "Paket 1 Hari"
  profileName: string; // HotspotProfile.name (source of speed + validity)
  price: number; // IDR
  limitBytesTotal?: number; // optional quota
  createdAt: number;
}

export interface VoucherBatch {
  id: string;
  planId: string;
  qty: number;
  createdAt: number;
  printedAt?: number;
  samePassword: boolean; // mode: user = password
  codes: VoucherCode[];
}

export interface VoucherCode {
  user: string; // 6 characters
  pass: string; // 6 characters
}

// ============================================================================
// Hotspot Users
// ============================================================================

export interface HotspotUser {
  id: string;
  name: string;
  password: string;
  profile: string;
  comment?: string;
  disabled?: boolean;
  bytesIn?: number;
  bytesOut?: number;
  packetsIn?: number;
  packetsOut?: number;
}

// ============================================================================
// Active Sessions & Leases
// ============================================================================

export interface HotspotActive {
  id: string;
  user: string;
  address: string;
  macAddress: string;
  loginBy: string;
  uptime: string;
  sessionTimeLeft?: string;
  idleTime: string;
  bytesIn: number;
  bytesOut: number;
  packetsIn: number;
  packetsOut: number;
}

export interface HotspotHost {
  id: string;
  macAddress: string;
  address: string;
  toAddress: string;
  server: string;
  uptime: string;
  bytesIn: number;
  bytesOut: number;
  packetsIn: number;
  packetsOut: number;
  authorized: boolean;
}

export interface DhcpLease {
  id: string;
  address: string;
  macAddress: string;
  clientId?: string;
  hostname?: string;
  status: string;
  expiresAfter?: string;
  lastSeen?: string;
  server: string;
  dynamic: boolean;
  blocked: boolean;
  disabled: boolean;
}

// ============================================================================
// MNDP (MikroTik Neighbor Discovery Protocol)
// ============================================================================

export interface MndpDevice {
  macAddress: string;
  identity: string;
  version: string;
  platform: string;
  interface: string;
  ipAddress: string;
  softwareId: string;
  uptime: string;
}

// ============================================================================
// Scripts & Schedulers
// ============================================================================

export interface SystemScript {
  id: string;
  name: string;
  source: string;
  owner: string;
  lastStarted?: string;
  runCount: number;
}

export interface SystemScheduler {
  id: string;
  name: string;
  startDate: string;
  startTime: string;
  interval: string;
  onEvent: string;
  nextRun?: string;
  runCount: number;
  disabled: boolean;
}

// ============================================================================
// Database Schemas
// ============================================================================

export interface RouterConfigDB {
  id?: number;
  name: string;
  host: string;
  port: number;
  scheme: 'http' | 'https';
  encryptedCredentials: string; // AES-GCM encrypted JSON: {username, password}
  iv: string; // base64
  salt: string; // base64
  allowSelfSigned?: boolean;
  updatedAt: number;
}

export interface AppSettings {
  key: string;
  value: string;
}

// ============================================================================
// Application State
// ============================================================================

export type ConnectionStatus =
  | 'not-connected'
  | 'connecting'
  | 'connected'
  | 'disconnected';

export type Theme = 'light' | 'dark' | 'system';

// ============================================================================
// Validation & Errors
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface VoucherGenerationResult {
  success: VoucherCode[];
  failed: VoucherGenerationFailure[];
}

export interface VoucherGenerationFailure {
  index: number;
  code?: VoucherCode;
  error: string;
}
