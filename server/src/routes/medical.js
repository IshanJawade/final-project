import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireMedicalProfessional } from '../middleware/auth.js';
import { query } from '../db.js';
import { decryptJson, encryptJson } from '../utils/encryption.js';

const router = Router();
router.use(requireMedicalProfessional);

router.get('/me', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, username, name, email, mobile, address, company, is_approved, created_at, updated_at
       FROM medical_professionals WHERE id = $1`,
      [req.auth.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Account not found' });
    }
    return res.json({ medicalProfessional: result.rows[0] });
  } catch (err) {
    console.error('Failed to load medical professional profile', err);
    return res.status(500).json({ message: 'Failed to load profile' });
  }
});

router.put('/me', async (req, res) => {
  const { name, email, mobile, address, company } = req.body;
  if (!name || !email) {
    return res.status(400).json({ message: 'Name and email are required' });
  }

  try {
    const result = await query(
      `UPDATE medical_professionals
       SET name = $1, email = $2, mobile = $3, address = $4, company = $5, updated_at = NOW()
       WHERE id = $6
       RETURNING id, username, name, email, mobile, address, company, is_approved, created_at, updated_at`,
      [name, email.toLowerCase(), mobile || null, address || null, company || null, req.auth.id]
    );
    return res.json({ message: 'Profile updated', medicalProfessional: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Email already in use' });
    }
    console.error('Failed to update medical professional profile', err);
    return res.status(500).json({ message: 'Failed to update profile' });
  }
});

router.put('/me/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current and new passwords are required' });
  }

  try {
    const dbRes = await query('SELECT password_hash FROM medical_professionals WHERE id = $1', [
      req.auth.id,
    ]);
    if (dbRes.rowCount === 0) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const valid = await bcrypt.compare(currentPassword, dbRes.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE medical_professionals SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
      passwordHash,
      req.auth.id,
    ]);

    return res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('Failed to change medical professional password', err);
    return res.status(500).json({ message: 'Failed to change password' });
  }
});

router.get('/patients', async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.muid, u.name, u.email, a.access_granted_at, a.access_expires_at
       FROM access a
       JOIN users u ON u.id = a.user_id
       WHERE a.medical_professional_id = $1 AND a.access_revoked_at IS NULL
         AND (a.access_expires_at IS NULL OR a.access_expires_at > NOW())
       ORDER BY a.access_granted_at DESC`,
      [req.auth.id]
    );
    return res.json({ patients: result.rows });
  } catch (err) {
    console.error('Failed to load patients', err);
    return res.status(500).json({ message: 'Failed to load patients' });
  }
});

