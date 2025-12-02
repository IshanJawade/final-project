import { Router } from 'express';
import { requireUser } from '../middleware/auth.js';
import { query } from '../db.js';
import { decryptJson, decryptBuffer } from '../utils/encryption.js';
import { hydrateProfessional } from '../utils/sensitive.js';

const router = Router();
router.use(requireUser);

router.get('/', async (req, res) => {
  try {
    const result = await query(
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
      [req.auth.id]
    );

    const recordIds = result.rows.map((row) => row.id);
    const attachmentsByRecord = new Map();

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

      filesRes.rows.forEach((file) => {
        const list = attachmentsByRecord.get(file.record_id) || [];
        list.push({
          id: file.id,
          medical_professional_id: file.medical_professional_id,
          file_name: file.file_name,
          mime_type: file.mime_type,
          file_size: file.file_size,
          created_at: file.created_at,
          download_url: `/api/records/${file.record_id}/files/${file.id}/download`,
        });
        attachmentsByRecord.set(file.record_id, list);
      });
    }

    const professionalCache = new Map();
    const records = result.rows.map((row) => {
      let uploader = null;
      if (row.medical_professional_id) {
        if (professionalCache.has(row.medical_professional_id)) {
          uploader = professionalCache.get(row.medical_professional_id) || null;
        } else {
          uploader = hydrateProfessional({
            id: row.medical_professional_id,
            profile_encrypted: row.professional_profile,
            email_encrypted: row.professional_email,
          });
          professionalCache.set(row.medical_professional_id, uploader);
        }
      }

      return {
        id: row.id,
        medical_professional_id: row.medical_professional_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        data: decryptJson(row.data_encrypted),
        uploaded_by: uploader,
        files: attachmentsByRecord.get(row.id) || [],
      };
    });

    return res.json({ records });
  } catch (err) {
    console.error('Failed to load records', err);
    return res.status(500).json({ message: 'Failed to load records' });
  }
});

router.get('/:id', async (req, res) => {
  const recordId = Number(req.params.id);
  if (!Number.isInteger(recordId)) {
    return res.status(400).json({ message: 'Invalid record id' });
  }

  try {
    const result = await query(
      `SELECT r.id,
              r.medical_professional_id,
              r.data_encrypted,
              r.created_at,
              r.updated_at,
              mp.profile_encrypted AS professional_profile,
              mp.email_encrypted AS professional_email
         FROM records r
         LEFT JOIN medical_professionals mp ON mp.id = r.medical_professional_id
        WHERE r.id = $1 AND r.user_id = $2`,
      [recordId, req.auth.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Record not found' });
    }

    const row = result.rows[0];
    const filesRes = await query(
      `SELECT id,
              medical_professional_id,
              file_name,
              mime_type,
              file_size,
              created_at
         FROM record_files
        WHERE record_id = $1
        ORDER BY created_at ASC`,
      [recordId]
    );

    const professional = row.medical_professional_id
      ? hydrateProfessional({
          id: row.medical_professional_id,
          profile_encrypted: row.professional_profile,
          email_encrypted: row.professional_email,
        })
      : null;

    return res.json({
      record: {
        id: row.id,
        medical_professional_id: row.medical_professional_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        data: decryptJson(row.data_encrypted),
        uploaded_by: professional,
        files: filesRes.rows.map((file) => ({
          id: file.id,
          medical_professional_id: file.medical_professional_id,
          file_name: file.file_name,
          mime_type: file.mime_type,
          file_size: file.file_size,
          created_at: file.created_at,
          download_url: `/api/records/${recordId}/files/${file.id}/download`,
        })),
      },
    });
  } catch (err) {
    console.error('Failed to load record', err);
    return res.status(500).json({ message: 'Failed to load record' });
  }
});

router.get('/:id/download', async (req, res) => {
  const recordId = Number(req.params.id);
  if (!Number.isInteger(recordId)) {
    return res.status(400).json({ message: 'Invalid record id' });
  }

  try {
    const result = await query(
      `SELECT id, data_encrypted
       FROM records
       WHERE id = $1 AND user_id = $2`,
      [recordId, req.auth.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Record not found' });
    }

    const payload = decryptJson(result.rows[0].data_encrypted);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="record-${recordId}.json"`);
    return res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('Failed to download record', err);
    return res.status(500).json({ message: 'Failed to download record' });
  }
});

router.get('/:recordId/files/:fileId/download', async (req, res) => {
  const recordId = Number(req.params.recordId);
  const fileId = Number(req.params.fileId);

  if (!Number.isInteger(recordId) || !Number.isInteger(fileId)) {
    return res.status(400).json({ message: 'Invalid identifiers' });
  }

  try {
    const recordRes = await query(
      `SELECT id FROM records WHERE id = $1 AND user_id = $2`,
      [recordId, req.auth.id]
    );
    if (recordRes.rowCount === 0) {
      return res.status(404).json({ message: 'Record not found' });
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
    console.error('Failed to download record attachment', err);
    return res.status(500).json({ message: 'Failed to download file' });
  }
});

export default router;
