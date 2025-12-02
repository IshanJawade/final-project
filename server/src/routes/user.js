import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireUser } from '../middleware/auth.js';
import { query } from '../db.js';
import { normalizeDateOfBirth } from '../utils/dates.js';
import { buildUserSecrets, hydrateProfessional, hydrateUser } from '../utils/sensitive.js';

const router = Router();
router.use(requireUser);

router.get('/dashboard', async (req, res) => {
  const userId = req.auth?.id;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const [accessCountRes, recordCountRes, pendingRequestsRes] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS count
           FROM access
          WHERE user_id = $1
            AND access_revoked_at IS NULL
            AND (access_expires_at IS NULL OR access_expires_at > NOW())`,
        [userId]
      ),
      query('SELECT COUNT(*)::int AS count FROM records WHERE user_id = $1', [userId]),
      query(
        `SELECT COUNT(*)::int AS count
           FROM access_requests
          WHERE user_id = $1
            AND status = 'pending'`,
        [userId]
      ),
    ]);

    const safeCount = (res) => (res?.rows?.[0]?.count ? Number(res.rows[0].count) : 0);

    return res.json({
      stats: {
        activeAccess: safeCount(accessCountRes),
        totalRecords: safeCount(recordCountRes),
        pendingRequests: safeCount(pendingRequestsRes),
      },
    });
  } catch (err) {
    console.error('Failed to load user dashboard stats', err);
    return res.status(500).json({ message: 'Failed to load dashboard data' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, muid, year_of_birth, is_approved, email_hash, email_encrypted, profile_encrypted, created_at, updated_at
         FROM users
        WHERE id = $1`,
      [req.auth.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({ user: hydrateUser(result.rows[0]) });
  } catch (err) {
    console.error('Failed to load user profile', err);
    return res.status(500).json({ message: 'Failed to load profile' });
  }
});

