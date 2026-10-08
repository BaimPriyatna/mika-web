/**
 * Konstanta aplikasi
 * Sesuai DEV-SPEC.md §5
 */

// Voucher generation
export const MAX_VOUCHERS_PER_BATCH = 8;
export const CODE_LENGTH = 6;
export const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const DIGITS = '23456789';

// Router API
export const DEFAULT_REST_PORT = 80;
export const DEFAULT_REST_SSL_PORT = 443;
export const DEFAULT_API_PORT = 8728;
export const DEFAULT_API_SSL_PORT = 8729;

// Encryption
export const PBKDF2_ITERATIONS = 100000;
export const AES_KEY_LENGTH = 256;

// Voucher prefix
export const VOUCHER_PREFIX = 'vm';
export const SCHEDULER_PREFIX = 'vm-';

// Auto-refresh intervals (ms)
export const DEVICE_REFRESH_INTERVAL = 10000;
export const DASHBOARD_REFRESH_INTERVAL = 10000;

// PDF Layout (mm)
export const PDF_PAGE_WIDTH = 210;
export const PDF_PAGE_HEIGHT = 297;
export const VOUCHER_WIDTH = 85;
export const VOUCHER_HEIGHT = 54;
export const VOUCHER_MARGIN_X = 10;
export const VOUCHER_MARGIN_Y_DEFAULT = 15;
export const VOUCHER_COLS = 2;
export const VOUCHER_ROWS = 4;
