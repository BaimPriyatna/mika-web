/**
 * Format utilities untuk display
 * Sesuai DEV-SPEC.md
 */

/**
 * Format bytes ke string readable (KB, MB, GB)
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format currency IDR
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format uptime dari detik ke string readable
 * Contoh: 86400 → "1 hari", 3661 → "1 jam 1 menit"
 */
export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds} detik`;
  
  const units = [
    { name: 'minggu', value: 604800 },
    { name: 'hari', value: 86400 },
    { name: 'jam', value: 3600 },
    { name: 'menit', value: 60 },
  ];
  
  const parts: string[] = [];
  let remaining = seconds;
  
  for (const unit of units) {
    if (remaining >= unit.value) {
      const count = Math.floor(remaining / unit.value);
      parts.push(`${count} ${unit.name}`);
      remaining -= count * unit.value;
      
      // Hanya tampilkan 2 unit terbesar
      if (parts.length === 2) break;
    }
  }
  
  return parts.join(' ') || `${seconds} detik`;
}

/**
 * Format RouterOS uptime string (format: 1w2d3h4m5s) ke readable
 */
export function formatRouterOSUptime(uptime: string): string {
  const regex = /(\d+)([wdhms])/g;
  const parts: string[] = [];
  let match;
  
  const unitMap: Record<string, string> = {
    w: 'minggu',
    d: 'hari',
    h: 'jam',
    m: 'menit',
    s: 'detik',
  };
  
  while ((match = regex.exec(uptime)) !== null) {
    const value = match[1];
    const unit = match[2];
    parts.push(`${value} ${unitMap[unit]}`);
  }
  
  return parts.slice(0, 2).join(' ') || uptime;
}

/**
 * Format speed dari string RouterOS (misal "2M") ke readable
 */
export function formatSpeed(speed: string | undefined): string {
  if (!speed) return '-';
  
  // Sudah dalam format yang baik (2M, 512k, dll)
  return speed.toUpperCase().replace('K', 'k');
}

/**
 * Format rate limit (rx/tx) ke download/upload user-friendly
 * RouterOS: rx/tx dari sudut pandang router
 * User-friendly: Download/Upload dari sudut pandang user
 */
export function formatRateLimit(rateLimit: string | undefined): string {
  if (!rateLimit) return '-';
  
  const parts = rateLimit.split('/');
  if (parts.length !== 2) return rateLimit;
  
  // rx = upload user, tx = download user
  const upload = formatSpeed(parts[0]);
  const download = formatSpeed(parts[1]);
  
  return `↓ ${download} / ↑ ${upload}`;
}

/**
 * Parse speed input dari user (misal "2M", "512k") ke format RouterOS
 */
export function parseSpeedInput(input: string): string {
  const cleaned = input.trim().toUpperCase();
  
  // Jika sudah ada unit (M, K), kembalikan
  if (/^\d+[KM]$/i.test(cleaned)) {
    return cleaned;
  }
  
  // Jika pure number, assume Mbps
  if (/^\d+$/.test(cleaned)) {
    return `${cleaned}M`;
  }
  
  throw new Error('Format speed tidak valid. Gunakan format: 2M, 512k');
}

/**
 * Format validity duration ke bahasa Indonesia
 */
export function formatValidity(validity: string | undefined): string {
  if (!validity) return 'Tidak terbatas';
  
  const regex = /(\d+)([smhdw])/g;
  const parts: string[] = [];
  let match;
  
  const unitMap: Record<string, string> = {
    s: 'detik',
    m: 'menit',
    h: 'jam',
    d: 'hari',
    w: 'minggu',
  };
  
  while ((match = regex.exec(validity)) !== null) {
    const value = match[1];
    const unit = match[2];
    parts.push(`${value} ${unitMap[unit]}`);
  }
  
  return parts.join(' ') || validity;
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format MAC address dengan separator ":"
 */
export function formatMacAddress(mac: string | undefined): string {
  if (!mac) return '-';
  
  // RouterOS biasanya pakai : atau -, normalize ke :
  return mac.toUpperCase().replace(/-/g, ':');
}

/**
 * Truncate string dengan ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}
