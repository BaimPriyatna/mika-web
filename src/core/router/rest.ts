/**
 * REST Transport untuk RouterOS v7
 * Sesuai DEV-SPEC.md §7
 */

import type { RouterConfig, RouterTransport } from './types';
import { AuthError, CorsBlockedError, NetworkError, RouterApiError } from './errors';

export class RestTransport implements RouterTransport {
  readonly kind = 'rest' as const;
  
  private config: RouterConfig | null = null;
  private baseUrl = '';

  async connect(cfg: RouterConfig): Promise<void> {
    this.config = cfg;
    this.baseUrl = `${cfg.scheme}://${cfg.host}:${cfg.port}`;
    
    // Test connection dengan /rest/system/resource
    try {
      await this.print('/system/resource');
    } catch (error) {
      if (error instanceof TypeError) {
        // CORS error biasanya muncul sebagai TypeError
        if (error.message.includes('fetch') || error.message.includes('network')) {
          throw new CorsBlockedError(
            'CORS blocked atau router tidak dapat dijangkau. Gunakan aplikasi desktop atau periksa service www/www-ssl di router.'
          );
        }
      }
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.config = null;
    this.baseUrl = '';
  }

  /**
   * GET request - print/list
   */
  async print<T>(path: string, query?: Record<string, string>): Promise<T[]> {
    const url = new URL(`${this.baseUrl}/rest${path}`);
    
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    const response = await this.fetch(url.toString(), {
      method: 'GET',
    });

    return response.json();
  }

  /**
   * PUT request - add
   * Returns the .id of created resource
   */
  async add(path: string, body: Record<string, string>): Promise<string> {
    const url = `${this.baseUrl}/rest${path}`;
    
    const response = await this.fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const location = response.headers.get('Location');
    if (!location) {
      throw new RouterApiError('No Location header in add response');
    }

    // Location format: "/rest/ip/hotspot/user/*1"
    // Extract ID dari URL
    const match = location.match(/\*([^/]+)$/);
    if (!match) {
      throw new RouterApiError(`Cannot parse ID from Location: ${location}`);
    }

    return match[1];
  }

  /**
   * PATCH request - set/update
   */
  async set(path: string, id: string, body: Record<string, string>): Promise<void> {
    const url = `${this.baseUrl}/rest${path}/*${id}`;
    
    await this.fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  /**
   * DELETE request - remove
   */
  async remove(path: string, id: string): Promise<void> {
    const url = `${this.baseUrl}/rest${path}/*${id}`;
    
    await this.fetch(url, {
      method: 'DELETE',
    });
  }

  /**
   * POST request - call/execute command
   */
  async call<T>(path: string, body?: Record<string, string>): Promise<T[]> {
    const url = `${this.baseUrl}/rest${path}`;
    
    const response = await this.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    return response.json();
  }

  /**
   * Wrapper fetch dengan auth dan error handling
   */
  private async fetch(url: string, options: RequestInit): Promise<Response> {
    if (!this.config) {
      throw new Error('Transport not connected');
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': this.getAuthHeader(),
        },
      });

      // Handle HTTP errors
      if (response.status === 401 || response.status === 403) {
        throw new AuthError('Authentication failed. Check username and password.');
      }

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        // Try to get error detail dari response body
        try {
          const errorBody = await response.text();
          if (errorBody) {
            errorMessage += ` - ${errorBody}`;
          }
        } catch {
          // Ignore parse error
        }
        
        throw new RouterApiError(errorMessage);
      }

      return response;
    } catch (error) {
      if (error instanceof AuthError || error instanceof RouterApiError) {
        throw error;
      }

      if (error instanceof TypeError) {
        throw new NetworkError(`Network error: ${error.message}`);
      }

      throw error;
    }
  }

  /**
   * Generate Basic Auth header
   */
  private getAuthHeader(): string {
    if (!this.config) {
      throw new Error('Transport not connected');
    }
    
    const credentials = `${this.config.username}:${this.config.password}`;
    const encoded = btoa(credentials);
    return `Basic ${encoded}`;
  }
}
