type Role = 'ADMIN' | 'DOCTOR' | 'RECEPTIONIST' | 'PATIENT';

type PatientRecord = {
  id: string;
  patient_code: string;
  mrn: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  dob: Date;
  contact_info: unknown | null;
  address: unknown | null;
  emergency_contact: unknown | null;
  created_at: Date;
  updated_at: Date;
  userId: string | null;
};

export const serializePatientForRole = (patient: PatientRecord, role: Role, currentUserId?: string) => {
  const base = {
    id: patient.id,
    patient_code: patient.patient_code,
    mrn: patient.mrn,
    first_name: patient.first_name,
    last_name: patient.last_name,
    phone: patient.phone,
    dob: patient.dob.toISOString().split('T')[0],
    created_at: patient.created_at,
    updated_at: patient.updated_at
  };

  const includeFullDetails =
    role === 'ADMIN' ||
    role === 'DOCTOR' ||
    (role === 'PATIENT' && patient.userId && patient.userId === currentUserId);

  if (includeFullDetails) {
    return {
      ...base,
      contact_info: patient.contact_info,
      address: patient.address,
      emergency_contact: patient.emergency_contact
    };
  }

  return base;
};
