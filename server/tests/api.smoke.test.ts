import supertest from 'supertest';
import path from 'path';
import fs from 'fs/promises';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { env } from '../src/config/env';

const agent: any = supertest(app);
const deviceFingerprint = 'integration-suite-device';

const staffLogin = async (email: string, password: string) => {
  const res = await agent
    .post('/auth/staff/login')
    .set('X-Device-Fingerprint', deviceFingerprint)
    .send({ email, password })
    .expect(200);
  expect(res.body.access_token).toBeDefined();
  return res.body.access_token as string;
};

const patientLogin = async (identifier: string, password: string) => {
  const res = await agent
    .post('/auth/patient/login')
    .set('X-Device-Fingerprint', deviceFingerprint)
    .send({ identifier, password })
    .expect(200);
  expect(res.body.access_token).toBeDefined();
  return res.body.access_token as string;
};

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('API smoke workflow', () => {
  let adminToken: string;
  let doctorToken: string;
  let receptionistToken: string;
  let patientToken: string;
  let doctorProfileId: string;
  let specializationInternalMedId: string | null = null;

  let createdPatientId: string | null = null;
  let createdCaseId: string | null = null;
  let createdVisitId: string | null = null;
  let createdAppointmentId: string | null = null;
  let uploadedFileId: string | null = null;

  beforeAll(async () => {
    await prisma.$connect();
    const doctorProfile = await prisma.doctorProfile.findFirst();
    if (!doctorProfile) {
      throw new Error('Missing seeded doctor profile. Run prisma seed first.');
    }
    doctorProfileId = doctorProfile.id;

    adminToken = await staffLogin('admin@example.com', 'Admin!234');
    doctorToken = await staffLogin('drhouse@example.com', 'Doctor!234');
    receptionistToken = await staffLogin('frontdesk@example.com', 'Reception!234');
    patientToken = await patientLogin('patient@example.com', 'Patient!234');

    const specializationRes = await agent
      .get('/specializations')
      .set(authHeader(receptionistToken))
      .expect(200);

    const internalMed = specializationRes.body.data.find((spec: any) => spec.name === 'Internal Medicine');
    expect(internalMed).toBeDefined();
    specializationInternalMedId = internalMed.id;

    const doctorDirectoryRes = await agent
      .get('/doctors')
      .set(authHeader(receptionistToken))
      .query({ specialization: 'Internal Medicine' })
      .expect(200);

    expect(
      doctorDirectoryRes.body.data.some((doc: any) => doc.id === doctorProfileId && doc.specialization_id === specializationInternalMedId)
    ).toBe(true);
  });

  afterAll(async () => {
    if (createdAppointmentId) {
      await prisma.appointment.deleteMany({ where: { id: createdAppointmentId } });
    }

    if (createdVisitId) {
      await prisma.prescription.deleteMany({ where: { visitId: createdVisitId } });
      await prisma.visit.deleteMany({ where: { id: createdVisitId } });
    }

    if (createdCaseId) {
      await prisma.case.deleteMany({ where: { id: createdCaseId } });
    }

    if (createdPatientId) {
      await prisma.patientProfile.deleteMany({ where: { id: createdPatientId } });
    }

    if (uploadedFileId) {
      await prisma.file.deleteMany({ where: { id: uploadedFileId } });
    }

    await prisma.$disconnect();

    await fs.rm(path.resolve(env.FILE_STORAGE_DIR), { recursive: true, force: true }).catch(() => undefined);
  });

  it('executes the primary clinical workflow end-to-end', async () => {
    const patientPayload = {
      first_name: 'Integration',
      last_name: `Tester-${Date.now()}`,
      dob: '1991-05-05',
      phone: '+1-555-9999'
    };

    const patientRes = await agent
      .post('/patients')
      .set(authHeader(receptionistToken))
      .send(patientPayload)
      .expect(201);

    createdPatientId = patientRes.body.patient.id;
    expect(patientRes.body.patient.mrn).toMatch(/^MRN-/);

    await agent
      .get(`/patients/${createdPatientId}`)
      .set(authHeader(receptionistToken))
      .expect(200);

    const caseRes = await agent
      .post('/cases')
      .set(authHeader(receptionistToken))
      .send({
        patient_id: createdPatientId,
        assigned_doctor_id: doctorProfileId,
        summary: 'Integration case',
        symptoms_text: 'Automated workflow coverage'
      })
      .expect(201);

    createdCaseId = caseRes.body.case.id;
    expect(caseRes.body.case.status).toBe('OPEN');

    const doctorCases = await agent
      .get('/cases')
      .set(authHeader(doctorToken))
      .expect(200);
    expect(doctorCases.body.data.some((c: any) => c.id === createdCaseId)).toBe(true);

    const visitRes = await agent
      .post(`/cases/${createdCaseId}/visits`)
      .set(authHeader(doctorToken))
      .send({
        visit_datetime: new Date().toISOString(),
        vitals: { bp: '118/76', hr: 70 },
        notes: 'Integration visit note'
      })
      .expect(201);

    createdVisitId = visitRes.body.visit.id;

    const samplePdf = path.resolve(__dirname, 'fixtures', 'sample.pdf');

    const fileUploadRes = await agent
      .post('/files')
      .set(authHeader(doctorToken))
      .field('case_id', createdCaseId)
      .field('visit_id', createdVisitId)
      .attach('file', samplePdf)
      .expect(201);

    uploadedFileId = fileUploadRes.body.file.id;

    const patientFileMeta = await agent
      .get(`/files/${uploadedFileId}/meta`)
      .set(authHeader(patientToken))
      .expect(200);

    expect(patientFileMeta.body.file.filename).toContain('.pdf');

    const downloadUrlRes = await agent
      .get(`/files/${uploadedFileId}/download`)
      .set(authHeader(patientToken))
      .expect(200);

    const streamRes = await agent.get(downloadUrlRes.body.url).expect(200);
    expect(streamRes.headers['content-type']).toBe('application/pdf');

    await agent
      .put(`/visits/${createdVisitId}/prescription`)
      .set(authHeader(doctorToken))
      .send({
        medication_name: 'Vitamin D',
        dosage: '1000 IU',
        frequency: 'Daily',
        route: 'Oral',
        duration: '14 days',
        notes: 'Take with food'
      })
      .expect(200);

    const prescriptionRes = await agent
      .get(`/visits/${createdVisitId}/prescription`)
      .set(authHeader(adminToken))
      .expect(200);
    expect(prescriptionRes.body.prescription.medication_name).toBe('Vitamin D');

    const visitsRes = await agent
      .get(`/cases/${createdCaseId}/visits`)
      .set(authHeader(doctorToken))
      .expect(200);
    expect(visitsRes.body.data.length).toBeGreaterThan(0);

    const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const appointmentRes = await agent
      .post('/appointments')
      .set(authHeader(receptionistToken))
      .send({
        case_id: createdCaseId,
        start_time: start.toISOString(),
        end_time: end.toISOString()
      })
      .expect(201);

    createdAppointmentId = appointmentRes.body.appointment.id;

    await agent
      .patch(`/appointments/${createdAppointmentId}`)
      .set(authHeader(adminToken))
      .send({ status: 'COMPLETED' })
      .expect(200);

    const doctorAppointments = await agent
      .get('/appointments')
      .set(authHeader(doctorToken))
      .query({ limit: 10 })
      .expect(200);
    expect(doctorAppointments.body.data.some((appt: any) => appt.id === createdAppointmentId)).toBe(true);

    await agent
      .get(`/doctors/${doctorProfileId}/availability`)
      .set(authHeader(patientToken))
      .expect(200);

    await agent
      .post(`/cases/${createdCaseId}/close`)
      .set(authHeader(doctorToken))
      .send({ summary: 'Resolved via automation' })
      .expect(200);

    const receptionistOpenCases = await agent
      .get('/cases')
      .set(authHeader(receptionistToken))
      .query({ status: 'OPEN', patient_id: createdPatientId })
      .expect(200);

    expect(receptionistOpenCases.body.data.every((c: any) => c.id !== createdCaseId)).toBe(true);
  });
});
