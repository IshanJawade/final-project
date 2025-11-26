import { config } from 'dotenv';
import ms from 'ms';
import { z } from 'zod';

config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z.string().optional(),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('strict'),
  LOCKOUT_THRESHOLD: z.coerce.number().default(5),
  LOCKOUT_DURATION_MINUTES: z.coerce.number().default(15),
  SYSTEM_VERIFIED: z.string().default('false'),
  HTTPS_ONLY: z.string().optional(),
  LOG_DIR: z.string().default('./logs'),
  FILE_STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  FILE_STORAGE_DIR: z.string().default('./uploads'),
  FILE_MAX_BYTES: z.coerce.number().default(20 * 1024 * 1024),
  FILE_SIGNING_SECRET: z.string().min(16).default('replace_this_download_secret'),
  FILE_DOWNLOAD_TTL_SECONDS: z.coerce.number().min(60).default(300)
});

const parsed = EnvSchema.parse(process.env);

const toBool = (value?: string) => (value ? value.toLowerCase() === 'true' : false);

type MsInput = Parameters<typeof ms>[0];

const toDurationMs = (value: string, fallback: string) => {
  const parsedValue = ms(value as MsInput);
  if (typeof parsedValue === 'number') {
    return parsedValue;
  }
  const fallbackValue = ms(fallback as MsInput);
  if (typeof fallbackValue !== 'number') {
    throw new Error(`Invalid duration value: ${value}`);
  }
  return fallbackValue;
};

export const env = {
  ...parsed,
  COOKIE_SAME_SITE: parsed.COOKIE_SAME_SITE.toLowerCase() as 'strict' | 'lax' | 'none',
  ACCESS_TOKEN_TTL_MS: toDurationMs(parsed.ACCESS_TOKEN_EXPIRES_IN, '15m'),
  REFRESH_TOKEN_TTL_MS: toDurationMs(parsed.REFRESH_TOKEN_EXPIRES_IN, '7d'),
  SYSTEM_VERIFIED: toBool(parsed.SYSTEM_VERIFIED),
  COOKIE_SECURE_FLAG: parsed.COOKIE_SECURE ? toBool(parsed.COOKIE_SECURE) : parsed.NODE_ENV === 'production',
  HTTPS_ONLY: toBool(parsed.HTTPS_ONLY),
  FILE_STORAGE_DRIVER: parsed.FILE_STORAGE_DRIVER,
  FILE_STORAGE_DIR: parsed.FILE_STORAGE_DIR,
  FILE_MAX_BYTES: parsed.FILE_MAX_BYTES,
  FILE_SIGNING_SECRET: parsed.FILE_SIGNING_SECRET,
  FILE_DOWNLOAD_TTL_MS: parsed.FILE_DOWNLOAD_TTL_SECONDS * 1000
};
