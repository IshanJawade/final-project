import '../src/config.js';
import bcrypt from 'bcryptjs';
import { pool, query } from '../src/db.js';
import { normalizeDateOfBirth } from '../src/utils/dates.js';
import {
  buildProfessionalSecrets,
  buildUserSecrets,
} from '../src/utils/sensitive.js';
import { generateMuid } from '../src/utils/muid.js';
import { encryptBuffer, encryptJson } from '../src/utils/encryption.js';

const DEMO_PASSWORD = 'DemoPass123!';
const DEMO_PATIENT_COUNT = 20;
const DOCTOR_ACCOUNT = {
  username: 'drdemo',
  password: 'DoctorDemo123!',
  name: 'Dr. Morgan Lee',
  email: 'demo.doctor@metrohealth.example',
  mobile: '555-4800',
  address: '480 Medical Plaza, Suite 10',
  company: 'Metro Health Demo Clinic',
};

const SAMPLE_IMAGES = [
  {
    baseName: 'chest-xray.png',
    mimeType: 'image/png',
    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8AABgMBgRzi7h8AAAAASUVORK5CYII=',
  },
  {
    baseName: 'lab-chart.png',
    mimeType: 'image/png',
    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z/CfHgAFewJ/k3FQegAAAABJRU5ErkJggg==',
  },
  {
    baseName: 'prescription.png',
    mimeType: 'image/png',
    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/5+hHgAHggJ/94n1VwAAAABJRU5ErkJggg==',
  },
];

const recordTemplates = [
  (patient, visitDate) => ({
    summary: 'Annual wellness visit',
    visitDate,
    visitType: 'preventive',
    diagnosis: 'General wellness examination',
    notes: `${patient.firstName} reports feeling well. No acute concerns. Encouraged continued exercise routine and balanced nutrition.`,
    vitals: {
      bloodPressure: '118/76',
      heartRate: 70,
      temperatureF: 98.2,
      oxygenSaturation: 98,
    },
    lifestyle: {
      sleepHours: 7.5,
      exerciseMinutesPerWeek: 150,
      nutritionFocus: 'Increase leafy greens and lean protein.',
    },
    plan: {
      recommendations: ['Continue current lifestyle.', 'Schedule fasting labs within 12 months.'],
      followUp: 'Next annual visit in 12 months.',
    },
  }),
  (patient, visitDate) => ({
    summary: 'Hypertension follow-up',
    visitDate,
    visitType: 'follow-up',
    diagnosis: 'Primary hypertension',
    notes: `${patient.firstName} has maintained medication adherence. Discussed home blood pressure logs and stress management techniques.`,
    vitals: {
      bloodPressure: '124/82',
      heartRate: 74,
      temperatureF: 98.1,
      oxygenSaturation: 97,
    },
    medications: ['Lisinopril 10 mg daily'],
    plan: {
      recommendations: ['Continue current medication.', 'Recheck in clinic in 3 months.'],
      followUp: 'Monitor home readings twice weekly.',
    },
  }),
  (patient, visitDate) => ({
    summary: 'Lab results review',
    visitDate,
    visitType: 'lab review',
    diagnosis: 'Mild iron deficiency anemia',
    notes: `Discussed recent CBC and iron studies with ${patient.firstName}. Symptoms include mild fatigue mid-afternoon.`,
    labs: {
      hemoglobin: '11.2 g/dL',
      hematocrit: '34%',
      ferritin: '18 ng/mL',
      ironSaturation: '15%',
    },
    plan: {
      recommendations: [
        'Start ferrous sulfate 325 mg once daily with vitamin C.',
        'Repeat labs in 8 weeks.',
      ],
      followUp: 'Check-in via telehealth in 2 months.',
    },
  }),
  (patient, visitDate) => ({
    summary: 'Telehealth respiratory consult',
    visitDate,
    visitType: 'telehealth',
    diagnosis: 'Seasonal allergic rhinitis',
    notes: `${patient.firstName} reports congestion and itchy eyes during mornings. No fever or shortness of breath. Symptoms improve with antihistamines.`,
    plan: {
      recommendations: [
        'Begin daily nasal corticosteroid spray.',
        'Use HEPA filter at home and monitor pollen counts.',
      ],
      followUp: 'In-person visit if symptoms persist beyond 4 weeks.',
    },
    education: {
      triggers: ['High pollen counts', 'House dust'],
      adjustments: ['Rinse nasal passages nightly.', 'Keep bedroom windows closed.'],
    },
  }),
  (patient, visitDate) => ({
    summary: 'Physical therapy progress note',
    visitDate,
    visitType: 'rehabilitation',
    diagnosis: 'Lumbar strain',
    notes: `${patient.firstName} completed session focusing on core stabilization and hamstring stretching. Reports pain reduced to 2/10 post session.`,
    exercises: [
      { name: 'Pelvic tilts', sets: 3, reps: 12 },
      { name: 'Bird dog', sets: 3, reps: 10 },
      { name: 'Hamstring stretch', sets: 2, durationSeconds: 30 },
    ],
    plan: {
      recommendations: ['Continue home exercise program daily.', 'Ice lumbar region after activity.'],
      followUp: 'PT session scheduled in 1 week.',
    },
  }),
  (patient, visitDate) => ({
    summary: 'Medication management review',
    visitDate,
    visitType: 'medication review',
    diagnosis: 'Type 2 diabetes mellitus',
    notes: `${patient.firstName} reports good adherence to metformin and GLP-1 agonist. No hypoglycemic episodes reported.`,
    labs: {
      a1c: '7.1%',
      fastingGlucose: '118 mg/dL',
      creatinine: '0.9 mg/dL',
    },
    plan: {
      recommendations: ['Maintain current medication regimen.', 'Increase fiber intake to 30g daily.'],
      followUp: 'Schedule nutrition consult within 6 weeks.',
    },
  }),
];

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'item';
}

