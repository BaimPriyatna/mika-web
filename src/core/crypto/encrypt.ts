/**
 * WebCrypto wrapper untuk enkripsi kredensial
 * PBKDF2 (100k iterations, SHA-256) + AES-GCM (256-bit)
 * Sesuai DEV-SPEC.md §3 & §9
 */

import { PBKDF2_ITERATIONS, AES_KEY_LENGTH } from '../constants';

/**
 * Generate random salt untuk PBKDF2
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Generate random IV untuk AES-GCM
 */
export function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12));
}

/**
 * Derive key dari passphrase menggunakan PBKDF2
 */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  // Import passphrase sebagai key material
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive key menggunakan PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: AES_KEY_LENGTH,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data menggunakan AES-GCM
 * Returns base64 encoded encrypted data dan IV
 */
export async function encrypt(
  data: string,
  key: CryptoKey
): Promise<{ encrypted: string; iv: string }> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  
  const iv = generateIV();
  
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
    },
    key,
    dataBuffer as BufferSource
  );

  return {
    encrypted: bufferToBase64(encryptedBuffer),
    iv: bufferToBase64(iv),
  };
}

/**
 * Decrypt data menggunakan AES-GCM
 */
export async function decrypt(
  encryptedData: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  const encryptedBuffer = base64ToBuffer(encryptedData);
  const ivBuffer = base64ToBuffer(iv);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBuffer as BufferSource,
    },
    key,
    encryptedBuffer as BufferSource
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/**
 * Helper: ArrayBuffer to base64 string
 */
function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array 
    ? buffer 
    : new Uint8Array(buffer);
  
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  
  return btoa(binary);
}

/**
 * Helper: base64 string to ArrayBuffer
 */
function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  
  return bytes;
}

/**
 * Encrypt kredensial router untuk storage
 */
export async function encryptCredentials(
  username: string,
  password: string,
  passphrase: string
): Promise<{ encrypted: string; iv: string; salt: string }> {
  const salt = generateSalt();
  const key = await deriveKey(passphrase, salt);
  
  const credentials = JSON.stringify({ username, password });
  const { encrypted, iv } = await encrypt(credentials, key);
  
  return {
    encrypted,
    iv,
    salt: bufferToBase64(salt),
  };
}

/**
 * Decrypt kredensial router dari storage
 */
export async function decryptCredentials(
  encryptedData: string,
  iv: string,
  salt: string,
  passphrase: string
): Promise<{ username: string; password: string }> {
  const saltBuffer = base64ToBuffer(salt);
  const key = await deriveKey(passphrase, saltBuffer);
  
  const decrypted = await decrypt(encryptedData, iv, key);
  return JSON.parse(decrypted);
}
