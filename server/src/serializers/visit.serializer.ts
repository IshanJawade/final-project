type Role = 'ADMIN' | 'DOCTOR' | 'RECEPTIONIST' | 'PATIENT';

type AssignedDoctorProjection = {
  id: string;
  userId: string;
  user: {
    first_name: string;
    last_name: string;
  };
};

type CaseProjection = {
  id: string;
  status: 'OPEN' | 'CLOSED';
  patient: {
    id: string;
    userId: string | null;
  };
  assignedDoctor: AssignedDoctorProjection | null;
};

type PrescriptionRecord = {
  id: string;
  visitId: string;
  medication_name: string;
  dosage: string;
  frequency: string;
  route: string;
  duration: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

export type VisitWithRelations = {
  id: string;
  caseId: string;
  visit_number: number;
  visit_datetime: Date;
  vitals: Record<string, unknown>;
  notes: string;
  created_at: Date;
  updated_at: Date;
  case: CaseProjection;
  prescription: PrescriptionRecord | null;
};

const canSeeVisitDetails = (record: VisitWithRelations, role: Role, currentUserId?: string) => {
  if (role === 'ADMIN') {
    return true;
  }
  if (role === 'DOCTOR' && record.case.assignedDoctor?.userId === currentUserId) {
    return true;
  }
  if (role === 'PATIENT' && record.case.patient.userId === currentUserId) {
    return true;
  }
  return false;
};

export const serializePrescription = (record: PrescriptionRecord) => ({
  id: record.id,
  visit_id: record.visitId,
  medication_name: record.medication_name,
  dosage: record.dosage,
  frequency: record.frequency,
  route: record.route,
  duration: record.duration,
  notes: record.notes,
  created_at: record.created_at,
  updated_at: record.updated_at
});

export const serializeVisitForRole = (record: VisitWithRelations, role: Role, currentUserId?: string) => {
  const base = {
    id: record.id,
    case_id: record.caseId,
    visit_number: record.visit_number,
    visit_datetime: record.visit_datetime,
    status: record.case.status,
    created_at: record.created_at,
    updated_at: record.updated_at
  };

  if (canSeeVisitDetails(record, role, currentUserId)) {
    return {
      ...base,
      vitals: record.vitals,
      notes: record.notes,
      prescription: record.prescription ? serializePrescription(record.prescription) : null
    };
  }

  return base;
};