router.put('/me', async (req, res) => {
  const { firstName, lastName, email, mobile, address, dateOfBirth } = req.body;
  if (!firstName || !lastName || !email || !dateOfBirth) {
    return res.status(400).json({ message: 'First name, last name, email, and date of birth are required' });
  }

  let dobData;
  try {
    dobData = normalizeDateOfBirth(dateOfBirth);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }

  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();
  if (!trimmedFirst) {
    return res.status(400).json({ message: 'First name is required' });
  }
  if (!trimmedLast) {
    return res.status(400).json({ message: 'Last name is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const secrets = buildUserSecrets({
    firstName: trimmedFirst,
    lastName: trimmedLast,
    email: normalizedEmail,
    mobile,
    address,
    dateOfBirth: dobData.iso,
    yearOfBirth: dobData.year,
  });

  if (!secrets.emailHash) {
    return res.status(400).json({ message: 'Valid email address is required' });
  }

  try {
    const result = await query(
      `UPDATE users
          SET email_hash = $1,
              email_encrypted = $2,
              profile_encrypted = $3,
              year_of_birth = $4,
              updated_at = NOW()
        WHERE id = $5
      RETURNING id, muid, year_of_birth, is_approved, email_hash, email_encrypted, profile_encrypted, created_at, updated_at`,
      [
        secrets.emailHash,
        secrets.emailEncrypted,
        secrets.profileEncrypted,
        dobData.year,
        req.auth.id,
      ]
    );

    return res.json({ message: 'Profile updated', user: hydrateUser(result.rows[0]) });
  } catch (err) {
    if (err.constraint === 'users_email_hash_key' || err.code === '23505') {
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
      `SELECT a.id,
              a.medical_professional_id,
              a.access_granted_at,
              a.access_expires_at,
              a.access_revoked_at,
              mp.id AS professional_id,
              mp.username,
              mp.profile_encrypted,
              mp.email_encrypted,
              mp.is_approved
         FROM access a
         JOIN medical_professionals mp ON mp.id = a.medical_professional_id
        WHERE a.user_id = $1
          AND a.access_revoked_at IS NULL
          AND (a.access_expires_at IS NULL OR a.access_expires_at > NOW())
        ORDER BY a.access_granted_at DESC, mp.username ASC`,
      [req.auth.id]
    );

    const professionals = result.rows.map((row) => {
      const profile = hydrateProfessional({
        id: row.professional_id,
        username: row.username,
        profile_encrypted: row.profile_encrypted,
        email_encrypted: row.email_encrypted,
        is_approved: row.is_approved,
      });

      return {
        id: row.id,
        medical_professional_id: row.medical_professional_id,
        access_granted_at: row.access_granted_at,
        access_expires_at: row.access_expires_at,
        access_revoked_at: row.access_revoked_at,
        name: profile?.name || null,
        email: profile?.email || null,
        mobile: profile?.mobile || null,
        company: profile?.company || null,
        medical_name: profile?.name || null,
        medical_email: profile?.email || null,
        medical_mobile: profile?.mobile || null,
        medical_company: profile?.company || null,
      };
    });

    return res.json({ professionals });
  } catch (err) {
    console.error('Failed to load access list', err);
    return res.status(500).json({ message: 'Failed to load access list' });
  }
});

router.post('/access/grant', async (_req, res) =>
  res.status(410).json({ message: 'Manual grants replaced by request workflow.' })
);

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
        WHERE user_id = $1
          AND medical_professional_id = $2
          AND access_revoked_at IS NULL
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

router.get('/access/requests', async (req, res) => {
  try {
    const result = await query(
      `SELECT ar.id,
              ar.medical_professional_id,
              ar.status,
              ar.requested_message,
              ar.created_at,
              ar.responded_at,
              ar.updated_at,
              mp.id AS professional_id,
              mp.username,
              mp.profile_encrypted,
              mp.email_encrypted,
              mp.is_approved
         FROM access_requests ar
         JOIN medical_professionals mp ON mp.id = ar.medical_professional_id
        WHERE ar.user_id = $1 AND ar.status = 'pending'
        ORDER BY ar.created_at DESC, mp.username ASC`,
      [req.auth.id]
    );

    const requests = result.rows.map((row) => {
      const professional = hydrateProfessional({
        id: row.professional_id,
        username: row.username,
        profile_encrypted: row.profile_encrypted,
        email_encrypted: row.email_encrypted,
        is_approved: row.is_approved,
      });

      return {
        id: row.id,
        medical_professional_id: row.medical_professional_id,
        status: row.status,
        requested_message: row.requested_message,
        created_at: row.created_at,
        updated_at: row.updated_at,
        responded_at: row.responded_at,
        name: professional?.name || null,
        email: professional?.email || null,
        mobile: professional?.mobile || null,
        company: professional?.company || null,
        medical_name: professional?.name || null,
        medical_email: professional?.email || null,
        medical_mobile: professional?.mobile || null,
        medical_company: professional?.company || null,
      };
    });

    return res.json({ requests });
  } catch (err) {
    console.error('Failed to load access requests', err);
    return res.status(500).json({ message: 'Failed to load access requests' });
  }
});

router.post('/access/requests/:requestId/respond', async (req, res) => {
  const requestId = Number(req.params.requestId);
  const { decision, expires_at: expiresAt } = req.body;
  if (!Number.isInteger(requestId)) {
    return res.status(400).json({ message: 'Invalid request id' });
  }
  if (!['approve', 'decline'].includes(decision)) {
    return res.status(400).json({ message: 'Decision must be approve or decline' });
  }

  try {
    const requestRes = await query(
      `SELECT id, user_id, medical_professional_id
         FROM access_requests
        WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
      [requestId, req.auth.id]
    );
    if (requestRes.rowCount === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (decision === 'decline') {
      await query(
        `UPDATE access_requests
            SET status = 'declined',
                responded_at = NOW(),
                updated_at = NOW()
          WHERE id = $1`,
        [requestId]
      );
      return res.json({ message: 'Access request declined' });
    }

    let expiresTimestamp = null;
    if (expiresAt) {
      const expiresDate = new Date(expiresAt);
      if (Number.isNaN(expiresDate.getTime())) {
        return res.status(400).json({ message: 'Invalid expiration date' });
      }
      if (expiresDate.getTime() <= Date.now()) {
        return res.status(400).json({ message: 'Expiration must be in the future' });
      }
      expiresTimestamp = expiresDate.toISOString();
    }
    if (!expiresTimestamp) {
      expiresTimestamp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }

    const activeCheck = await query(
      `SELECT id FROM access
         WHERE user_id = $1
           AND medical_professional_id = $2
           AND access_revoked_at IS NULL
           AND (access_expires_at IS NULL OR access_expires_at > NOW())`,
      [requestRes.rows[0].user_id, requestRes.rows[0].medical_professional_id]
    );
    if (activeCheck.rowCount > 0) {
      await query(
        `UPDATE access_requests
            SET status = 'approved', responded_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [requestId]
      );
      return res.json({ message: 'Access already active' });
    }

    await query(
      `INSERT INTO access (user_id, medical_professional_id, access_granted_at, access_expires_at)
        VALUES ($1, $2, NOW(), $3)`,
      [requestRes.rows[0].user_id, requestRes.rows[0].medical_professional_id, expiresTimestamp]
    );

    await query(
      `UPDATE access_requests
          SET status = 'approved', responded_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [requestId]
    );

    return res.json({ message: 'Access granted' });
  } catch (err) {
    console.error('Failed to respond to access request', err);
    return res.status(500).json({ message: 'Failed to respond to access request' });
  }
});

export default router;