router.get('/patients/:userId/records', async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  try {
    const accessRes = await query(
      `SELECT id FROM access
       WHERE user_id = $1 AND medical_professional_id = $2 AND access_revoked_at IS NULL
         AND (access_expires_at IS NULL OR access_expires_at > NOW())`,
      [userId, req.auth.id]
    );
    if (accessRes.rowCount === 0) {
      return res.status(403).json({ message: 'No active access for this user' });
    }

    const recordsRes = await query(
      `SELECT id, medical_professional_id, data_encrypted, created_at, updated_at
       FROM records WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    const records = recordsRes.rows.map((row) => ({
      id: row.id,
      medical_professional_id: row.medical_professional_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      data: decryptJson(row.data_encrypted),
    }));

    return res.json({ records });
  } catch (err) {
    console.error('Failed to load patient records', err);
    return res.status(500).json({ message: 'Failed to load records' });
  }
});

router.post('/patients/:userId/records', async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ message: 'Invalid user id' });
  }
  const { data } = req.body;
  if (!data) {
    return res.status(400).json({ message: 'Record data is required' });
  }

  try {
    const accessRes = await query(
      `SELECT id FROM access
       WHERE user_id = $1 AND medical_professional_id = $2 AND access_revoked_at IS NULL
         AND (access_expires_at IS NULL OR access_expires_at > NOW())`,
      [userId, req.auth.id]
    );
    if (accessRes.rowCount === 0) {
      return res.status(403).json({ message: 'No active access for this user' });
    }

    const encrypted = encryptJson(data);
    const result = await query(
      `INSERT INTO records (user_id, medical_professional_id, data_encrypted)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, medical_professional_id, created_at, updated_at`,
      [userId, req.auth.id, encrypted]
    );

    return res.status(201).json({
      message: 'Record created',
      record: {
        ...result.rows[0],
        data,
      },
    });
  } catch (err) {
    console.error('Failed to create record', err);
    return res.status(500).json({ message: 'Failed to create record' });
  }
});

router.get('/search-users', async (req, res) => {
  const { query: searchTerm } = req.query;
  if (!searchTerm || String(searchTerm).trim().length < 2) {
    return res.status(400).json({ message: 'Search query must be at least 2 characters' });
  }

  const likeTerm = `%${searchTerm.trim().toLowerCase()}%`;

  try {
    const result = await query(
      `SELECT u.id, u.name, u.muid, u.email
       FROM users u
       WHERE u.is_approved = TRUE
         AND (LOWER(u.name) LIKE $1 OR LOWER(u.muid) LIKE $1)
         AND NOT EXISTS (
           SELECT 1 FROM access a
           WHERE a.user_id = u.id AND a.medical_professional_id = $2 AND a.access_revoked_at IS NULL
             AND (a.access_expires_at IS NULL OR a.access_expires_at > NOW())
         )
         AND NOT EXISTS (
           SELECT 1 FROM access_requests ar
           WHERE ar.user_id = u.id AND ar.medical_professional_id = $2 AND ar.status = 'pending'
         )
       ORDER BY u.name
       LIMIT 20`,
      [likeTerm, req.auth.id]
    );
    return res.json({ users: result.rows });
  } catch (err) {
    console.error('Failed to search users', err);
    return res.status(500).json({ message: 'Failed to search users' });
  }
});

router.post('/access/request', async (req, res) => {
  const { user_id: userId, message } = req.body;
  const userIdNumber = Number(userId);
  if (!Number.isInteger(userIdNumber)) {
    return res.status(400).json({ message: 'Valid user id is required' });
  }

  try {
    const userRes = await query('SELECT id, is_approved FROM users WHERE id = $1', [userIdNumber]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (!userRes.rows[0].is_approved) {
      return res.status(400).json({ message: 'User is not approved' });
    }

    const existingAccess = await query(
      `SELECT id FROM access
       WHERE user_id = $1 AND medical_professional_id = $2 AND access_revoked_at IS NULL
         AND (access_expires_at IS NULL OR access_expires_at > NOW())`,
      [userIdNumber, req.auth.id]
    );
    if (existingAccess.rowCount > 0) {
      return res.status(400).json({ message: 'Access already active' });
    }

    const existingRequest = await query(
      `SELECT id FROM access_requests
       WHERE user_id = $1 AND medical_professional_id = $2 AND status = 'pending'`,
      [userIdNumber, req.auth.id]
    );
    if (existingRequest.rowCount > 0) {
      return res.status(400).json({ message: 'Request already pending' });
    }

    const result = await query(
      `INSERT INTO access_requests (user_id, medical_professional_id, requested_message)
       VALUES ($1, $2, $3)
       RETURNING id, status, created_at`,
      [userIdNumber, req.auth.id, message || null]
    );

    return res.status(201).json({ message: 'Access request submitted', request: result.rows[0] });
  } catch (err) {
    console.error('Failed to submit access request', err);
    return res.status(500).json({ message: 'Failed to submit access request' });
  }
});

router.get('/access/requests', async (req, res) => {
  try {
    const result = await query(
            `SELECT ar.id, ar.user_id, ar.status, ar.created_at, ar.updated_at, ar.responded_at,
              ar.requested_message, u.name, u.muid, u.email
       FROM access_requests ar
       JOIN users u ON u.id = ar.user_id
       WHERE ar.medical_professional_id = $1
       ORDER BY ar.created_at DESC`,
      [req.auth.id]
    );
    return res.json({ requests: result.rows });
  } catch (err) {
    console.error('Failed to load access requests', err);
    return res.status(500).json({ message: 'Failed to load access requests' });
  }
});

export default router;
