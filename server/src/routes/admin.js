import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { query } from '../db.js';

const router = Router();
router.use(requireAdmin);

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
