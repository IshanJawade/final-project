import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { PatientSummary } from '../types';

type PatientFormState = {
  first_name: string;
  last_name: string;
  dob: string;
  phone: string;
};

const emptyPatientForm: PatientFormState = {
  first_name: '',
  last_name: '',
  dob: '',
  phone: ''
};

const describeError = (error: unknown) => {
  if (error instanceof ApiError) {
    return error.detail || `Request failed (${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unexpected error occurred.';
};

const formatName = (patient: PatientSummary) => `${patient.first_name} ${patient.last_name}`.trim();

export const PatientsPage = () => {
  const { authedRequest, user } = useAuth();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [patientForm, setPatientForm] = useState<PatientFormState>(emptyPatientForm);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const isPatient = user.role === 'PATIENT';
  const canCreate = user.role === 'ADMIN' || user.role === 'RECEPTIONIST';

  const searchParams = useMemo(() => {
    const params = new URLSearchParams({ limit: '50' });
    if (submittedQuery.trim()) {
      params.set('query', submittedQuery.trim());
    }
    return params.toString();
  }, [submittedQuery]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['patients', searchParams],
    queryFn: () => authedRequest<{ data: PatientSummary[] }>(`/patients?${searchParams}`),
    enabled: !isPatient
  });

  const patients = data?.data ?? [];
  const errorMessage = error instanceof Error ? error.message : 'Failed to load patients.';

  const createMutation = useMutation<{ patient: PatientSummary }, unknown, PatientFormState>({
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
      setCreateError(null);
      setCreateMessage(`Created MRN ${response.patient.mrn} for ${response.patient.first_name} ${response.patient.last_name}.`);
      setPatientForm(emptyPatientForm);
      queryClient.invalidateQueries({ predicate: (queryItem) => Array.isArray(queryItem.queryKey) && queryItem.queryKey[0] === 'patients' });
    },
    onError: (err) => {
      setCreateMessage(null);
      setCreateError(describeError(err));
    }
  });

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    setSubmittedQuery(query);
  };

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateMessage(null);
    createMutation.mutate(patientForm);
  };

  if (isPatient) {
    return (
      <div>
        <div className="page-heading">
          <h1>Patients</h1>
          <span>Roster access is limited to administrative staff.</span>
        </div>
        <article className="panel">
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            Your personal records are available via the Cases and Appointments tabs.
          </p>
        </article>
      </div>
    );
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Patients</h1>
        <span>Roster snapshot synced with core API</span>
      </div>

      <article className="panel" style={{ marginBottom: '1.25rem' }}>
        {canCreate ? (
          <section style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Register New Patient</h2>
            <form className="form-grid" onSubmit={handleCreate}>
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
                Phone number
                <input
                  placeholder="Optional"
                  value={patientForm.phone}
                  onChange={(event) => setPatientForm((prev) => ({ ...prev, phone: event.target.value }))}
                />
              </label>
              <div className="form-actions">
                <button className="primary-btn" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create patient'}
                </button>
              </div>
            </form>
            {createError ? <div className="feedback error">{createError}</div> : null}
            {createMessage ? <div className="feedback success">{createMessage}</div> : null}
            <hr style={{ margin: '1.5rem 0', border: 'none', borderTop: '1px solid var(--border-soft)' }} />
          </section>
        ) : null}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label htmlFor="patient-search" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              Search by MRN or name
            </label>
            <input
              id="patient-search"
              type="text"
              placeholder="MRN-001 or Jane"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              style={{ borderRadius: '0.9rem', border: '1px solid var(--border-soft)', padding: '0.7rem 1rem' }}
            />
          </div>
          <button type="submit" className="auth-submit" style={{ alignSelf: 'flex-end', padding: '0.7rem 1.4rem' }}>
            Apply
          </button>
        </form>
      </article>

      <article className="panel table-card">
        <table>
          <thead>
            <tr>
              <th>MRN</th>
              <th>Name</th>
              <th>Date of Birth</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem' }}>
                  Loading patient roster...
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem', color: '#dc2626' }}>
                  {errorMessage}
                </td>
              </tr>
            ) : patients.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem' }}>
                  No patient records matched the current filters.
                </td>
              </tr>
            ) : (
              patients.map((patient) => (
                <tr key={patient.id}>
                  <td>{patient.mrn}</td>
                  <td>{formatName(patient)}</td>
                  <td>{patient.dob}</td>
                  <td>{new Date(patient.updated_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>
    </div>
  );
};
