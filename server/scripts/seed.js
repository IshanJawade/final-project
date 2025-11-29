import '../src/config.js';
import bcrypt from 'bcryptjs';
import { pool, query } from '../src/db.js';
import { generateMuid } from '../src/utils/muid.js';
import { encryptJson } from '../src/utils/encryption.js';

const admins = [
  {
    username: 'admin1',
    password: 'AdminPass123!',
    name: 'Admin One',
    email: 'admin1@example.com',
    mobile: '555-1001',
    address: '1 Admin Way',
  },
  {
    username: 'admin2',
    password: 'AdminPass456!',
    name: 'Admin Two',
    email: 'admin2@example.com',
    mobile: '555-1002',
    address: '2 Admin Way',
  },
];

const users = [
  {
    name: 'Alice Patient',
    yearOfBirth: 1985,
    email: 'alice.patient@example.com',
    mobile: '555-2001',
    address: '100 Main Street',
    password: 'NewPassword',
  },
  {
    name: 'Bob Patient',
    yearOfBirth: 1990,
    email: 'bob.patient@example.com',
    mobile: '555-2002',
    address: '101 Main Street',
    password: 'PatientPass456!',
  },
];

const professionals = [
  {
    username: 'drsarah',
    name: 'Dr. Sarah Smith',
    email: 'sarah.smith@hospital.com',
    mobile: '555-3001',
    address: '200 Clinic Ave',
    company: 'Metro Health',
    password: 'DoctorPass123!',
  },
  {
    username: 'drjohn',
    name: 'Dr. John Miller',
    email: 'john.miller@hospital.com',
    mobile: '555-3002',
    address: '201 Clinic Ave',
    company: 'Metro Health',
    password: 'DoctorPass456!',
  },
];

async function upsertAdmin(admin) {
  const passwordHash = await bcrypt.hash(admin.password, 10);
  const existing = await query('SELECT id FROM admins WHERE username = $1', [admin.username]);
  if (existing.rowCount > 0) {
    await query(
      `UPDATE admins
       SET password_hash = $1, name = $2, email = $3, mobile = $4, address = $5, updated_at = NOW()
       WHERE id = $6`,
      [passwordHash, admin.name, admin.email.toLowerCase(), admin.mobile, admin.address, existing.rows[0].id]
    );
    return existing.rows[0].id;
  }

  const res = await query(
    `INSERT INTO admins (username, password_hash, name, email, mobile, address)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      admin.username.toLowerCase(),
      passwordHash,
      admin.name,
      admin.email.toLowerCase(),
      admin.mobile,
      admin.address,
    ]
  );
  return res.rows[0].id;
}

async function upsertUser(user) {
  const email = user.email.toLowerCase();
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  const passwordHash = await bcrypt.hash(user.password, 10);

  if (existing.rowCount > 0) {
    await query(
      `UPDATE users
       SET password_hash = $1, name = $2, mobile = $3, address = $4, is_approved = TRUE, updated_at = NOW()
       WHERE id = $5`,
      [passwordHash, user.name, user.mobile, user.address, existing.rows[0].id]
    );
    return existing.rows[0].id;
  }

  const muid = generateMuid(user.name, user.yearOfBirth);
  const res = await query(
    `INSERT INTO users (muid, password_hash, name, email, mobile, address, year_of_birth, is_approved)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
     RETURNING id`,
    [muid, passwordHash, user.name, email, user.mobile, user.address, user.yearOfBirth]
  );
  return res.rows[0].id;
}

async function upsertProfessional(pro) {
  const username = pro.username.toLowerCase();
  const existing = await query('SELECT id FROM medical_professionals WHERE username = $1', [username]);
  const passwordHash = await bcrypt.hash(pro.password, 10);

  if (existing.rowCount > 0) {
    await query(
      `UPDATE medical_professionals
       SET password_hash = $1, name = $2, email = $3, mobile = $4, address = $5, company = $6,
           is_approved = TRUE, updated_at = NOW()
       WHERE id = $7`,
      [
        passwordHash,
        pro.name,
        pro.email.toLowerCase(),
        pro.mobile,
        pro.address,
        pro.company,
        existing.rows[0].id,
      ]
    );
    return existing.rows[0].id;
  }

  const res = await query(
    `INSERT INTO medical_professionals (username, password_hash, name, email, mobile, address, company, is_approved)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
     RETURNING id`,
    [
      username,
      passwordHash,
      pro.name,
      pro.email.toLowerCase(),
      pro.mobile,
      pro.address,
      pro.company,
    ]
  );
  return res.rows[0].id;
}

async function seedAccessAndRecords(userIds, professionalIds) {
  if (userIds.length === 0 || professionalIds.length === 0) {
    return;
  }

  const [userId] = userIds;
  const [professionalId] = professionalIds;

  const accessActive = await query(
    `SELECT id FROM access
     WHERE user_id = $1 AND medical_professional_id = $2 AND access_revoked_at IS NULL
       AND (access_expires_at IS NULL OR access_expires_at > NOW())`,
    [userId, professionalId]
  );
  if (accessActive.rowCount === 0) {
    await query(
      `INSERT INTO access (user_id, medical_professional_id, access_granted_at, access_expires_at, access_revoked_at)
       VALUES ($1, $2, NOW(), NOW() + INTERVAL '90 days', NULL)`,
      [userId, professionalId]
    );
  }

  const recordExists = await query('SELECT id FROM records WHERE user_id = $1 LIMIT 1', [userId]);
  if (recordExists.rowCount === 0) {
    const encrypted = encryptJson({
      summary: 'Annual physical exam',
      diagnosis: 'Healthy',
      notes: 'Patient in good health. Continue exercise routine.',
    });
    await query(
      `INSERT INTO records (user_id, medical_professional_id, data_encrypted)
       VALUES ($1, $2, $3)`,
      [userId, professionalId, encrypted]
    );
  }
}

async function run() {
  try {
    await query('DELETE FROM access_requests');

    for (const admin of admins) {
      await upsertAdmin(admin);
    }

    const userIds = [];
    for (const user of users) {
      const id = await upsertUser(user);
      userIds.push(id);
    }

    const professionalIds = [];
    for (const pro of professionals) {
      const id = await upsertProfessional(pro);
      professionalIds.push(id);
    }

    await seedAccessAndRecords(userIds, professionalIds);

    if (userIds[1] && professionalIds[1]) {
      const pending = await query(
        `SELECT id FROM access_requests
         WHERE user_id = $1 AND medical_professional_id = $2 AND status = 'pending'`,
        [userIds[1], professionalIds[1]]
      );
      if (pending.rowCount === 0) {
        await query(
          `INSERT INTO access_requests (user_id, medical_professional_id, requested_message)
           VALUES ($1, $2, $3)`,
          [userIds[1], professionalIds[1], 'Requesting access to review recent test results.']
        );
      } else {
        await query(
          `UPDATE access_requests
           SET requested_message = $2, updated_at = NOW()
           WHERE id = $1`,
          [pending.rows[0].id, 'Requesting access to review recent test results.']
        );
      }
    }

    console.log('Seed data ready. Admin accounts:', admins.map((a) => a.username).join(', '));
  } catch (err) {
    console.error('Seeding failed', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
