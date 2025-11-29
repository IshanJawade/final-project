import { Router } from 'express';
import { requireUser } from '../middleware/auth.js';
import { query } from '../db.js';
import { encryptJson, decryptJson } from '../utils/encryption.js';

const router = Router();
router.use(requireUser);

router.post('/', async (req, res) => {
  const { data, medical_professional_id: medicalProfessionalId } = req.body;
  if (!data) {
    return res.status(400).json({ message: 'Record data is required' });
  }

  try {
    const encrypted = encryptJson(data);
    const result = await query(
      `INSERT INTO records (user_id, medical_professional_id, data_encrypted)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, medical_professional_id, created_at, updated_at`,
      [req.auth.id, medicalProfessionalId || null, encrypted]
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

router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, medical_professional_id, data_encrypted, created_at, updated_at
       FROM records
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.auth.id]
    );

    const records = result.rows.map((row) => ({
      id: row.id,
      medical_professional_id: row.medical_professional_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      data: decryptJson(row.data_encrypted),
    }));

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
      `SELECT id, medical_professional_id, data_encrypted, created_at, updated_at
       FROM records
       WHERE id = $1 AND user_id = $2`,
      [recordId, req.auth.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Record not found' });
    }

    const row = result.rows[0];
    return res.json({
      record: {
        id: row.id,
        medical_professional_id: row.medical_professional_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        data: decryptJson(row.data_encrypted),
      },
    });
  } catch (err) {
    console.error('Failed to load record', err);
    return res.status(500).json({ message: 'Failed to load record' });
  }
});

export default router;
