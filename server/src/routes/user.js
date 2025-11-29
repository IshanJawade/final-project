import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireUser } from '../middleware/auth.js';
import { query } from '../db.js';

const router = Router();
router.use(requireUser);

router.get('/me', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, muid, name, email, mobile, address, year_of_birth, is_approved, created_at, updated_at
       FROM users WHERE id = $1`,
      [req.auth.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Failed to load user profile', err);
    return res.status(500).json({ message: 'Failed to load profile' });
  }
});

router.put('/me', async (req, res) => {
  const { name, email, mobile, address } = req.body;
  if (!name || !email) {
    return res.status(400).json({ message: 'Name and email are required' });
  }

  try {
    const result = await query(
      `UPDATE users
       SET name = $1, email = $2, mobile = $3, address = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, muid, name, email, mobile, address, year_of_birth, is_approved, created_at, updated_at`,
      [name, email.toLowerCase(), mobile || null, address || null, req.auth.id]
    );
    return res.json({ message: 'Profile updated', user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Email already in use' });
    }
    console.error('Failed to update profile', err);
    return res.status(500).json({ message: 'Failed to update profile' });
  }
});

router.put('/me/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current and new passwords are required' });
  }

  try {
    const userRes = await query('SELECT password_hash FROM users WHERE id = $1', [req.auth.id]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const valid = await bcrypt.compare(currentPassword, userRes.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
      passwordHash,
      req.auth.id,
    ]);

    return res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('Failed to change password', err);
    return res.status(500).json({ message: 'Failed to change password' });
  }
});

router.get('/access', async (req, res) => {
  try {
    const result = await query(
      `SELECT a.id, a.medical_professional_id, a.access_granted_at, a.access_revoked_at,
              mp.name, mp.email, mp.mobile, mp.company
       FROM access a
       JOIN medical_professionals mp ON mp.id = a.medical_professional_id
       WHERE a.user_id = $1 AND a.access_revoked_at IS NULL
       ORDER BY a.access_granted_at DESC`,
      [req.auth.id]
    );
    return res.json({ professionals: result.rows });
  } catch (err) {
    console.error('Failed to load access list', err);
    return res.status(500).json({ message: 'Failed to load access list' });
  }
});

router.post('/access/grant', async (req, res) => {
  const { medical_professional_id: professionalId } = req.body;
  const professionalIdNumber = Number(professionalId);
  if (!Number.isInteger(professionalIdNumber)) {
    return res.status(400).json({ message: 'Valid medical professional id is required' });
  }

  try {
    const professionalRes = await query(
      'SELECT id, is_approved FROM medical_professionals WHERE id = $1',
      [professionalIdNumber]
    );
    if (professionalRes.rowCount === 0) {
      return res.status(404).json({ message: 'Medical professional not found' });
    }
    if (!professionalRes.rows[0].is_approved) {
      return res.status(400).json({ message: 'Medical professional is not approved' });
    }

    const activeRes = await query(
      `SELECT id FROM access
       WHERE user_id = $1 AND medical_professional_id = $2 AND access_revoked_at IS NULL`,
      [req.auth.id, professionalIdNumber]
    );
    if (activeRes.rowCount > 0) {
      return res.status(400).json({ message: 'Access already granted' });
    }

    const result = await query(
      `INSERT INTO access (user_id, medical_professional_id, access_granted_at, access_revoked_at)
       VALUES ($1, $2, NOW(), NULL)
       RETURNING id, user_id, medical_professional_id, access_granted_at`,
      [req.auth.id, professionalIdNumber]
    );

    return res.status(201).json({ message: 'Access granted', access: result.rows[0] });
  } catch (err) {
    console.error('Failed to grant access', err);
    return res.status(500).json({ message: 'Failed to grant access' });
  }
});

router.post('/access/revoke', async (req, res) => {
  const { medical_professional_id: professionalId } = req.body;
  const professionalIdNumber = Number(professionalId);
  if (!Number.isInteger(professionalIdNumber)) {
    return res.status(400).json({ message: 'Valid medical professional id is required' });
  }

  try {
    const result = await query(
      `UPDATE access
       SET access_revoked_at = NOW()
       WHERE user_id = $1 AND medical_professional_id = $2 AND access_revoked_at IS NULL
       RETURNING id, access_granted_at, access_revoked_at`,
      [req.auth.id, professionalIdNumber]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Active access not found' });
    }
    return res.json({ message: 'Access revoked', access: result.rows[0] });
  } catch (err) {
    console.error('Failed to revoke access', err);
    return res.status(500).json({ message: 'Failed to revoke access' });
  }
});

export default router;
