export interface RestClientOptions {
  host: string;
  port?: number;
  scheme?: 'http' | 'https';
  username: string;
  password: string;
  timeoutMs?: number;
}

export class RestRouterClient {
  private baseUrl: string;
  private authHeader: string;
  private timeoutMs: number;

  constructor(options: RestClientOptions) {
    const scheme = options.scheme || 'http';
    const port = options.port || (scheme === 'https' ? 443 : 80);
    this.baseUrl = `${scheme}://${options.host}:${port}/rest`;
    const creds = Buffer.from(`${options.username}:${options.password}`).toString('base64');
    this.authHeader = `Basic ${creds}`;
    this.timeoutMs = options.timeoutMs || 10000;
  }

  async testConnection(): Promise<Record<string, string>> {
    const res = await this.print('/system/resource');
    if (!res || res.length === 0) {
      throw new Error('Tidak menerima respon dari /system/resource');
    }
    return res[0];
  }

  async print(path: string, query?: Record<string, string>): Promise<Record<string, string>[]> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${cleanPath}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        url.searchParams.set(k, v);
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        throw new Error('Autentikasi REST gagal: username atau password salah');
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`REST Error HTTP ${response.status}: ${text || response.statusText}`);
      }

      const data = (await response.json()) as Record<string, string> | Record<string, string>[];
      return Array.isArray(data) ? data : [data];
    } finally {
      clearTimeout(timer);
    }
  }

  async add(path: string, body: Record<string, string>): Promise<string> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${this.baseUrl}${cleanPath}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`REST Add Error HTTP ${response.status}: ${text || response.statusText}`);
    }

    const loc = response.headers.get('Location');
    if (loc) {
      const match = loc.match(/\*([^/]+)$/);
      if (match) return match[1];
    }

    try {
      const data = (await response.json()) as Record<string, string>;
      return data['.id'] || data['ret'] || '';
    } catch {
      return '';
    }
  }

  async set(path: string, id: string, body: Record<string, string>): Promise<void> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const formattedId = id.startsWith('*') ? id : `*${id}`;
    const url = `${this.baseUrl}${cleanPath}/${formattedId}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`REST Set Error HTTP ${response.status}: ${text || response.statusText}`);
    }
  }

  async remove(path: string, id: string): Promise<void> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const formattedId = id.startsWith('*') ? id : `*${id}`;
    const url = `${this.baseUrl}${cleanPath}/${formattedId}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: this.authHeader,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`REST Delete Error HTTP ${response.status}: ${text || response.statusText}`);
    }
  }
}
