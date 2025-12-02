import crypto from 'crypto';
import { AES_KEY } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Recommended length for GCM
const TAG_LENGTH = 16;

export function encryptJson(data) {
  const plainText = typeof data === 'string' ? data : JSON.stringify(data);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, AES_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  });
}

export function decryptJson(serialized) {
  const payload = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
  const { iv, tag, ciphertext } = payload;
  if (!iv || !tag || !ciphertext) {
    throw new Error('Invalid encrypted payload');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, AES_KEY, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);

  const text = decrypted.toString('utf8');
  try {
    return JSON.parse(text);
  } catch (err) {
    return text;
  }
}

export function encryptBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('encryptBuffer expects a Buffer');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, AES_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptBuffer(blob) {
  if (!blob) {
    return Buffer.alloc(0);
  }

  const payload = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  if (payload.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid encrypted binary payload');
  }

  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, AES_KEY, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted;
}
