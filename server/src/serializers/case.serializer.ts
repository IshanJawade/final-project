type Role = 'ADMIN' | 'DOCTOR' | 'RECEPTIONIST' | 'PATIENT';

type PatientProjection = {
  id: string;
  patient_code: string;
  mrn: string;
  first_name: string;
  last_name: string;
  userId: string | null;
};

type DoctorProjection = {
  id: string;
  userId: string;
  user: {
    first_name: string;
    last_name: string;
  };
  specialization: {
    name: string;
  } | null;
};

export type CaseWithRelations = {
  id: string;
  case_code: string;
  status: 'OPEN' | 'CLOSED';
  summary: string | null;
  symptoms_text: string | null;
  patient: PatientProjection | null;
  assignedDoctor: DoctorProjection | null;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
  _count?: { visits: number };
};

const canSeeClinicalDetails = (record: CaseWithRelations, role: Role, currentUserId?: string) => {
  if (role === 'ADMIN') {
    return true;
  }
  if (role === 'DOCTOR' && record.assignedDoctor?.userId === currentUserId) {
    return true;
  }
  if (role === 'PATIENT' && record.patient?.userId === currentUserId) {
    return true;
  }
  return false;
};

export const serializeCaseForRole = (record: CaseWithRelations, role: Role, currentUserId?: string) => {
  const patient = record.patient
    ? {
        id: record.patient.id,
        patient_code: record.patient.patient_code,
        mrn: record.patient.mrn,
        first_name: record.patient.first_name,
        last_name: record.patient.last_name
      }
    : null;

  const assignedDoctor = record.assignedDoctor
    ? {
        id: record.assignedDoctor.id,
        user_id: record.assignedDoctor.userId,
        first_name: record.assignedDoctor.user.first_name,
        last_name: record.assignedDoctor.user.last_name,
        specialization: record.assignedDoctor.specialization?.name ?? null
      }
    : null;

  const base = {
    id: record.id,
    case_code: record.case_code,
    status: record.status,
    summary: record.summary,
    patient,
    assigned_doctor: assignedDoctor,
    created_at: record.created_at,
    updated_at: record.updated_at,
    closed_at: record.closed_at,
    visits_count: record._count?.visits ?? 0
  };

  if (canSeeClinicalDetails(record, role, currentUserId)) {
    return {
      ...base,
      symptoms_text: record.symptoms_text
    };
  }

  return base;
};
