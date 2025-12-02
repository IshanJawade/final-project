import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { requireMedicalProfessional } from '../middleware/auth.js';
import { query } from '../db.js';
import { decryptJson, encryptJson, encryptBuffer, decryptBuffer } from '../utils/encryption.js';
import {
  buildProfessionalSecrets,
  hydrateProfessional,
  hydrateUser,
} from '../utils/sensitive.js';

const router = Router();
router.use(requireMedicalProfessional);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 5,
  },
});

router.get('/me', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, username, is_approved, email_hash, email_encrypted, profile_encrypted, created_at, updated_at, last_login_at
         FROM medical_professionals
        WHERE id = $1`,
      [req.auth.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Account not found' });
    }

    return res.json({ medicalProfessional: hydrateProfessional(result.rows[0]) });
  } catch (err) {
    console.error('Failed to load medical professional profile', err);
    return res.status(500).json({ message: 'Failed to load profile' });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const [activeAccessRes, pendingRequestsRes, recordsAuthoredRes] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS count
           FROM access
          WHERE medical_professional_id = $1
            AND access_revoked_at IS NULL
            AND (access_expires_at IS NULL OR access_expires_at > NOW())`,
        [req.auth.id]
      ),
      query(
        `SELECT COUNT(*)::int AS count
           FROM access_requests
          WHERE medical_professional_id = $1
            AND status = 'pending'`,
        [req.auth.id]
      ),
      query(
        `SELECT COUNT(*)::int AS count
           FROM records
          WHERE medical_professional_id = $1`,
        [req.auth.id]
      ),
    ]);

    const parseCount = (result) => (result?.rows?.[0]?.count ? Number(result.rows[0].count) : 0);

    return res.json({
      stats: {
        activeAccess: parseCount(activeAccessRes),
        pendingRequests: parseCount(pendingRequestsRes),
        recordsAuthored: parseCount(recordsAuthoredRes),
      },
    });
  } catch (err) {
    console.error('Failed to load medical dashboard stats', err);
    return res.status(500).json({ message: 'Failed to load dashboard' });
  }
});

router.put('/me', async (req, res) => {
  const { name, email, mobile, address, company } = req.body;
  if (!name || !email) {
    return res.status(400).json({ message: 'Name and email are required' });
  }

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

  try {
    const result = await query(
      `UPDATE medical_professionals
          SET email_hash = $1,
              email_encrypted = $2,
              profile_encrypted = $3,
              updated_at = NOW()
        WHERE id = $4
      RETURNING id, username, is_approved, email_hash, email_encrypted, profile_encrypted, created_at, updated_at, last_login_at`,
      [
        secrets.emailHash,
        secrets.emailEncrypted,
        secrets.profileEncrypted,
        req.auth.id,
      ]
    );

    return res.json({ message: 'Profile updated', medicalProfessional: hydrateProfessional(result.rows[0]) });
  } catch (err) {
    if (err.constraint === 'medical_professionals_email_hash_key' || err.code === '23505') {
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
      `SELECT a.access_granted_at,
              a.access_expires_at,
              u.id,
              u.muid,
              u.profile_encrypted,
              u.email_encrypted,
              u.year_of_birth,
              u.is_approved
         FROM access a
         JOIN users u ON u.id = a.user_id
        WHERE a.medical_professional_id = $1
          AND a.access_revoked_at IS NULL
          AND (a.access_expires_at IS NULL OR a.access_expires_at > NOW())
        ORDER BY a.access_granted_at DESC, u.muid ASC`,
      [req.auth.id]
    );

    const patients = result.rows.map((row) => {
      const user = hydrateUser({
        id: row.id,
        muid: row.muid,
        year_of_birth: row.year_of_birth,
        is_approved: row.is_approved,
        profile_encrypted: row.profile_encrypted,
        email_encrypted: row.email_encrypted,
      });

      return {
        id: row.id,
        muid: user?.muid ?? row.muid,
        name: user?.name || null,
        email: user?.email || null,
        access_granted_at: row.access_granted_at,
        access_expires_at: row.access_expires_at,
      };
    });

    return res.json({ patients });
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
      `SELECT r.id,
              r.medical_professional_id,
              r.data_encrypted,
              r.created_at,
              r.updated_at,
              mp.profile_encrypted AS professional_profile,
              mp.email_encrypted AS professional_email
         FROM records r
         LEFT JOIN medical_professionals mp ON mp.id = r.medical_professional_id
        WHERE r.user_id = $1
        ORDER BY r.created_at DESC`,
      [userId]
    );

    const recordIds = recordsRes.rows.map((row) => row.id);

    let attachments = [];
    if (recordIds.length > 0) {
      const filesRes = await query(
        `SELECT id,
                record_id,
                medical_professional_id,
                file_name,
                mime_type,
                file_size,
                created_at
           FROM record_files
          WHERE record_id = ANY($1::int[])
          ORDER BY created_at ASC`,
        [recordIds]
      );
      attachments = filesRes.rows;
    }

    const attachmentsByRecord = attachments.reduce((acc, file) => {
      if (!acc[file.record_id]) {
        acc[file.record_id] = [];
      }
      acc[file.record_id].push({
        id: file.id,
        file_name: file.file_name,
        mime_type: file.mime_type,
        file_size: file.file_size,
        created_at: file.created_at,
        medical_professional_id: file.medical_professional_id,
        download_url: `/api/medical/records/${file.record_id}/files/${file.id}/download`,
      });
      return acc;
    }, {});

    const records = recordsRes.rows.map((row) => {
      const uploader = row.medical_professional_id
        ? hydrateProfessional({
            id: row.medical_professional_id,
            profile_encrypted: row.professional_profile,
            email_encrypted: row.professional_email,
          })
        : null;

      return {
        id: row.id,
        medical_professional_id: row.medical_professional_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        data: decryptJson(row.data_encrypted),
        uploaded_by: uploader,
        files: attachmentsByRecord[row.id] || [],
      };
    });

    return res.json({ records });
  } catch (err) {
    console.error('Failed to load patient records', err);
    return res.status(500).json({ message: 'Failed to load records' });
  }
});

