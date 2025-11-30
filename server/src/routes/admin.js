import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '../middleware/auth.js';
import { query } from '../db.js';

const router = Router();
router.use(requireAdmin);

router.get('/me', async (req, res) => {
  try {
    const adminId = req.auth?.id;
    const result = await query(
      `SELECT id, username, name, email, mobile, address, created_at, updated_at
       FROM admins
       WHERE id = $1`,
      [adminId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    return res.json({ admin: result.rows[0] });
  } catch (err) {
    console.error('Failed to load admin profile', err);
    return res.status(500).json({ message: 'Failed to load admin profile' });
  }
});

router.put('/me', async (req, res) => {
  const adminId = req.auth?.id;
  const { name, email, mobile, address } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({ message: 'Name and email are required' });
  }

  try {
    const result = await query(
      `UPDATE admins
       SET name = $1, email = $2, mobile = $3, address = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, username, name, email, mobile, address, updated_at`,
      [name, email.toLowerCase(), mobile || null, address || null, adminId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    return res.json({ message: 'Profile updated', admin: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ message: 'Email already in use' });
    }
    console.error('Failed to update admin profile', err);
    return res.status(500).json({ message: 'Failed to update admin profile' });
  }
});

router.put('/me/password', async (req, res) => {
  const adminId = req.auth?.id;
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current and new passwords are required' });
  }

  try {
    const result = await query('SELECT id, password_hash FROM admins WHERE id = $1', [adminId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    const admin = result.rows[0];
    const matches = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!matches) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE admins SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, adminId]);

    return res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('Failed to update admin password', err);
    return res.status(500).json({ message: 'Failed to update password' });
  }
});

router.get('/pending-users', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, email, mobile, address, muid, created_at
       FROM users
       WHERE is_approved = FALSE
       ORDER BY created_at`
    );
    return res.json({ users: result.rows });
  } catch (err) {
    console.error('Failed to load pending users', err);
    return res.status(500).json({ message: 'Failed to load pending users' });
  }
});

router.post('/users/:id/approve', async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  try {
    const result = await query(
      `UPDATE users SET is_approved = TRUE, updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, email, muid, is_approved`,
      [userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({ message: 'User approved', user: result.rows[0] });
  } catch (err) {
    console.error('Failed to approve user', err);
    return res.status(500).json({ message: 'Failed to approve user' });
  }
});

router.get('/pending-professionals', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, username, name, email, mobile, company, created_at
       FROM medical_professionals
       WHERE is_approved = FALSE
       ORDER BY created_at`
    );
    return res.json({ medicalProfessionals: result.rows });
  } catch (err) {
    console.error('Failed to load pending professionals', err);
    return res.status(500).json({ message: 'Failed to load pending professionals' });
  }
});

router.post('/professionals/:id/approve', async (req, res) => {
  const professionalId = Number(req.params.id);
  if (!Number.isInteger(professionalId)) {
    return res.status(400).json({ message: 'Invalid professional id' });
  }

  try {
    const result = await query(
      `UPDATE medical_professionals SET is_approved = TRUE, updated_at = NOW()
       WHERE id = $1
       RETURNING id, username, name, email, is_approved`,
      [professionalId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Medical professional not found' });
    }
    return res.json({ message: 'Medical professional approved', professional: result.rows[0] });
  } catch (err) {
    console.error('Failed to approve professional', err);
    return res.status(500).json({ message: 'Failed to approve professional' });
  }
});

export default router;
