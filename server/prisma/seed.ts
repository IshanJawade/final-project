import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password';
import { allocateCaseCode, allocatePatientCode } from '../src/utils/friendlyIds';

const prisma = new PrismaClient();

const SPECIALIZATIONS = [
  'Internal Medicine',
  'Cardiology',
  'Neurology',
  'Pediatrics',
  'Oncology'
];

const AVAILABILITY_SLOTS = [
  { start: '2025-01-02T09:00:00Z', end: '2025-01-02T09:30:00Z' },
  { start: '2025-01-02T09:45:00Z', end: '2025-01-02T10:15:00Z' },
  { start: '2025-01-02T10:30:00Z', end: '2025-01-02T11:00:00Z' }
];

async function upsertSpecializations() {
  const map = new Map<string, string>();
  for (const name of SPECIALIZATIONS) {
    const record = await prisma.specialization.upsert({
      where: { name },
      update: {},
      create: { name }
    });
    map.set(name, record.id);
  }
  return map;
}

async function seedUsers(specializationMap: Map<string, string>) {
  const [adminPassword, doctorPassword, receptionistPassword, patientPassword] = await Promise.all([
    hashPassword('Admin!234'),
    hashPassword('Doctor!234'),
    hashPassword('Reception!234'),
    hashPassword('Patient!234')
  ]);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {
      password_hash: adminPassword,
      role: 'ADMIN',
      first_name: 'Alice',
      last_name: 'Admin',
      dob: new Date('1980-04-12'),
      phone: '+1-555-0001',
      is_active: true,
      failed_login_attempts: 0,
      locked_until: null,
      two_factor_enabled: false,
      totp_secret: null
    },
    create: {
      email: 'admin@example.com',
      password_hash: adminPassword,
      role: 'ADMIN',
      first_name: 'Alice',
      last_name: 'Admin',
      dob: new Date('1980-04-12'),
      phone: '+1-555-0001'
    }
  });

  const doctorUser = await prisma.user.upsert({
    where: { email: 'drhouse@example.com' },
    update: {
      password_hash: doctorPassword,
      role: 'DOCTOR',
      first_name: 'Gregory',
      last_name: 'House',
      dob: new Date('1975-06-11'),
      phone: '+1-555-0002',
      is_active: true,
      failed_login_attempts: 0,
      locked_until: null,
      two_factor_enabled: false,
      totp_secret: null
    },
    create: {
      email: 'drhouse@example.com',
      password_hash: doctorPassword,
      role: 'DOCTOR',
      first_name: 'Gregory',
      last_name: 'House',
      dob: new Date('1975-06-11'),
      phone: '+1-555-0002'
    }
  });

  const receptionistUser = await prisma.user.upsert({
    where: { email: 'frontdesk@example.com' },
    update: {
      password_hash: receptionistPassword,
      role: 'RECEPTIONIST',
      first_name: 'Rita',
      last_name: 'Reception',
      dob: new Date('1992-02-20'),
      phone: '+1-555-0003',
      is_active: true,
      failed_login_attempts: 0,
      locked_until: null,
      two_factor_enabled: false,
      totp_secret: null
    },
    create: {
      email: 'frontdesk@example.com',
      password_hash: receptionistPassword,
      role: 'RECEPTIONIST',
      first_name: 'Rita',
      last_name: 'Reception',
      dob: new Date('1992-02-20'),
      phone: '+1-555-0003'
    }
  });

  const nextPatientCode = await allocatePatientCode(prisma);
  const patientProfile = await prisma.patientProfile.upsert({
    where: { mrn: 'MRN-1001' },
    update: {
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '+1-555-1001',
      dob: new Date('1990-01-15')
    },
    create: {
      patient_code: nextPatientCode,
      mrn: 'MRN-1001',
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '+1-555-1001',
      dob: new Date('1990-01-15')
    }
  });

  const patientUser = await prisma.user.upsert({
    where: { email: 'patient@example.com' },
    update: {
      password_hash: patientPassword,
      role: 'PATIENT',
      first_name: patientProfile.first_name,
      last_name: patientProfile.last_name,
      dob: patientProfile.dob,
      phone: patientProfile.phone ?? undefined,
      is_active: true,
      failed_login_attempts: 0,
      locked_until: null,
      two_factor_enabled: false,
      totp_secret: null
    },
    create: {
      email: 'patient@example.com',
      password_hash: patientPassword,
      role: 'PATIENT',
      first_name: patientProfile.first_name,
      last_name: patientProfile.last_name,
      dob: patientProfile.dob,
      phone: patientProfile.phone ?? undefined
    }
  });

  await prisma.patientProfile.update({
    where: { id: patientProfile.id },
    data: { userId: patientUser.id }
  });

  const doctorProfile = await prisma.doctorProfile.upsert({
    where: { userId: doctorUser.id },
    update: {},
    create: {
      userId: doctorUser.id,
      specializationId: specializationMap.get('Internal Medicine'),
      license_number: 'MD-INT-2025'
    }
  });

  await prisma.availabilitySlot.deleteMany({ where: { doctorId: doctorProfile.id } });
  for (const slot of AVAILABILITY_SLOTS) {
    await prisma.availabilitySlot.create({
      data: {
        doctorId: doctorProfile.id,
        start_time: new Date(slot.start),
        end_time: new Date(slot.end)
      }
    });
  }

  const nextCaseCode = await allocateCaseCode(prisma);
  const caseRecord = await prisma.case.upsert({
    where: { id: '11111111-1111-1111-1111-111111111111' },
    update: {},
    create: {
      id: '11111111-1111-1111-1111-111111111111',
      case_code: nextCaseCode,
      patientId: patientProfile.id,
      assignedDoctorId: doctorProfile.id,
      status: 'OPEN',
      summary: 'Persistent headache and fatigue',
      symptoms_text: 'Patient reports headaches for two weeks with intermittent dizziness.',
      created_by_user_id: receptionistUser.id
    }
  });

  const visitRecord = await prisma.visit.upsert({
    where: { id: '22222222-2222-2222-2222-222222222222' },
    update: {},
    create: {
      id: '22222222-2222-2222-2222-222222222222',
      caseId: caseRecord.id,
      visit_number: 1,
      visit_datetime: new Date('2025-01-02T09:00:00Z'),
      vitals: { bp: '120/80', hr: 72, temp_c: 36.8 },
      notes: 'Initial consultation. Ordered labs and recommended rest.',
      created_by_doctor_id: doctorUser.id
    }
  });

  await prisma.prescription.upsert({
    where: { visitId: visitRecord.id },
    update: {},
    create: {
      visitId: visitRecord.id,
      medication_name: 'Ibuprofen',
      dosage: '400mg',
      frequency: 'Twice daily',
      route: 'Oral',
      duration: '7 days',
      notes: 'Take after meals.',
      created_by_doctor_id: doctorUser.id
    }
  });

  await prisma.appointment.upsert({
    where: { id: '33333333-3333-3333-3333-333333333333' },
    update: {},
    create: {
      id: '33333333-3333-3333-3333-333333333333',
      caseId: caseRecord.id,
      doctorId: doctorProfile.id,
      patientId: patientProfile.id,
      start_time: new Date('2025-01-03T09:00:00Z'),
      end_time: new Date('2025-01-03T09:30:00Z'),
      status: 'SCHEDULED',
      created_by_user_id: receptionistUser.id
    }
  });

  return { adminUser, doctorUser, receptionistUser, patientUser };
}

async function main() {
  const specializationMap = await upsertSpecializations();
  await seedUsers(specializationMap);
  console.log('Seed data ready: default users, specializations, availability, sample case.');
}

main()
  .catch((err) => {
    console.error('Seeding error', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
