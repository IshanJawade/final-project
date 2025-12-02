import crypto from 'crypto';
import { encryptJson, decryptJson } from './encryption.js';

function normalizeString(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function parseMaybeJson(value) {
  if (!value) {
    return null;
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
}

function isEncryptedPayload(payload) {
  return payload && typeof payload === 'object' && payload.iv && payload.tag && payload.ciphertext;
}

export function hashIdentifier(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) {
    return null;
  }
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function encryptValue(value) {
  const normalized = value === undefined || value === null ? '' : String(value);
  return encryptJson(normalized);
}

export function decryptValue(value) {
  if (!value) {
    return '';
  }
  try {
    return decryptJson(value);
  } catch (err) {
    const parsed = parseMaybeJson(value);
    if (typeof parsed === 'string') {
      return parsed;
    }
    return '';
  }
}

export function decryptProfile(serialized) {
  if (!serialized) {
    return {};
  }
  const parsed = parseMaybeJson(serialized);
  if (isEncryptedPayload(parsed)) {
    return decryptJson(parsed);
  }
  if (parsed && typeof parsed === 'object') {
    return parsed;
  }
  try {
    const decrypted = decryptJson(serialized);
    if (decrypted && typeof decrypted === 'object') {
      return decrypted;
    }
  } catch (err) {
    // ignore
  }
  return {};
}

export function encryptProfile(profile) {
  return encryptJson(profile || {});
}

function composeUserProfile({
  firstName,
  lastName,
  email,
  mobile,
  address,
  dateOfBirth,
  yearOfBirth,
}) {
  const trimmedFirst = normalizeString(firstName);
  const trimmedLast = normalizeString(lastName);
  const fullName = `${trimmedFirst} ${trimmedLast}`.trim();
  return {
    firstName: trimmedFirst || null,
    lastName: trimmedLast || null,
    fullName: fullName || null,
    email: normalizeString(email) || null,
    mobile: normalizeString(mobile) || null,
    address: normalizeString(address) || null,
    dateOfBirth: normalizeString(dateOfBirth) || null,
    yearOfBirth: typeof yearOfBirth === 'number' ? yearOfBirth : null,
  };
}

export function buildUserSecrets(input) {
  const profile = composeUserProfile(input);
  const email = profile.email || '';
  return {
    emailHash: hashIdentifier(email),
    emailEncrypted: encryptValue(email),
    profileEncrypted: encryptProfile(profile),
  };
}

function composeProfessionalProfile({ name, email, mobile, address, company }) {
  return {
    name: normalizeString(name) || null,
    email: normalizeString(email) || null,
    mobile: normalizeString(mobile) || null,
    address: normalizeString(address) || null,
    company: normalizeString(company) || null,
  };
}

export function buildProfessionalSecrets(input) {
  const profile = composeProfessionalProfile(input);
  const email = profile.email || '';
  return {
    emailHash: hashIdentifier(email),
    emailEncrypted: encryptValue(email),
    profileEncrypted: encryptProfile(profile),
  };
}

function composeAdminProfile({ name, email, mobile, address }) {
  return {
    name: normalizeString(name) || null,
    email: normalizeString(email) || null,
    mobile: normalizeString(mobile) || null,
    address: normalizeString(address) || null,
  };
}

export function buildAdminSecrets(input) {
  const profile = composeAdminProfile(input);
  const email = profile.email || '';
  return {
    emailHash: hashIdentifier(email),
    emailEncrypted: encryptValue(email),
    profileEncrypted: encryptProfile(profile),
  };
}

export function hydrateUser(row) {
  if (!row) {
    return null;
  }
  const profile = decryptProfile(row.profile_encrypted);
  const firstName = profile.firstName || profile.first_name || '';
  const lastName = profile.lastName || profile.last_name || '';
  const fullName = profile.fullName || `${firstName} ${lastName}`.trim();
  return {
    id: row.id,
    muid: row.muid,
    first_name: firstName || null,
    last_name: lastName || null,
    name: fullName || null,
    email: profile.email || decryptValue(row.email_encrypted) || null,
    mobile: profile.mobile || null,
    address: profile.address || null,
    date_of_birth: profile.dateOfBirth || null,
    year_of_birth: profile.yearOfBirth ?? row.year_of_birth ?? null,
    is_approved: row.is_approved,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function hydrateProfessional(row) {
  if (!row) {
    return null;
  }
  const profile = decryptProfile(row.profile_encrypted);
  return {
    id: row.id,
    username: row.username,
    name: profile.name || null,
    email: profile.email || decryptValue(row.email_encrypted) || null,
    mobile: profile.mobile || null,
    address: profile.address || null,
    company: profile.company || null,
    is_approved: row.is_approved,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_login_at: row.last_login_at,
  };
}

export function hydrateAdmin(row) {
  if (!row) {
    return null;
  }
  const profile = decryptProfile(row.profile_encrypted);
  return {
    id: row.id,
    username: row.username,
    name: profile.name || null,
    email: profile.email || decryptValue(row.email_encrypted) || null,
    mobile: profile.mobile || null,
    address: profile.address || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function ensureEmailHashConstraint(value) {
  const hash = hashIdentifier(value);
  if (!hash) {
    throw new Error('A valid email is required for hashing');
  }
  return hash;
}
