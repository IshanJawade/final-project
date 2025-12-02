import '../src/config.js';
import { pool, query } from '../src/db.js';
import {
  buildAdminSecrets,
  buildProfessionalSecrets,
  buildUserSecrets,
  decryptProfile,
  decryptValue,
} from '../src/utils/sensitive.js';

function normalizeUserProfile(row) {
  const profile = decryptProfile(row.profile_encrypted);
  let firstName = profile.firstName || profile.first_name || '';
  let lastName = profile.lastName || profile.last_name || '';
  const fullName = profile.fullName || profile.full_name || profile.name || '';
  if (!firstName && fullName) {
    const parts = fullName.trim().split(/\s+/);
    firstName = parts.shift() || '';
    lastName = parts.join(' ');
  }
  const email = profile.email || decryptValue(row.email_encrypted) || '';
  const dateOfBirth = profile.dateOfBirth || profile.date_of_birth || null;
  const targetYear = profile.yearOfBirth ?? profile.year_of_birth ?? row.year_of_birth ?? null;

  return {
    firstName,
    lastName,
    email,
    mobile: profile.mobile || null,
    address: profile.address || null,
    dateOfBirth,
    yearOfBirth: typeof targetYear === 'number' ? targetYear : null,
  };
}

function normalizeProfessionalProfile(row) {
  const profile = decryptProfile(row.profile_encrypted);
  const email = profile.email || decryptValue(row.email_encrypted) || '';
  return {
    name: profile.name || '',
    email,
    mobile: profile.mobile || null,
    address: profile.address || null,
    company: profile.company || null,
  };
}

function normalizeAdminProfile(row) {
  const profile = decryptProfile(row.profile_encrypted);
  const email = profile.email || decryptValue(row.email_encrypted) || '';
  return {
    name: profile.name || '',
    email,
    mobile: profile.mobile || null,
    address: profile.address || null,
  };
}

async function refreshUsers() {
  const { rows } = await query(
    `SELECT id, muid, email_hash, email_encrypted, profile_encrypted, year_of_birth
       FROM users`
  );

  let updated = 0;
  for (const row of rows) {
    const normalized = normalizeUserProfile(row);
    const secrets = buildUserSecrets(normalized);

    if (!secrets.emailHash) {
      console.warn('Skipping user due to missing email', { id: row.id, muid: row.muid });
      continue;
    }

    const nextYear = normalized.yearOfBirth ?? row.year_of_birth ?? null;
    const updates = [];
    const values = [];

    if (row.email_hash !== secrets.emailHash) {
      updates.push(`email_hash = $${updates.length + 1}`);
      values.push(secrets.emailHash);
    }
    if (row.email_encrypted !== secrets.emailEncrypted) {
      updates.push(`email_encrypted = $${updates.length + 1}`);
      values.push(secrets.emailEncrypted);
    }
    if (row.profile_encrypted !== secrets.profileEncrypted) {
      updates.push(`profile_encrypted = $${updates.length + 1}`);
      values.push(secrets.profileEncrypted);
    }
    const storedYear = row.year_of_birth === null ? null : Number(row.year_of_birth);
    if ((nextYear ?? null) !== (storedYear ?? null)) {
      updates.push(`year_of_birth = $${updates.length + 1}`);
      values.push(nextYear);
    }

    if (updates.length === 0) {
      continue;
    }

    const setClause = `${updates.join(', ')}, updated_at = NOW()`;
    values.push(row.id);
    await query(`UPDATE users SET ${setClause} WHERE id = $${updates.length + 1}`, values);
    updated += 1;
  }

  return updated;
}

async function refreshProfessionals() {
  const { rows } = await query(
    `SELECT id, email_hash, email_encrypted, profile_encrypted
       FROM medical_professionals`
  );

  let updated = 0;
  for (const row of rows) {
    const normalized = normalizeProfessionalProfile(row);
    const secrets = buildProfessionalSecrets(normalized);

    if (!secrets.emailHash) {
      console.warn('Skipping medical professional due to missing email', { id: row.id });
      continue;
    }

    const updates = [];
    const values = [];

    if (row.email_hash !== secrets.emailHash) {
      updates.push(`email_hash = $${updates.length + 1}`);
      values.push(secrets.emailHash);
    }
    if (row.email_encrypted !== secrets.emailEncrypted) {
      updates.push(`email_encrypted = $${updates.length + 1}`);
      values.push(secrets.emailEncrypted);
    }
    if (row.profile_encrypted !== secrets.profileEncrypted) {
      updates.push(`profile_encrypted = $${updates.length + 1}`);
      values.push(secrets.profileEncrypted);
    }

    if (updates.length === 0) {
      continue;
    }

    const setClause = `${updates.join(', ')}, updated_at = NOW()`;
    values.push(row.id);
    await query(`UPDATE medical_professionals SET ${setClause} WHERE id = $${updates.length + 1}`, values);
    updated += 1;
  }

  return updated;
}

async function refreshAdmins() {
  const { rows } = await query(
    `SELECT id, email_hash, email_encrypted, profile_encrypted
       FROM admins`
  );

  let updated = 0;
  for (const row of rows) {
    const normalized = normalizeAdminProfile(row);
    const secrets = buildAdminSecrets(normalized);

    if (!secrets.emailHash) {
      console.warn('Skipping admin due to missing email', { id: row.id });
      continue;
    }

    const updates = [];
    const values = [];

    if (row.email_hash !== secrets.emailHash) {
      updates.push(`email_hash = $${updates.length + 1}`);
      values.push(secrets.emailHash);
    }
    if (row.email_encrypted !== secrets.emailEncrypted) {
      updates.push(`email_encrypted = $${updates.length + 1}`);
      values.push(secrets.emailEncrypted);
    }
    if (row.profile_encrypted !== secrets.profileEncrypted) {
      updates.push(`profile_encrypted = $${updates.length + 1}`);
      values.push(secrets.profileEncrypted);
    }

    if (updates.length === 0) {
      continue;
    }

    const setClause = `${updates.join(', ')}, updated_at = NOW()`;
    values.push(row.id);
    await query(`UPDATE admins SET ${setClause} WHERE id = $${updates.length + 1}`, values);
    updated += 1;
  }

  return updated;
}

async function run() {
  try {
    const [usersUpdated, prosUpdated, adminsUpdated] = await Promise.all([
      refreshUsers(),
      refreshProfessionals(),
      refreshAdmins(),
    ]);

    console.log('Sensitive data refreshed:', {
      usersUpdated,
      professionalsUpdated: prosUpdated,
      adminsUpdated,
    });
  } catch (err) {
    console.error('Failed to refresh encrypted payloads', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
