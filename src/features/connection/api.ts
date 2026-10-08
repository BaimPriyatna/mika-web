export interface DiscoveredDevice {
  macAddress: string;
  identity: string;
  platform: string;
  version: string;
  board: string;
  ipAddress: string | null;
  ipv6Address: string | null;
  interfaceName: string | null;
  uptimeSeconds: number;
  softwareId: string;
  displayHost: string;
}

export interface ConnectRequest {
  name?: string;
  host: string;
  port?: number;
  scheme?: 'http' | 'https';
  username: string;
  password: string;
  protocol?: 'auto' | 'rest' | 'binary';
}

export interface RouterSystemResource {
  version: string;
  boardName: string;
  platform: string;
  cpu: string;
  cpuCount: number;
  cpuFrequency: number;
  cpuLoad: number;
  freeMemory: number;
  totalMemory: number;
  freeHddSpace: number;
  totalHddSpace: number;
  uptime: string;
  architecture: string;
  identity: string;
}

export interface RouterOverview {
  connected: boolean;
  config: {
    host: string;
    port: number;
    username: string;
    protocol: 'rest' | 'binary';
  } | null;
  resource: RouterSystemResource | null;
  interfacesCount: number;
  activeHotspotUsersCount: number;
  totalHotspotUsersCount: number;
  dhcpLeasesCount: number;
  hotspotServersCount: number;
  error?: string | null;
}

export async function scanRouters(timeout = 3500): Promise<DiscoveredDevice[]> {
  const res = await fetch(`/api/router/scan?timeout=${timeout}`);
  if (!res.ok) {
    throw new Error(`Gagal memindai router (HTTP ${res.status})`);
  }
  const data = await res.json();
  return data.devices || [];
}

export async function connectRouter(req: ConnectRequest): Promise<{ resource: RouterSystemResource; protocol: string }> {
  const res = await fetch('/api/router/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Gagal terhubung ke router');
  }

  return { resource: data.resource, protocol: data.protocol };
}

export async function disconnectRouter(): Promise<void> {
  await fetch('/api/router/disconnect', { method: 'POST' });
}

export async function getRouterStatus(): Promise<{
  connected: boolean;
  protocol?: 'rest' | 'binary';
  resource?: RouterSystemResource;
  host?: string;
  identity?: string;
}> {
  const res = await fetch('/api/router/status');
  if (!res.ok) return { connected: false };
  return res.json();
}

export async function getRouterOverview(): Promise<RouterOverview> {
  const res = await fetch('/api/router/overview');
  if (!res.ok) {
    throw new Error('Gagal mengambil ringkasan router');
  }
  return res.json();
}

export async function queryRouter<T = any>(
  action: 'print' | 'add' | 'set' | 'remove',
  path: string,
  data?: Record<string, string>,
  id?: string
): Promise<T> {
  const res = await fetch('/api/router/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, path, data, id }),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Gagal menjalankan query ${action}`);
  }

  // Untuk action 'print', data ada di json.data (array)
  // Untuk action 'add', ID ada di json.id
  // Untuk action 'set' dan 'remove', tidak ada data return
  if (action === 'print') {
    return json.data as T;
  } else if (action === 'add') {
    return json.id as T;
  }
  
  return json as T;
}
