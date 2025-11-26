export type Role = 'ADMIN' | 'DOCTOR' | 'RECEPTIONIST' | 'PATIENT';

export type UserProfile = {
  id: string;
  email: string;
  role: Role;
  first_name: string;
  last_name: string;
  is_active: boolean;
  two_factor_enabled: boolean;
};

export type SpecializationSummary = {
  id: string;
  name: string;
};

export type StaffRecord = {
  id: string;
  email: string;
  role: 'DOCTOR' | 'RECEPTIONIST';
  first_name: string;
  last_name: string;
  phone: string | null;
  dob: string | null;
  is_active: boolean;
  doctor_profile: null | {
    id: string;
    specialization_id: string | null;
    specialization_name: string | null;
    license_number: string | null;
  };
};

export type PatientSummary = {
  id: string;
  mrn: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  dob: string;
  contact_info?: unknown;
  address?: unknown;
  emergency_contact?: unknown;
  created_at: string;
  updated_at: string;
};

export type CaseSummary = {
  id: string;
  status: 'OPEN' | 'CLOSED';
  summary: string | null;
  patient: {
    id: string;
    mrn: string;
    first_name: string;
    last_name: string;
  } | null;
  assigned_doctor: {
    id: string;
    user_id: string;
    first_name: string;
    last_name: string;
    specialization: string | null;
  } | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  visits_count: number;
  symptoms_text?: string | null;
};

export type AppointmentSummary = {
  id: string;
  case_id: string;
  start_time: string;
  end_time: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  case_status: 'OPEN' | 'CLOSED';
  doctor: {
    id: string;
    first_name: string;
    last_name: string;
    specialization: string | null;
  };
  patient?: {
    id: string;
    mrn: string;
    first_name: string;
    last_name: string;
  };
  created_at: string;
  updated_at: string;
};
