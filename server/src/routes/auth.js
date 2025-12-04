import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { generateMuid } from '../utils/muid.js';
import { normalizeDateOfBirth } from '../utils/dates.js';
import { JWT_SECRET } from '../config.js';
import {
  buildUserSecrets,
  buildProfessionalSecrets,
  hydrateUser,
  hydrateProfessional,
  hydrateAdmin,
  hashIdentifier,
} from '../utils/sensitive.js';

const router = Router();

router.post('/register/user', async (req, res) => {
  const { firstName, lastName, dateOfBirth, email, mobile, address, password } = req.body;
  if (!firstName || !lastName || !dateOfBirth || !email || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  let dobData;
  try {
    dobData = normalizeDateOfBirth(dateOfBirth);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }

  const { iso: dobIso, year } = dobData;
  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();
  const fullName = `${trimmedFirst} ${trimmedLast}`.trim();

  if (!trimmedFirst) {
    return res.status(400).json({ message: 'First name is required' });
  }
  if (!trimmedLast) {
    return res.status(400).json({ message: 'Last name is required' });
  }

  try {
    const muid = generateMuid(fullName, year);
    const passwordHash = await bcrypt.hash(password, 10);
    const normalizedEmail = email.trim().toLowerCase();
    const secrets = buildUserSecrets({
      firstName: trimmedFirst,
      lastName: trimmedLast,
      email: normalizedEmail,
      mobile,
      address,
      dateOfBirth: dobIso,
      yearOfBirth: year,
    });

    if (!secrets.emailHash) {
      return res.status(400).json({ message: 'Valid email address is required' });
    }

    const result = await query(
      `INSERT INTO users (
          muid,
          password_hash,
          year_of_birth,
          is_approved,
          email_hash,
          email_encrypted,
          profile_encrypted
        )
       VALUES ($1, $2, $3, FALSE, $4, $5, $6)
       RETURNING id, muid, year_of_birth, is_approved, email_hash, email_encrypted, profile_encrypted, created_at, updated_at`,
      [muid, passwordHash, year, secrets.emailHash, secrets.emailEncrypted, secrets.profileEncrypted]
    );

    return res.status(201).json({
      message: 'Registration submitted. Await admin approval.',
      user: hydrateUser(result.rows[0]),
    });
  } catch (err) {
    if (err.constraint === 'users_email_hash_key') {
      return res.status(409).json({ message: 'Email already registered' });
    }
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Duplicate account detected' });
    }
    console.error('User registration failed', err);
    return res.status(500).json({ message: 'Registration failed' });
  }
});

router.post('/register/medical-professional', async (req, res) => {
  const { username, name, email, mobile, address, company, password } = req.body;
  if (!username || !name || !email || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const normalizedEmail = email.trim().toLowerCase();
    const secrets = buildProfessionalSecrets({
      name,
      email: normalizedEmail,
      mobile,
      address,
      company,
    });

    if (!secrets.emailHash) {
      return res.status(400).json({ message: 'Valid email address is required' });
    }

    const result = await query(
      `INSERT INTO medical_professionals (username, password_hash, is_approved, email_hash, email_encrypted, profile_encrypted)
       VALUES ($1, $2, FALSE, $3, $4, $5)
       RETURNING id, username, is_approved, email_hash, email_encrypted, profile_encrypted, created_at, updated_at`,
      [username.toLowerCase(), passwordHash, secrets.emailHash, secrets.emailEncrypted, secrets.profileEncrypted]
    );

    return res.status(201).json({
      message: 'Registration submitted. Await admin approval.',
      medicalProfessional: hydrateProfessional(result.rows[0]),
    });
  } catch (err) {
    if (err.constraint === 'medical_professionals_email_hash_key') {
      return res.status(409).json({ message: 'Email already registered' });
    }
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Username already registered' });
    }
    console.error('Medical professional registration failed', err);
    return res.status(500).json({ message: 'Registration failed' });
  }
});

async function findAccount(identifierRaw, roleHint) {
  const identifier = identifierRaw.trim().toLowerCase();
  const identifierHash = hashIdentifier(identifier);

  if (!roleHint || roleHint === 'user') {
    const userRes = await query(
      `SELECT id, muid, password_hash, year_of_birth, is_approved, email_hash, email_encrypted, profile_encrypted, created_at, updated_at
         FROM users
        WHERE email_hash = $1`,
      [identifierHash]
    );
    if (userRes.rowCount) {
      return { account: userRes.rows[0], role: 'user', identifierField: 'email' };
    }
  }

  if (!roleHint || roleHint === 'medical') {
    const medRes = await query(
      `SELECT id, username, password_hash, is_approved, email_hash, email_encrypted, profile_encrypted, created_at, updated_at, last_login_at
         FROM medical_professionals
        WHERE username = $1 OR email_hash = $2`,
      [identifier, identifierHash]
    );
    if (medRes.rowCount) {
      return { account: medRes.rows[0], role: 'medical', identifierField: 'username/email' };
    }
  }

  if (!roleHint || roleHint === 'admin') {
    const adminRes = await query(
      `SELECT id, username, password_hash, email_hash, email_encrypted, profile_encrypted, created_at, updated_at
         FROM admins
        WHERE username = $1 OR email_hash = $2`,
      [identifier, identifierHash]
    );
    if (adminRes.rowCount) {
      return { account: adminRes.rows[0], role: 'admin', identifierField: 'username/email' };
    }
  }

  return null;
}

router.post('/login', async (req, res) => {
  const { identifier, password, role } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ message: 'Identifier and password are required' });
  }

  try {
    const lookup = await findAccount(identifier, role);
    if (!lookup) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const { account, role: resolvedRole } = lookup;
    const passwordValid = await bcrypt.compare(password, account.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (resolvedRole === 'user' && !account.is_approved) {
      return res.status(403).json({ message: 'User awaiting admin approval' });
    }
    if (resolvedRole === 'medical' && !account.is_approved) {
      return res.status(403).json({ message: 'Account awaiting admin approval' });
    }

    const tokenPayload = { id: account.id, role: resolvedRole };
    const actorLabel = resolvedRole === 'user' ? account.muid : account.username;
    if (actorLabel) {
      tokenPayload.username = actorLabel;
    }

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: '12h',
    });

    let accountPayload;

    try {
      if (resolvedRole === 'user') {
        await query('UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [account.id]);
        accountPayload = hydrateUser(account);
      } else if (resolvedRole === 'medical') {
        await query('UPDATE medical_professionals SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [account.id]);
        accountPayload = hydrateProfessional(account);
      } else if (resolvedRole === 'admin') {
        await query('UPDATE admins SET updated_at = NOW() WHERE id = $1', [account.id]);
        accountPayload = hydrateAdmin(account);
      }
    } catch (recordErr) {
      console.error('Failed to record login activity', recordErr);
      if (resolvedRole === 'user') {
        accountPayload = hydrateUser(account);
      } else if (resolvedRole === 'medical') {
        accountPayload = hydrateProfessional(account);
      } else {
        accountPayload = hydrateAdmin(account);
      }
    }

    return res.json({
      token,
      role: resolvedRole,
      account: accountPayload,
    });
  } catch (err) {
    console.error('Login failed', err);
    return res.status(500).json({ message: 'Login failed' });
  }
});

export default router;
