import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';

const VALID_SECRET = 'x'.repeat(40);
let savedEnv;

beforeEach(() => {
  savedEnv = { ...process.env };
  Object.assign(process.env, {
    POSTGRES_DB: 'db',
    POSTGRES_USER: 'user',
    POSTGRES_PASSWORD: 'pw',
    JWT_SECRET: VALID_SECRET,
  });
  for (const key of ['NODE_ENV', 'COOKIE_SECURE', 'CORS_ORIGIN', 'JWT_TTL_SECONDS']) {
    delete process.env[key];
  }
});

afterEach(() => {
  process.env = savedEnv;
});

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    const config = loadConfig();
    expect(config.port).toBe(4000);
    expect(config.corsOrigins).toEqual(['http://localhost:5173']);
    expect(config.auth.tokenTtlSeconds).toBe(3600);
    expect(config.auth.cookieSecure).toBe(false);
  });

  it('uses Secure cookies by default in production', () => {
    process.env.NODE_ENV = 'production';
    expect(loadConfig().auth.cookieSecure).toBe(true);
  });

  it('accepts a comma-separated list of CORS origins', () => {
    process.env.CORS_ORIGIN = 'http://localhost:5173, https://shop.example ';
    expect(loadConfig().corsOrigins).toEqual(['http://localhost:5173', 'https://shop.example']);
  });

  it.each([
    ['missing', undefined],
    ['too short', 'short'],
    ['the .env.example placeholder', 'change-me-generate-a-long-random-string'],
  ])('rejects a JWT_SECRET that is %s', (_label, value) => {
    if (value === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = value;
    expect(() => loadConfig()).toThrow(/JWT_SECRET/);
  });

  it('rejects invalid numbers', () => {
    process.env.JWT_TTL_SECONDS = 'soon';
    expect(() => loadConfig()).toThrow(/JWT_TTL_SECONDS/);
  });
});