router.post('/patients/:userId/records', upload.array('files', 5), async (req, res) => {
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

    let payload;
    if (req.body.data) {
      try {
        payload = JSON.parse(req.body.data);
      } catch (err) {
        return res.status(400).json({ message: 'Invalid record payload' });
      }
    } else {
      payload = {
        summary: req.body.summary || '',
        notes: req.body.notes || '',
      };
    }

    const encrypted = encryptJson(payload);
    const result = await query(
      `INSERT INTO records (user_id, medical_professional_id, data_encrypted)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, medical_professional_id, created_at, updated_at`,
      [userId, req.auth.id, encrypted]
    );

    const attachments = [];
    if (Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files) {
        if (!file || !file.buffer || file.size === 0) {
          continue;
        }

        const encryptedBlob = encryptBuffer(file.buffer);
        const fileRes = await query(
          `INSERT INTO record_files (record_id, medical_professional_id, file_name, mime_type, file_size, file_encrypted)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, file_name, mime_type, file_size, created_at`,
          [result.rows[0].id, req.auth.id, file.originalname, file.mimetype, file.size, encryptedBlob]
        );
        attachments.push({
          ...fileRes.rows[0],
          download_url: `/api/medical/records/${result.rows[0].id}/files/${fileRes.rows[0].id}/download`,
        });
      }
    }

    return res.status(201).json({
      message: 'Record created',
      record: {
        ...result.rows[0],
        data: payload,
        files: attachments,
      },
    });
  } catch (err) {
    console.error('Failed to create record', err);
    return res.status(500).json({ message: 'Failed to create record' });
  }
});

