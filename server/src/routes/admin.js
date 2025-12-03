import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '../middleware/auth.js';
import { query } from '../db.js';
import { listLogFiles, readLogEntries, createLogStream } from '../utils/logger.js';
import {
  buildAdminSecrets,
  hydrateAdmin,
  hydrateProfessional,
  hydrateUser,
} from '../utils/sensitive.js';

const router = Router();
router.use(requireAdmin);

router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsersRes,
      approvedUsersRes,
      pendingUsersRes,
      onlineUsersRes,
      totalProsRes,
      approvedProsRes,
      pendingProsRes,
      onlineProsRes,
      totalRecordsRes,
      recentRecordsRes,
      activeAccessRes,
      pendingRequestsRes,
    ] = await Promise.all([
      query('SELECT COUNT(*)::int AS count FROM users'),
      query('SELECT COUNT(*)::int AS count FROM users WHERE is_approved = TRUE'),
      query('SELECT COUNT(*)::int AS count FROM users WHERE is_approved = FALSE'),
      query(
        `SELECT COUNT(*)::int AS count
           FROM users
          WHERE is_approved = TRUE
            AND last_login_at IS NOT NULL
            AND last_login_at > NOW() - INTERVAL '15 minutes'`
      ),
      query('SELECT COUNT(*)::int AS count FROM medical_professionals'),
      query('SELECT COUNT(*)::int AS count FROM medical_professionals WHERE is_approved = TRUE'),
      query('SELECT COUNT(*)::int AS count FROM medical_professionals WHERE is_approved = FALSE'),
      query(
        `SELECT COUNT(*)::int AS count
           FROM medical_professionals
          WHERE is_approved = TRUE
            AND last_login_at IS NOT NULL
            AND last_login_at > NOW() - INTERVAL '15 minutes'`
      ),
      query('SELECT COUNT(*)::int AS count FROM records'),
      query("SELECT COUNT(*)::int AS count FROM records WHERE created_at > NOW() - INTERVAL '24 hours'"),
      query(
        `SELECT COUNT(*)::int AS count
           FROM access
          WHERE access_revoked_at IS NULL
            AND (access_expires_at IS NULL OR access_expires_at > NOW())`
      ),
      query("SELECT COUNT(*)::int AS count FROM access_requests WHERE status = 'pending'"),
    ]);

    const parseCount = (res) => (res?.rows?.[0]?.count ? Number(res.rows[0].count) : 0);

    return res.json({
      stats: {
        users: {
          total: parseCount(totalUsersRes),
          approved: parseCount(approvedUsersRes),
          pending: parseCount(pendingUsersRes),
          online: parseCount(onlineUsersRes),
        },
        professionals: {
          total: parseCount(totalProsRes),
          approved: parseCount(approvedProsRes),
          pending: parseCount(pendingProsRes),
          online: parseCount(onlineProsRes),
        },
        records: {
          total: parseCount(totalRecordsRes),
          last24h: parseCount(recentRecordsRes),
        },
        access: {
          activeGrants: parseCount(activeAccessRes),
          pendingRequests: parseCount(pendingRequestsRes),
        },
      },
    });
  } catch (err) {
    console.error('Failed to load admin stats', err);
    return res.status(500).json({ message: 'Failed to load stats' });
  }
});

router.get('/users', async (_req, res) => {
  try {
    const result = await query(
      `SELECT id, muid, year_of_birth, is_approved, profile_encrypted, email_encrypted, email_hash, created_at, updated_at
         FROM users
        WHERE is_approved = TRUE
        ORDER BY created_at DESC`
    );
    return res.json({ users: result.rows.map(hydrateUser).filter(Boolean) });
  } catch (err) {
    console.error('Failed to load users list', err);
    return res.status(500).json({ message: 'Failed to load users' });
  }
});

