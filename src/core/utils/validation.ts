/**
 * Validation helpers untuk RouterOS data
 * Sesuai DEV-SPEC.md
 */

/**
 * Validasi format duration RouterOS
 * Format: angka + unit (s/m/h/d/w)
 * Contoh: "1h", "30m", "1d", "1w2d"
 */
export function isValidDuration(duration: string): boolean {
  if (!duration) return false;
  
  // Pattern: kombinasi angka + unit
  const pattern = /^(\d+[smhdw])+$/;
  return pattern.test(duration);
}

/**
 * Validasi format rate limit RouterOS
 * Format: "rx/tx" dimana rx dan tx adalah angka + unit (k/M)
 * Contoh: "2M/5M", "512k/1M"
 */
export function isValidRateLimit(rateLimit: string): boolean {
  if (!rateLimit) return false;
  
  const parts = rateLimit.split('/');
  if (parts.length !== 2) return false;
  
  // Setiap part harus angka + k atau M
  const speedPattern = /^\d+[kM]$/;
  return parts.every(part => speedPattern.test(part));
}

/**
 * Validasi format speed
 * Format: angka + k atau M
 * Contoh: "2M", "512k"
 */
export function isValidSpeed(speed: string): boolean {
  if (!speed) return false;
  return /^\d+[kM]$/.test(speed);
}

/**
 * Validasi IP address (IPv4)
 */
export function isValidIPv4(ip: string): boolean {
  const pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!pattern.test(ip)) return false;
  
  const parts = ip.split('.');
  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}

/**
 * Validasi hostname
 */
export function isValidHostname(hostname: string): boolean {
  // Hostname atau IP
  if (isValidIPv4(hostname)) return true;
  
  // Hostname pattern
  const pattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return pattern.test(hostname);
}

/**
 * Validasi port number
 */
export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * Validasi MAC address
 */
export function isValidMacAddress(mac: string): boolean {
  // Format: XX:XX:XX:XX:XX:XX atau XX-XX-XX-XX-XX-XX
  const pattern = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  return pattern.test(mac);
}

/**
 * Validasi username voucher (hanya A-Z dan 2-9, panjang 6)
 */
export function isValidVoucherCode(code: string): boolean {
  if (code.length !== 6) return false;
  
  // Hanya huruf besar dan angka (tanpa 0,1,i,l,o)
  if (!/^[A-Z2-9]+$/.test(code)) return false;
  
  // Harus ada minimal 1 huruf dan 1 angka
  const hasLetter = /[A-Z]/.test(code);
  const hasDigit = /[2-9]/.test(code);
  
  return hasLetter && hasDigit;
}

/**
 * Validasi nama profil (tidak boleh kosong, no special chars berbahaya)
 */
export function isValidProfileName(name: string): boolean {
  if (!name || name.trim().length === 0) return false;
  
  // Hindari karakter yang bisa bermasalah di RouterOS
  // Boleh: alphanumeric, space, dash, underscore
  const pattern = /^[a-zA-Z0-9 _-]+$/;
  return pattern.test(name) && name.length <= 50;
}

/**
 * Validasi harga (harus positif)
 */
export function isValidPrice(price: number): boolean {
  return Number.isFinite(price) && price >= 0;
}

/**
 * Validasi quantity voucher (1-8)
 */
export function isValidVoucherQuantity(qty: number): boolean {
  return Number.isInteger(qty) && qty >= 1 && qty <= 8;
}

/**
 * Sanitasi string untuk RouterOS script
 * Escape karakter berbahaya untuk mencegah injection
 */
export function sanitizeForRouterOS(input: string): string {
  // Escape backslash, quotes, dan newlines
  return input
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\$/g, '\\$');
}

/**
 * Validasi comment field (untuk batch ID di user)
 */
export function isValidComment(comment: string): boolean {
  // Max length reasonable untuk comment
  if (comment.length > 200) return false;
  
  // Tidak boleh mengandung karakter control
  return !/[\x00-\x1F\x7F]/.test(comment);
}

/**
 * Parse dan validasi bytes limit (untuk kuota)
 */
export function parseByteLimit(input: string): number | null {
  const upper = input.toUpperCase().trim();
  
  // Pattern: angka + unit (K, M, G, T)
  const match = upper.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?)B?$/);
  if (!match) return null;
  
  const value = parseFloat(match[1]);
  const unit = match[2] || '';
  
  const multipliers: Record<string, number> = {
    '': 1,
    'K': 1024,
    'M': 1024 * 1024,
    'G': 1024 * 1024 * 1024,
    'T': 1024 * 1024 * 1024 * 1024,
  };
  
  return Math.floor(value * multipliers[unit]);
}
