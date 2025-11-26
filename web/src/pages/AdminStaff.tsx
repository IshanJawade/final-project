import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PatientSummary, SpecializationSummary, StaffRecord } from '../types';

type DoctorFormState = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  phone: string;
  dob: string;
  specialization_id: string;
  license_number: string;
};

type ReceptionistFormState = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  phone: string;
  dob: string;
};

type PatientFormState = {
  first_name: string;
  last_name: string;
  dob: string;
  phone: string;
};

const emptyDoctorForm: DoctorFormState = {
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  phone: '',
  dob: '',
  specialization_id: '',
  license_number: ''
};

const emptyReceptionistForm: ReceptionistFormState = {
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  phone: '',
  dob: ''
};

const emptyPatientForm: PatientFormState = {
  first_name: '',
  last_name: '',
  dob: '',
  phone: ''
};

const describeError = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.detail || `Request failed (${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unexpected error occurred.';
};

export const AdminStaffPage = () => {
  const { user, authedRequest } = useAuth();
  const isAdmin = user.role === 'ADMIN';

  const [doctorForm, setDoctorForm] = useState<DoctorFormState>(emptyDoctorForm);
  const [receptionistForm, setReceptionistForm] = useState<ReceptionistFormState>(emptyReceptionistForm);
  const [patientForm, setPatientForm] = useState<PatientFormState>(emptyPatientForm);

  const [doctorMessage, setDoctorMessage] = useState<string | null>(null);
  const [doctorError, setDoctorError] = useState<string | null>(null);
  const [receptionistMessage, setReceptionistMessage] = useState<string | null>(null);
  const [receptionistError, setReceptionistError] = useState<string | null>(null);
  const [patientMessage, setPatientMessage] = useState<string | null>(null);
  const [patientError, setPatientError] = useState<string | null>(null);

  const specializationQuery = useQuery({
    queryKey: ['specializations'],
    queryFn: () => authedRequest<{ data: SpecializationSummary[] }>('/specializations'),
    enabled: isAdmin
  });

  const specializationOptions = specializationQuery.data?.data ?? [];
  const defaultSpecializationId = useMemo(() => specializationOptions[0]?.id ?? '', [specializationOptions]);

  useEffect(() => {
    if (!doctorForm.specialization_id && defaultSpecializationId) {
      setDoctorForm((prev) => ({ ...prev, specialization_id: defaultSpecializationId }));
    }
  }, [doctorForm.specialization_id, defaultSpecializationId]);

  const doctorMutation = useMutation<{ staff: StaffRecord }, unknown, DoctorFormState>({
    mutationFn: async (payload) => {
      const phone = payload.phone.trim();
      const license = payload.license_number.trim();
      return authedRequest<{ staff: StaffRecord }>('/admin/staff', {
        method: 'POST',
        body: {
          role: 'DOCTOR',
          first_name: payload.first_name.trim(),
          last_name: payload.last_name.trim(),
          email: payload.email.trim().toLowerCase(),
          password: payload.password,
          phone: phone.length ? phone : undefined,
          dob: payload.dob,
          specialization_id: payload.specialization_id,
          license_number: license.length ? license : undefined
        }
      });
    },
    onSuccess: (response) => {
      setDoctorError(null);
      setDoctorMessage(`Created doctor profile for ${response.staff.first_name} ${response.staff.last_name}.`);
      setDoctorForm({
        ...emptyDoctorForm,
        specialization_id: defaultSpecializationId
      });
    },
    onError: (error) => {
      setDoctorMessage(null);
      setDoctorError(describeError(error));
    }
  });

  const receptionistMutation = useMutation<{ staff: StaffRecord }, unknown, ReceptionistFormState>({
    mutationFn: async (payload) => {
      const phone = payload.phone.trim();
      return authedRequest<{ staff: StaffRecord }>('/admin/staff', {
        method: 'POST',
        body: {
          role: 'RECEPTIONIST',
          first_name: payload.first_name.trim(),
          last_name: payload.last_name.trim(),
          email: payload.email.trim().toLowerCase(),
          password: payload.password,
          phone: phone.length ? phone : undefined,
          dob: payload.dob
        }
      });
    },
    onSuccess: (response) => {
      setReceptionistError(null);
      setReceptionistMessage(`Added receptionist ${response.staff.first_name} ${response.staff.last_name}.`);
      setReceptionistForm(emptyReceptionistForm);
    },
    onError: (error) => {
      setReceptionistMessage(null);
      setReceptionistError(describeError(error));
    }
  });

  const patientMutation = useMutation<{ patient: PatientSummary }, unknown, PatientFormState>({
    mutationFn: async (payload) => {
      const phone = payload.phone.trim();
      return authedRequest<{ patient: PatientSummary }>('/patients', {
        method: 'POST',
        body: {
          first_name: payload.first_name.trim(),
          last_name: payload.last_name.trim(),
          dob: payload.dob,
          phone: phone.length ? phone : undefined
        }
      });
    },
    onSuccess: (response) => {
      setPatientError(null);
      setPatientMessage(`Created patient ${response.patient.first_name} ${response.patient.last_name} · MRN ${response.patient.mrn}.`);
      setPatientForm(emptyPatientForm);
    },
    onError: (error) => {
      setPatientMessage(null);
      setPatientError(describeError(error));
    }
  });

  const handleDoctorSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDoctorMessage(null);
    doctorMutation.mutate(doctorForm);
  };

  const handleReceptionistSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setReceptionistMessage(null);
    receptionistMutation.mutate(receptionistForm);
  };

  const handlePatientSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPatientMessage(null);
    patientMutation.mutate(patientForm);
  };

  if (!isAdmin) {
    return (
      <div>
        <div className="page-heading">
          <h1>Administrator Access Required</h1>
        </div>
        <div className="panel">
          <p>Only administrators can manage staff onboarding. Please contact your system administrator if you believe this is an error.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-staff-page">
      <div className="page-heading">
        <h1>Staff Onboarding Console</h1>
        <span>Provision clinicians, reception teams, and patient records from a single control surface.</span>
      </div>

      <div className="grid-panel">
        <section className="panel">
          <header className="form-panel-header">
            <div>
              <h2>Enroll Doctor</h2>
              <p>Create credentials and profile for a new clinician.</p>
            </div>
          </header>
          <form className="form-grid" onSubmit={handleDoctorSubmit}>
            <label>
              First name
              <input
                required
                value={doctorForm.first_name}
                onChange={(event) => setDoctorForm((prev) => ({ ...prev, first_name: event.target.value }))}
              />
            </label>
            <label>
              Last name
              <input
                required
                value={doctorForm.last_name}
                onChange={(event) => setDoctorForm((prev) => ({ ...prev, last_name: event.target.value }))}
              />
            </label>
            <label>
              Email
              <input
                required
                type="email"
                value={doctorForm.email}
                onChange={(event) => setDoctorForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </label>
            <label>
              Temporary password
              <input
                required
                type="password"
                minLength={8}
                value={doctorForm.password}
                onChange={(event) => setDoctorForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </label>
            <label>
              Date of birth
              <input
                required
                type="date"
                value={doctorForm.dob}
                onChange={(event) => setDoctorForm((prev) => ({ ...prev, dob: event.target.value }))}
              />
            </label>
            <label>
              Phone
              <input
                placeholder="Optional"
                value={doctorForm.phone}
                onChange={(event) => setDoctorForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </label>
            <label>
              Specialization
              <select
                required
                value={doctorForm.specialization_id}
                onChange={(event) => setDoctorForm((prev) => ({ ...prev, specialization_id: event.target.value }))}
                disabled={specializationQuery.isLoading || specializationOptions.length === 0}
              >
                {specializationOptions.length === 0 ? (
                  <option value="">
                    {specializationQuery.isLoading ? 'Loading specializations...' : 'No specializations found'}
                  </option>
                ) : null}
                {specializationOptions.map((spec) => (
                  <option key={spec.id} value={spec.id}>
                    {spec.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              License number
              <input
                placeholder="Optional"
                value={doctorForm.license_number}
                onChange={(event) => setDoctorForm((prev) => ({ ...prev, license_number: event.target.value }))}
              />
            </label>
            <div className="form-actions">
              <button className="primary-btn" type="submit" disabled={doctorMutation.isPending || specializationOptions.length === 0}>
                {doctorMutation.isPending ? 'Creating...' : 'Create doctor'}
              </button>
            </div>
          </form>
          {specializationQuery.isError ? (
            <div className="feedback error">{describeError(specializationQuery.error)}</div>
          ) : null}
          {doctorError ? <div className="feedback error">{doctorError}</div> : null}
          {doctorMessage ? <div className="feedback success">{doctorMessage}</div> : null}
        </section>

        <section className="panel">
          <header className="form-panel-header">
            <div>
              <h2>Add Receptionist</h2>
              <p>Prepare front desk credentials and contact details.</p>
            </div>
          </header>
          <form className="form-grid" onSubmit={handleReceptionistSubmit}>
            <label>
              First name
              <input
                required
                value={receptionistForm.first_name}
                onChange={(event) => setReceptionistForm((prev) => ({ ...prev, first_name: event.target.value }))}
              />
            </label>
            <label>
              Last name
              <input
                required
                value={receptionistForm.last_name}
                onChange={(event) => setReceptionistForm((prev) => ({ ...prev, last_name: event.target.value }))}
              />
            </label>
            <label>
              Email
              <input
                required
                type="email"
                value={receptionistForm.email}
                onChange={(event) => setReceptionistForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </label>
            <label>
              Temporary password
              <input
                required
                type="password"
                minLength={8}
                value={receptionistForm.password}
                onChange={(event) => setReceptionistForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </label>
            <label>
              Date of birth
              <input
                required
                type="date"
                value={receptionistForm.dob}
                onChange={(event) => setReceptionistForm((prev) => ({ ...prev, dob: event.target.value }))}
              />
            </label>
            <label>
              Phone
              <input
                placeholder="Optional"
                value={receptionistForm.phone}
                onChange={(event) => setReceptionistForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </label>
            <div className="form-actions">
              <button className="primary-btn" type="submit" disabled={receptionistMutation.isPending}>
                {receptionistMutation.isPending ? 'Creating...' : 'Create receptionist'}
              </button>
            </div>
          </form>
          {receptionistError ? <div className="feedback error">{receptionistError}</div> : null}
          {receptionistMessage ? <div className="feedback success">{receptionistMessage}</div> : null}
        </section>

        <section className="panel">
          <header className="form-panel-header">
            <div>
              <h2>Register Patient Record</h2>
              <p>Issue a medical record number and baseline demographics.</p>
            </div>
          </header>
          <form className="form-grid" onSubmit={handlePatientSubmit}>
            <label>
              First name
              <input
                required
                value={patientForm.first_name}
                onChange={(event) => setPatientForm((prev) => ({ ...prev, first_name: event.target.value }))}
              />
            </label>
            <label>
              Last name
              <input
                required
                value={patientForm.last_name}
                onChange={(event) => setPatientForm((prev) => ({ ...prev, last_name: event.target.value }))}
              />
            </label>
            <label>
              Date of birth
              <input
                required
                type="date"
                value={patientForm.dob}
                onChange={(event) => setPatientForm((prev) => ({ ...prev, dob: event.target.value }))}
              />
            </label>
            <label>
              Phone
              <input
                placeholder="Optional"
                value={patientForm.phone}
                onChange={(event) => setPatientForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </label>
            <div className="form-actions">
              <button className="primary-btn" type="submit" disabled={patientMutation.isPending}>
                {patientMutation.isPending ? 'Creating...' : 'Create patient'}
              </button>
            </div>
          </form>
          {patientError ? <div className="feedback error">{patientError}</div> : null}
          {patientMessage ? <div className="feedback success">{patientMessage}</div> : null}
        </section>
      </div>
    </div>
  );
};