function buildPatientDataset() {
  const firstNames = [
    'Avery',
    'Blake',
    'Camila',
    'Dylan',
    'Emerson',
    'Finn',
    'Gia',
    'Hayden',
    'Isaac',
    'Jade',
    'Kai',
    'Lena',
    'Maya',
    'Noah',
    'Olivia',
    'Parker',
    'Quinn',
    'Riley',
    'Soren',
    'Taylor',
  ];
  const lastNames = [
    'Anderson',
    'Bennett',
    'Chambers',
    'Dalton',
    'Ellison',
    'Foster',
    'Garcia',
    'Hughes',
    'Iverson',
    'Jenkins',
    'Keller',
    'Lopez',
    'Merritt',
    'Nguyen',
    'Ortiz',
    'Patel',
    'Quincy',
    'Reynolds',
    'Sato',
    'Turner',
  ];

  return Array.from({ length: DEMO_PATIENT_COUNT }, (_, index) => {
    const month = ((index % 12) + 1).toString().padStart(2, '0');
    const day = (((index * 3) % 27) + 1).toString().padStart(2, '0');
    const year = 1976 + (index % 24);

    return {
      firstName: firstNames[index % firstNames.length],
      lastName: lastNames[index % lastNames.length],
      email: `demo.patient${String(index + 1).padStart(2, '0')}@example.com`,
      mobile: `555-5${(410 + index).toString()}`,
      address: `${200 + index} Demo Avenue, Metro City`,
      dateOfBirth: `${month}/${day}/${year}`,
      password: DEMO_PASSWORD,
    };
  });
}

async function upsertDemoProfessional() {
  const username = DOCTOR_ACCOUNT.username.toLowerCase();
  const normalizedEmail = DOCTOR_ACCOUNT.email.trim().toLowerCase();
  const secrets = buildProfessionalSecrets({
    name: DOCTOR_ACCOUNT.name,
    email: normalizedEmail,
    mobile: DOCTOR_ACCOUNT.mobile,
    address: DOCTOR_ACCOUNT.address,
    company: DOCTOR_ACCOUNT.company,
  });

  const passwordHash = await bcrypt.hash(DOCTOR_ACCOUNT.password, 10);
  const existing = await query('SELECT id FROM medical_professionals WHERE username = $1', [username]);
  if (existing.rowCount > 0) {
    await query(
      `UPDATE medical_professionals
          SET password_hash = $1,
              email_hash = $2,
              email_encrypted = $3,
              profile_encrypted = $4,
              is_approved = TRUE,
              updated_at = NOW()
        WHERE id = $5`,
      [passwordHash, secrets.emailHash, secrets.emailEncrypted, secrets.profileEncrypted, existing.rows[0].id]
    );
    return existing.rows[0].id;
  }

  const res = await query(
    `INSERT INTO medical_professionals (username, password_hash, email_hash, email_encrypted, profile_encrypted, is_approved)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     RETURNING id`,
    [username, passwordHash, secrets.emailHash, secrets.emailEncrypted, secrets.profileEncrypted]
  );
  return res.rows[0].id;
}

