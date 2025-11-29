import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { generateMuid } from '../utils/muid.js';
import { JWT_SECRET } from '../config.js';

const router = Router();

router.post('/register/user', async (req, res) => {
  const { name, yearOfBirth, email, mobile, address, password } = req.body;
  if (!name || !yearOfBirth || !email || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const muid = generateMuid(name, yearOfBirth);
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (muid, password_hash, name, email, mobile, address, year_of_birth, is_approved)
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
       RETURNING id, muid, email, is_approved`,
      [muid, passwordHash, name, email.toLowerCase(), mobile || null, address || null, yearOfBirth]
    );

    return res.status(201).json({
      message: 'Registration submitted. Await admin approval.',
      user: result.rows[0],
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Email already registered' });
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
    const result = await query(
      `INSERT INTO medical_professionals (username, password_hash, name, email, mobile, address, company, is_approved)
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
       RETURNING id, username, email, is_approved`,
      [
        username.toLowerCase(),
        passwordHash,
        name,
        email.toLowerCase(),
        mobile || null,
        address || null,
        company || null,
      ]
    );

    return res.status(201).json({
      message: 'Registration submitted. Await admin approval.',
      medicalProfessional: result.rows[0],
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Username or email already registered' });
    }
    console.error('Medical professional registration failed', err);
    return res.status(500).json({ message: 'Registration failed' });
  }
});

async function findAccount(identifierRaw, roleHint) {
  const identifier = identifierRaw.toLowerCase();

  if (!roleHint || roleHint === 'user') {
    const userRes = await query('SELECT * FROM users WHERE email = $1', [identifier]);
    if (userRes.rowCount) {
      return { account: userRes.rows[0], role: 'user', identifierField: 'email' };
    }
  }

  if (!roleHint || roleHint === 'medical') {
    const medRes = await query(
      'SELECT * FROM medical_professionals WHERE username = $1 OR email = $1',
      [identifier]
    );
    if (medRes.rowCount) {
      return { account: medRes.rows[0], role: 'medical', identifierField: 'username/email' };
    }
  }

  if (!roleHint || roleHint === 'admin') {
    const adminRes = await query('SELECT * FROM admins WHERE username = $1 OR email = $1', [identifier]);
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

    const token = jwt.sign({ id: account.id, role: resolvedRole }, JWT_SECRET, {
      expiresIn: '12h',
    });

    const responsePayload = {
      token,
      role: resolvedRole,
      account: {
        id: account.id,
        name: account.name,
        email: account.email,
      },
    };

    if (resolvedRole === 'user') {
      responsePayload.account.muid = account.muid;
    }

    return res.json(responsePayload);
  } catch (err) {
    console.error('Login failed', err);
    return res.status(500).json({ message: 'Login failed' });
  }
});

export default router;
