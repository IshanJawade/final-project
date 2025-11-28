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

export type DoctorSummary = {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  specialization_id: string | null;
  specialization: string | null;
  license_number: string | null;
  is_active: boolean;
};

export type PatientSummary = {
  id: string;
  patient_code: string;
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
  case_code: string;
  status: 'OPEN' | 'CLOSED';
  summary: string | null;
  patient: {
    id: string;
    patient_code: string;
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
  case_code: string;
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
    patient_code: string;
    mrn: string;
    first_name: string;
    last_name: string;
  };
  created_at: string;
  updated_at: string;
};

export type AvailabilitySlot = {
  id: string;
  doctorId: string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
};

export type VisitSummary = {
  id: string;
  caseId: string;
  visit_number: number;
  visit_datetime: string;
  vitals: Record<string, unknown>;
  notes: string;
  created_at: string;
  updated_at: string;
  prescription: PrescriptionSummary | null;
};

export type PrescriptionSummary = {
  id: string;
  visitId: string;
  medication_name: string;
  dosage: string;
  frequency: string;
  route: string;
  duration: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FileSummary = {
  id: string;
  caseId: string;
  visitId: string | null;
  filename: string;
  mimetype: string;
  size_bytes: number;
  created_at: string;
};

export type CaseDetail = CaseSummary & {
  visits?: VisitSummary[];
  files?: FileSummary[];
};

export type DashboardMetrics = {
  patients_total: number;
  doctors_total: number;
  receptionists_total: number;
  open_cases_total: number;
  appointments_today: number;
};

export type AuditLogEntry = {
  id: string;
  timestamp: string;
  actor: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: Role;
  } | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  before_json: unknown;
  after_json: unknown;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  outcome: 'SUCCESS' | 'DENY' | 'ERROR';
};
