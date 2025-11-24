type Role = 'ADMIN' | 'DOCTOR' | 'RECEPTIONIST' | 'PATIENT';

type DoctorSummary = {
  id: string;
  userId: string;
  user: {
    first_name: string;
    last_name: string;
  };
  specialization?: {
    name: string;
  } | null;
};

type PatientSummary = {
  id: string;
  mrn: string;
  first_name: string;
  last_name: string;
  userId: string | null;
};

export type AppointmentWithRelations = {
  id: string;
  caseId: string;
  doctorId: string;
  patientId: string;
  start_time: Date;
  end_time: Date;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  created_at: Date;
  updated_at: Date;
  doctor: DoctorSummary;
  patient: PatientSummary;
  case: {
    id: string;
    status: 'OPEN' | 'CLOSED';
  };
};

const shouldShowPatient = (record: AppointmentWithRelations, role: Role, currentUserId?: string) => {
  if (role === 'ADMIN' || role === 'RECEPTIONIST') {
    return true;
  }
  if (role === 'DOCTOR' && record.doctor.userId === currentUserId) {
    return true;
  }
  if (role === 'PATIENT' && record.patient.userId === currentUserId) {
    return true;
  }
  return false;
};

export const serializeAppointmentForRole = (record: AppointmentWithRelations, role: Role, currentUserId?: string) => {
  const doctor = {
    id: record.doctor.id,
    first_name: record.doctor.user.first_name,
    last_name: record.doctor.user.last_name,
    specialization: record.doctor.specialization?.name ?? null
  };

  const payload: Record<string, unknown> = {
    id: record.id,
    case_id: record.caseId,
    start_time: record.start_time,
    end_time: record.end_time,
    status: record.status,
    case_status: record.case.status,
    doctor,
    created_at: record.created_at,
    updated_at: record.updated_at
  };

  if (shouldShowPatient(record, role, currentUserId)) {
    payload.patient = {
      id: record.patient.id,
      mrn: record.patient.mrn,
      first_name: record.patient.first_name,
      last_name: record.patient.last_name
    };
  }

  return payload;
};
