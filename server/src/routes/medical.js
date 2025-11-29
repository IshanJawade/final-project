import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireMedicalProfessional } from '../middleware/auth.js';
import { query } from '../db.js';
import { decryptJson } from '../utils/encryption.js';

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
      `SELECT u.id, u.muid, u.name, u.email, a.access_granted_at
       FROM access a
       JOIN users u ON u.id = a.user_id
       WHERE a.medical_professional_id = $1 AND a.access_revoked_at IS NULL
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
       WHERE user_id = $1 AND medical_professional_id = $2 AND access_revoked_at IS NULL`,
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

export default router;