router.get('/search-users', async (req, res) => {
  const { query: searchTerm } = req.query;
  const normalizedQuery = String(searchTerm || '').trim().toLowerCase();
  if (normalizedQuery.length < 2) {
    return res.status(400).json({ message: 'Search query must be at least 2 characters' });
  }

  try {
    const result = await query(
      `SELECT u.id,
              u.muid,
              u.profile_encrypted,
              u.email_encrypted
         FROM users u
        WHERE u.is_approved = TRUE
          AND NOT EXISTS (
                SELECT 1
                  FROM access a
                 WHERE a.user_id = u.id
                   AND a.medical_professional_id = $1
                   AND a.access_revoked_at IS NULL
                   AND (a.access_expires_at IS NULL OR a.access_expires_at > NOW())
              )
          AND NOT EXISTS (
                SELECT 1
                  FROM access_requests ar
                 WHERE ar.user_id = u.id
                   AND ar.medical_professional_id = $1
                   AND ar.status = 'pending'
              )
        ORDER BY u.created_at DESC
        LIMIT 200`,
      [req.auth.id]
    );

    const users = result.rows
      .map((row) => {
        const user = hydrateUser({
          id: row.id,
          muid: row.muid,
          profile_encrypted: row.profile_encrypted,
          email_encrypted: row.email_encrypted,
        });

        return {
          id: row.id,
          muid: row.muid,
          name: user?.name || null,
          email: user?.email || null,
        };
      })
      .filter((user) => {
        const nameMatch = user.name?.toLowerCase().includes(normalizedQuery);
        const emailMatch = user.email?.toLowerCase().includes(normalizedQuery);
        const muidMatch = user.muid?.toLowerCase().includes(normalizedQuery);
        return Boolean(nameMatch || emailMatch || muidMatch);
      })
      .slice(0, 20);

    return res.json({ users });
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
      `SELECT ar.id,
              ar.user_id,
              ar.status,
              ar.created_at,
              ar.updated_at,
              ar.responded_at,
              ar.requested_message,
              u.id AS user_id_internal,
              u.muid,
              u.profile_encrypted,
              u.email_encrypted,
              u.year_of_birth,
              u.is_approved
         FROM access_requests ar
         JOIN users u ON u.id = ar.user_id
        WHERE ar.medical_professional_id = $1
        ORDER BY ar.created_at DESC`,
      [req.auth.id]
    );

    const requests = result.rows.map((row) => {
      const user = hydrateUser({
        id: row.user_id_internal,
        muid: row.muid,
        profile_encrypted: row.profile_encrypted,
        email_encrypted: row.email_encrypted,
        year_of_birth: row.year_of_birth,
        is_approved: row.is_approved,
      });

      return {
        id: row.id,
        user_id: row.user_id,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        responded_at: row.responded_at,
        requested_message: row.requested_message,
        name: user?.name || null,
        muid: user?.muid || row.muid,
        email: user?.email || null,
        company: user?.company || null,
      };
    });

    return res.json({ requests });
  } catch (err) {
    console.error('Failed to load access requests', err);
    return res.status(500).json({ message: 'Failed to load access requests' });
  }
});

router.get('/records/:recordId/files/:fileId/download', async (req, res) => {
  const recordId = Number(req.params.recordId);
  const fileId = Number(req.params.fileId);

  if (!Number.isInteger(recordId) || !Number.isInteger(fileId)) {
    return res.status(400).json({ message: 'Invalid identifiers' });
  }

  try {
    const recordRes = await query('SELECT user_id, medical_professional_id FROM records WHERE id = $1', [
      recordId,
    ]);
    if (recordRes.rowCount === 0) {
      return res.status(404).json({ message: 'Record not found' });
    }

    const record = recordRes.rows[0];
    if (record.medical_professional_id !== req.auth.id) {
      const accessRes = await query(
        `SELECT id FROM access
         WHERE user_id = $1
           AND medical_professional_id = $2
           AND access_revoked_at IS NULL
           AND (access_expires_at IS NULL OR access_expires_at > NOW())`,
        [record.user_id, req.auth.id]
      );
      if (accessRes.rowCount === 0) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const fileRes = await query(
      `SELECT file_name, mime_type, file_encrypted
         FROM record_files
        WHERE id = $1 AND record_id = $2`,
      [fileId, recordId]
    );

    if (fileRes.rowCount === 0) {
      return res.status(404).json({ message: 'File not found' });
    }

    const fileRow = fileRes.rows[0];
    const fileBuffer = decryptBuffer(fileRow.file_encrypted);

    res.setHeader('Content-Type', fileRow.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURI(fileRow.file_name)}"`);
    return res.send(fileBuffer);
  } catch (err) {
    console.error('Failed to download record file', err);
    return res.status(500).json({ message: 'Failed to download file' });
  }
});

export default router;
