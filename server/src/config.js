import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const requiredEnv = ['DATABASE_URL', 'JWT_SECRET', 'AES_KEY'];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable ${key}`);
    process.exit(1);
  }
}

function deriveAesKey(rawKey) {
  const trimmed = rawKey.trim();
  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  const hexRegex = /^[0-9a-fA-F]+$/;

  if (hexRegex.test(trimmed)) {
    const buf = Buffer.from(trimmed, 'hex');
    if (buf.length === 32) {
      return buf;
    }
  }

  if (base64Regex.test(trimmed)) {
    const buf = Buffer.from(trimmed, 'base64');
    if (buf.length === 32) {
      return buf;
    }
  }

  // As a last resort, hash the value to ensure 32 bytes while warning.
  console.warn('AES_KEY is not 32 bytes in hex or base64 form. Deriving key using SHA-256 hash.');
  return crypto.createHash('sha256').update(trimmed).digest();
}

export const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
export const JWT_SECRET = process.env.JWT_SECRET;
export const AES_KEY = deriveAesKey(process.env.AES_KEY);
export const DATABASE_URL = process.env.DATABASE_URL;
