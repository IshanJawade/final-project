const STORAGE_KEY = 'mrs-device-fingerprint';

const generateFingerprint = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  const timestamp = Date.now().toString(36);
  return `fingerprint-${timestamp}-${random}`;
};

let cachedFingerprint: string | null = null;

export const getDeviceFingerprint = () => {
  if (cachedFingerprint) {
    return cachedFingerprint;
  }

  if (typeof window === 'undefined') {
    cachedFingerprint = 'server-render';
    return cachedFingerprint;
  }

  const storage = window.localStorage;
  const existing = storage.getItem(STORAGE_KEY);
  if (existing) {
    cachedFingerprint = existing;
    return existing;
  }

  const generated = generateFingerprint();
  storage.setItem(STORAGE_KEY, generated);
  cachedFingerprint = generated;
  return generated;
};
