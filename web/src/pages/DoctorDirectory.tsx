import { ChangeEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { DoctorSummary, SpecializationSummary } from '../types';

const describeError = (error: unknown) => {
  if (error instanceof ApiError) {
    return error.detail || `Request failed (${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unexpected error occurred.';
};

export const DoctorDirectoryPage = () => {
  const { authedRequest, user } = useAuth();
  const [specializationFilter, setSpecializationFilter] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const specializationQuery = useQuery({
    queryKey: ['specializations'],
    queryFn: () => authedRequest<{ data: SpecializationSummary[] }>('/specializations'),
    enabled: user.role !== 'PATIENT'
  });

  const doctorQuery = useQuery({
    queryKey: ['doctor-directory', specializationFilter, includeInactive],
    queryFn: () =>
      authedRequest<{ data: DoctorSummary[] }>(
        `/doctors?limit=100${specializationFilter ? `&specialization=${encodeURIComponent(specializationFilter)}` : ''}${includeInactive ? '&include_inactive=true' : ''}`
      ),
    enabled: user.role !== 'PATIENT'
  });

  if (user.role === 'PATIENT') {
    return (
      <div>
        <div className="page-heading">
          <h1>Doctor Directory</h1>
          <span>Directory access is limited to staff roles.</span>
        </div>
        <article className="panel">
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Please contact your care team for provider information.</p>
        </article>
      </div>
    );
  }

  const doctors = doctorQuery.data?.data ?? [];

  const handleSpecializationChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSpecializationFilter(event.target.value);
  };

  const handleIncludeInactiveChange = (event: ChangeEvent<HTMLInputElement>) => {
    setIncludeInactive(event.target.checked);
  };

  return (
    <div>
      <div className="page-heading">
        <h1>Doctor Directory</h1>
        <span>Filter clinicians by specialty and roster status</span>
      </div>

      <article className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem' }}>
          Specialization
          <select value={specializationFilter} onChange={handleSpecializationChange} style={{ borderRadius: '0.9rem', border: '1px solid var(--border-soft)', padding: '0.6rem 0.9rem' }}>
            <option value="">All specialties</option>
            {(specializationQuery.data?.data ?? []).map((spec) => (
              <option key={spec.id} value={spec.name}>
                {spec.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={includeInactive} onChange={handleIncludeInactiveChange} /> Include inactive doctors
        </label>
      </article>

      {specializationQuery.isError ? <div className="feedback error">{describeError(specializationQuery.error)}</div> : null}

      <article className="panel table-card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Specialization</th>
              <th>License</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {doctorQuery.isLoading ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem' }}>
                  Loading directory…
                </td>
              </tr>
            ) : doctorQuery.isError ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem', color: '#dc2626' }}>
                  {describeError(doctorQuery.error)}
                </td>
              </tr>
            ) : doctors.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem' }}>
                  No doctors matched the current filters.
                </td>
              </tr>
            ) : (
              doctors.map((doctor) => (
                <tr key={doctor.id}>
                  <td>
                    {doctor.first_name} {doctor.last_name}
                  </td>
                  <td>{doctor.specialization ?? '—'}</td>
                  <td>{doctor.license_number ?? '—'}</td>
                  <td>
                    <span className="status-pill" style={{ background: doctor.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(148,163,184,0.15)', border: 'none' }}>
                      {doctor.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>
    </div>
  );
};
