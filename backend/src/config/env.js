// Reads and validates API configuration from environment variables once at startup,
// so a misconfigured server fails fast instead of failing on the first request.
import { getDatabaseConfig } from './database.js';

const MIN_JWT_SECRET_LENGTH = 32;

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
}

export function loadConfig() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be set and at least ${MIN_JWT_SECRET_LENGTH} characters long`);
  }
  if (jwtSecret.startsWith('change-me')) {
    throw new Error('JWT_SECRET still has the placeholder value from .env.example');
  }

  return {
    nodeEnv,
    port: intFromEnv('API_PORT', 4000),
    db: getDatabaseConfig(),
    corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    auth: {
      jwtSecret,
      tokenTtlSeconds: intFromEnv('JWT_TTL_SECONDS', 3600),
      bcryptRounds: intFromEnv('BCRYPT_ROUNDS', 12),
      // Browsers only send Secure cookies over HTTPS; local development runs on plain HTTP.
      cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProduction,
    },
    loginRateLimit: {
      windowMs: intFromEnv('LOGIN_RATE_LIMIT_WINDOW_MINUTES', 15) * 60 * 1000,
      max: intFromEnv('LOGIN_RATE_LIMIT_MAX', 10),
    },
  };
}
