import crypto from 'crypto';
import { AES_KEY } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Recommended length for GCM

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
