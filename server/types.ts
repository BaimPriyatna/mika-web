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
  allowSelfSigned?: boolean;
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