async function upsertDemoUser(patient) {
  const passwordHash = await bcrypt.hash(patient.password, 10);
  const { iso: dobIso, year } = normalizeDateOfBirth(patient.dateOfBirth);
  const firstName = patient.firstName.trim();
  const lastName = patient.lastName.trim();
  const fullName = `${firstName} ${lastName}`.trim();
  const normalizedEmail = patient.email.trim().toLowerCase();
  const secrets = buildUserSecrets({
    firstName,
    lastName,
    email: normalizedEmail,
    mobile: patient.mobile,
    address: patient.address,
    dateOfBirth: dobIso,
    yearOfBirth: year,
  });

  const existing = await query('SELECT id FROM users WHERE email_hash = $1', [secrets.emailHash]);
  if (existing.rowCount > 0) {
    await query(
      `UPDATE users
          SET password_hash = $1,
              email_hash = $2,
              email_encrypted = $3,
              profile_encrypted = $4,
              year_of_birth = $5,
              is_approved = TRUE,
              updated_at = NOW()
        WHERE id = $6`,
      [
        passwordHash,
        secrets.emailHash,
        secrets.emailEncrypted,
        secrets.profileEncrypted,
        year,
        existing.rows[0].id,
      ]
    );
    return existing.rows[0].id;
  }

  const muid = generateMuid(fullName, year);
  const res = await query(
    `INSERT INTO users (muid, password_hash, year_of_birth, email_hash, email_encrypted, profile_encrypted, is_approved)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)
     RETURNING id`,
    [muid, passwordHash, year, secrets.emailHash, secrets.emailEncrypted, secrets.profileEncrypted]
  );
  return res.rows[0].id;
}

async function resetPatientData(userId) {
  await query(
    `DELETE FROM record_files
      WHERE record_id IN (SELECT id FROM records WHERE user_id = $1)`,
    [userId]
  );
  await query('DELETE FROM records WHERE user_id = $1', [userId]);
  await query('DELETE FROM access WHERE user_id = $1', [userId]);
}

async function ensureAccess(userId, professionalId) {
  const res = await query(
    `SELECT id FROM access
      WHERE user_id = $1
        AND medical_professional_id = $2
        AND access_revoked_at IS NULL
        AND (access_expires_at IS NULL OR access_expires_at > NOW())`,
    [userId, professionalId]
  );
  if (res.rowCount > 0) {
    return res.rows[0].id;
  }

  const insert = await query(
    `INSERT INTO access (user_id, medical_professional_id, access_granted_at, access_expires_at, access_revoked_at)
     VALUES ($1, $2, NOW(), NOW() + INTERVAL '180 days', NULL)
     RETURNING id`,
    [userId, professionalId]
  );
  return insert.rows[0].id;
}

function chooseAttachments(patientIndex, recordIndex) {
  const attachments = [];
  const first = SAMPLE_IMAGES[(patientIndex + recordIndex) % SAMPLE_IMAGES.length];
  attachments.push(first);

  if ((patientIndex + recordIndex) % 3 !== 0) {
    const second = SAMPLE_IMAGES[(patientIndex + recordIndex + 1) % SAMPLE_IMAGES.length];
    attachments.push(second);
  }

  return attachments;
}

function makeVisitDate(patientIndex, recordIndex) {
  const daysAgo = 12 * (recordIndex + 1) + patientIndex;
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

async function createRecordsForPatient({ patient, userId, professionalId, patientIndex }) {
  const recordTotal = patientIndex % 2 === 0 ? 6 : 5;
  let created = 0;

  for (let recordIndex = 0; recordIndex < recordTotal; recordIndex += 1) {
    const visitDate = makeVisitDate(patientIndex, recordIndex);
    const template = recordTemplates[(patientIndex + recordIndex) % recordTemplates.length];
    const payload = template(patient, visitDate);
    payload.recordNumber = recordIndex + 1;
    payload.meta = {
      patientName: `${patient.firstName} ${patient.lastName}`,
      createdForDemo: true,
    };

    const encrypted = encryptJson(payload);
    const recordRes = await query(
      `INSERT INTO records (user_id, medical_professional_id, data_encrypted)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, professionalId, encrypted]
    );

    const recordId = recordRes.rows[0].id;
    const attachments = chooseAttachments(patientIndex, recordIndex);

    for (let fileIndex = 0; fileIndex < attachments.length; fileIndex += 1) {
      const attachment = attachments[fileIndex];
      const buffer = Buffer.from(attachment.base64, 'base64');
      const encryptedFile = encryptBuffer(buffer);
      const fileName = `${slugify(patient.firstName)}-${slugify(patient.lastName)}-record${recordIndex + 1}-file${fileIndex + 1}-${attachment.baseName}`;

      await query(
        `INSERT INTO record_files (record_id, medical_professional_id, file_name, mime_type, file_size, file_encrypted)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [recordId, professionalId, fileName, attachment.mimeType, buffer.length, encryptedFile]
      );
    }

    created += 1;
  }

  return created;
}

async function run() {
  try {
    const professionalId = await upsertDemoProfessional();
    const patients = buildPatientDataset();
    let totalRecords = 0;

    for (let index = 0; index < patients.length; index += 1) {
      const patient = patients[index];
      const userId = await upsertDemoUser(patient);
      await resetPatientData(userId);
      await ensureAccess(userId, professionalId);
      totalRecords += await createRecordsForPatient({
        patient,
        userId,
        professionalId,
        patientIndex: index,
      });
    }

    console.log(`Seeded ${patients.length} demo patients with ${totalRecords} records and attachments.`);
  } catch (err) {
    console.error('Demo seed failed', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