router.get('/professionals', async (_req, res) => {
  try {
    const result = await query(
      `SELECT id, username, is_approved, profile_encrypted, email_encrypted, email_hash, created_at, updated_at, last_login_at
         FROM medical_professionals
        WHERE is_approved = TRUE
        ORDER BY created_at DESC`
    );
    return res.json({ medicalProfessionals: result.rows.map(hydrateProfessional).filter(Boolean) });
  } catch (err) {
    console.error('Failed to load professionals list', err);
    return res.status(500).json({ message: 'Failed to load professionals' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const adminId = req.auth?.id;
    const result = await query(
      `SELECT id, username, profile_encrypted, email_encrypted, email_hash, created_at, updated_at
         FROM admins
        WHERE id = $1`,
      [adminId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    return res.json({ admin: hydrateAdmin(result.rows[0]) });
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

  const normalizedEmail = email.trim().toLowerCase();
  const secrets = buildAdminSecrets({ name, email: normalizedEmail, mobile, address });

  if (!secrets.emailHash) {
    return res.status(400).json({ message: 'Valid email address is required' });
  }

  try {
    const result = await query(
      `UPDATE admins
          SET email_hash = $1,
              email_encrypted = $2,
              profile_encrypted = $3,
              updated_at = NOW()
        WHERE id = $4
      RETURNING id, username, profile_encrypted, email_encrypted, email_hash, created_at, updated_at`,
      [secrets.emailHash, secrets.emailEncrypted, secrets.profileEncrypted, adminId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    return res.json({ message: 'Profile updated', admin: hydrateAdmin(result.rows[0]) });
  } catch (err) {
    if (err.constraint === 'admins_email_hash_key' || err.code === '23505') {
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

router.get('/pending-users', async (_req, res) => {
  try {
    const result = await query(
      `SELECT id, muid, year_of_birth, is_approved, profile_encrypted, email_encrypted, email_hash, created_at, updated_at
         FROM users
        WHERE is_approved = FALSE
        ORDER BY created_at`
    );
    return res.json({ users: result.rows.map(hydrateUser).filter(Boolean) });
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
      `UPDATE users
          SET is_approved = TRUE,
              updated_at = NOW()
        WHERE id = $1
      RETURNING id, muid, year_of_birth, is_approved, profile_encrypted, email_encrypted, email_hash, created_at, updated_at`,
      [userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({ message: 'User approved', user: hydrateUser(result.rows[0]) });
  } catch (err) {
    console.error('Failed to approve user', err);
    return res.status(500).json({ message: 'Failed to approve user' });
  }
});

router.get('/pending-professionals', async (_req, res) => {
  try {
    const result = await query(
      `SELECT id, username, is_approved, profile_encrypted, email_encrypted, email_hash, created_at, updated_at, last_login_at
         FROM medical_professionals
        WHERE is_approved = FALSE
        ORDER BY created_at`
    );
    return res.json({ medicalProfessionals: result.rows.map(hydrateProfessional).filter(Boolean) });
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
      `UPDATE medical_professionals
          SET is_approved = TRUE,
              updated_at = NOW()
        WHERE id = $1
      RETURNING id, username, is_approved, profile_encrypted, email_encrypted, email_hash, created_at, updated_at, last_login_at`,
      [professionalId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Medical professional not found' });
    }
    return res.json({
      message: 'Medical professional approved',
      professional: hydrateProfessional(result.rows[0]),
    });
  } catch (err) {
    console.error('Failed to approve professional', err);
    return res.status(500).json({ message: 'Failed to approve professional' });
  }
});

router.get('/logs', async (_req, res) => {
  try {
    const logs = await listLogFiles();
    return res.json({ logs });
  } catch (err) {
    console.error('Failed to list logs', err);
    return res.status(500).json({ message: 'Failed to list logs' });
  }
});

router.get('/logs/:date', async (req, res) => {
  const { date } = req.params;
  const limitRaw = req.query.limit;
  let limit = 200;
  if (typeof limitRaw === 'string' && limitRaw.trim() !== '') {
    const parsed = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = parsed;
    }
  }

  try {
    const entries = await readLogEntries(date, { limit });
    return res.json({ entries });
  } catch (err) {
    if (err?.message === 'Invalid log date format') {
      return res.status(400).json({ message: 'Invalid date. Use YYYY-MM-DD.' });
    }
    console.error('Failed to read log entries', err);
    return res.status(500).json({ message: 'Failed to read log entries' });
  }
});

router.get('/logs/:date/download', (req, res) => {
  const { date } = req.params;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ message: 'Invalid date. Use YYYY-MM-DD.' });
  }
  try {
    const stream = createLogStream(date);
    if (!stream) {
      return res.status(404).json({ message: 'Log file not found' });
    }
    const filename = `${date}.log`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.on('error', (err) => {
      console.error('Failed while streaming log', err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to stream log file' });
      } else {
        res.destroy(err);
      }
    });
    stream.pipe(res);
    return undefined;
  } catch (err) {
    if (err?.message === 'Invalid log date format') {
      return res.status(400).json({ message: 'Invalid date. Use YYYY-MM-DD.' });
    }
    console.error('Failed to download log file', err);
    return res.status(500).json({ message: 'Failed to download log file' });
  }
});

export default router;
