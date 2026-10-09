import type { IncomingMessage, ServerResponse } from 'node:http';
import { scanMndp } from './mndp.ts';
import { globalRouterManager } from './router-manager.ts';
import type { ConnectRequest } from './types.ts';

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (!pathname.startsWith('/api/router/')) {
    return false;
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  const readJsonBody = async <T>(): Promise<T> => {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  };

  const sendJson = (statusCode: number, payload: unknown) => {
    res.statusCode = statusCode;
    res.end(JSON.stringify(payload));
  };

  try {
    // 1. MNDP Scan
    if (pathname === '/api/router/scan') {
      const timeout = Number(url.searchParams.get('timeout')) || 3500;
      const devices = await scanMndp(timeout);
      sendJson(200, {
        success: true,
        count: devices.length,
        devices,
      });
      return true;
    }

    // 2. Connect
    if (pathname === '/api/router/connect' && req.method === 'POST') {
      const body = await readJsonBody<ConnectRequest>();
      if (!body.host || !body.username) {
        sendJson(400, { success: false, error: 'Host dan username wajib diisi' });
        return true;
      }
      const resource = await globalRouterManager.connect(body);
      sendJson(200, {
        success: true,
        resource,
        protocol: globalRouterManager.getActiveProtocol(),
      });
      return true;
    }

    // 3. Disconnect
    if (pathname === '/api/router/disconnect' && req.method === 'POST') {
      globalRouterManager.disconnect();
      sendJson(200, { success: true, message: 'Disconnected' });
      return true;
    }

    // 4. Status
    if (pathname === '/api/router/status' && req.method === 'GET') {
      const connected = globalRouterManager.isConnected();
      const resource = globalRouterManager.getCachedResource();
      const config = globalRouterManager.getCurrentConfig();
      const protocol = globalRouterManager.getActiveProtocol();
      sendJson(200, {
        connected,
        protocol,
        resource,
        host: config?.host,
        identity: resource?.identity,
      });
      return true;
    }

    // 5. Overview (Dashboard metrics)
    if (pathname === '/api/router/overview' && req.method === 'GET') {
      const overview = await globalRouterManager.getOverview();
      sendJson(200, overview);
      return true;
    }

    // 6. Generic Query (print, add, set, remove)
    if (pathname === '/api/router/query' && req.method === 'POST') {
      const body = await readJsonBody<{
        action: 'print' | 'add' | 'set' | 'remove' | 'call';
        path: string;
        data?: Record<string, string>;
        id?: string;
      }>();

      if (!globalRouterManager.isConnected()) {
        sendJson(400, { success: false, error: 'Router belum terhubung' });
        return true;
      }

      if (body.action === 'print') {
        const rows = await globalRouterManager.print(body.path, body.data);
        sendJson(200, { success: true, data: rows });
        return true;
      } else if (body.action === 'add') {
        const id = await globalRouterManager.add(body.path, body.data || {});
        sendJson(200, { success: true, id });
        return true;
      } else if (body.action === 'set') {
        if (!body.id) throw new Error('ID wajib diisi untuk set');
        await globalRouterManager.set(body.path, body.id, body.data || {});
        sendJson(200, { success: true });
        return true;
      } else if (body.action === 'call') {
        const rows = await globalRouterManager.call(body.path, body.data || {});
        sendJson(200, { success: true, data: rows });
        return true;
      } else if (body.action === 'remove') {
        if (!body.id) throw new Error('ID wajib diisi untuk remove');
        await globalRouterManager.remove(body.path, body.id);
        sendJson(200, { success: true });
        return true;
      } else {
        sendJson(400, { success: false, error: `Aksi ${body.action} tidak didukung` });
        return true;
      }
    }

    sendJson(404, { success: false, error: 'API route not found' });
    return true;
  } catch (err: any) {
    console.error(`[API Error] ${pathname}:`, err);
    sendJson(500, {
      success: false,
      error: err.message || 'Terjadi kesalahan pada backend',
    });
    return true;
  }
}
