import QRCode from 'qrcode';

/**
 * Buat login URL dengan query parameters username dan password
 */
export function buildLoginUrl(baseUrl: string, username: string, password: string): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('username', username);
    url.searchParams.set('password', password);
    return url.toString();
  } catch {
    // Fallback jika baseUrl bukan URL absolut lengkap
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  }
}

/**
 * Generate QR code sebagai PNG data URL
 */
export async function generateQRCode(text: string, size = 200): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });
}
