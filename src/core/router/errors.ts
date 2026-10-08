/**
 * Router custom errors
 * Sesuai DEV-SPEC.md §10
 */

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class CorsBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorsBlockedError';
  }
}

export class RouterApiError extends Error {
  code?: string;
  
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'RouterApiError';
    this.code = code;
  }
}

export class VersionUnsupportedError extends Error {
  constructor(version: string, minVersion: string) {
    super(`RouterOS version ${version} is not supported. Minimum version: ${minVersion}`);
    this.name = 'VersionUnsupportedError';
  }
}

export class ClockNotSyncedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClockNotSyncedError';
  }
}

export class ValidationError extends Error {
  field?: string;
  
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}
