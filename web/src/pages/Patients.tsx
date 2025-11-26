import { FormEvent, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { PatientSummary } from '../types';

const formatName = (patient: PatientSummary) => `${patient.first_name} ${patient.last_name}`.trim();

export const PatientsPage = () => {
  const { authedRequest, user } = useAuth();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');

  const isPatient = user.role === 'PATIENT';

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

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    setSubmittedQuery(query);
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
