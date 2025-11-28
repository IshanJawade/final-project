import { FormEvent, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { CaseSummary } from '../types';

const describeError = (error: unknown) => {
  if (error instanceof ApiError) {
    return error.detail || `Request failed (${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unexpected error occurred.';
};

const formatDoctor = (caseRecord: CaseSummary) => {
  if (!caseRecord.assigned_doctor) {
    return 'Unassigned';
  }
  const { first_name, last_name, specialization } = caseRecord.assigned_doctor;
  const name = `${first_name} ${last_name}`.trim();
  return specialization ? `${name} (${specialization})` : name;
};

const formatPatient = (caseRecord: CaseSummary) => {
  if (!caseRecord.patient) {
    return 'No patient linked';
  }
  const { patient_code, first_name, last_name } = caseRecord.patient;
  return `${patient_code} · ${first_name} ${last_name}`.trim();
};

const relativeTime = (iso: string) => {
  const updated = new Date(iso);
  const diff = Date.now() - updated.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const normalizeCode = (value: string) => value.trim().toUpperCase();

export const CasesPage = () => {
  const { authedRequest, user } = useAuth();
  const navigate = useNavigate();
  const [caseCodeInput, setCaseCodeInput] = useState('');
  const [patientCodeInput, setPatientCodeInput] = useState('');
  const [appliedCaseCode, setAppliedCaseCode] = useState('');
  const [appliedPatientCode, setAppliedPatientCode] = useState('');
  const [statusFilter, setStatusFilter] = useState<'CLOSED' | 'OPEN' | 'ALL'>('CLOSED');

  const params = useMemo(() => {
    const query = new URLSearchParams({ limit: '50' });
    if (statusFilter !== 'ALL') {
      query.set('status', statusFilter);
    }
    if (appliedCaseCode) {
      query.set('case_code', appliedCaseCode);
    }
    if (appliedPatientCode) {
      query.set('patient_code', appliedPatientCode);
    }
    return query.toString();
  }, [statusFilter, appliedCaseCode, appliedPatientCode]);

  const canFetch = user.role !== 'RECEPTIONIST' || Boolean(appliedCaseCode || appliedPatientCode);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['cases', user.role, params],
    queryFn: () => authedRequest<{ data: CaseSummary[] }>(`/cases?${params}`),
    enabled: canFetch
  });

  const cases = data?.data ?? [];
  const errorMessage = describeError(error);

  const handleFilterSubmit = (event: FormEvent) => {
    event.preventDefault();
    setAppliedCaseCode(normalizeCode(caseCodeInput));
    setAppliedPatientCode(normalizeCode(patientCodeInput));
  };

  const handleReset = () => {
    setCaseCodeInput('');
    setPatientCodeInput('');
    setAppliedCaseCode('');
    setAppliedPatientCode('');
  };

  return (
    <div>
      <div className="page-heading">
        <h1>Case Archive</h1>
        <span>Review historical cases and legacy records</span>
      </div>

      <section className="panel" style={{ marginBottom: '1.25rem' }}>
        <form
          onSubmit={handleFilterSubmit}
          style={{ display: 'grid', gap: '0.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', alignItems: 'end' }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            Case code
            <input
              value={caseCodeInput}
              onChange={(event) => setCaseCodeInput(event.target.value)}
              placeholder="C00001"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            Patient code
            <input
              value={patientCodeInput}
              onChange={(event) => setPatientCodeInput(event.target.value)}
              placeholder="P00001"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="CLOSED">Closed cases</option>
              <option value="OPEN">Open cases</option>
              <option value="ALL">All statuses</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="primary-btn" type="submit">Apply</button>
            <button type="button" className="ghost-btn" onClick={handleReset}>
              Reset
            </button>
          </div>
        </form>
        <p style={{ marginTop: '0.75rem', color: 'var(--text-muted)' }}>
          Tip: New friendly identifiers work anywhere a case or patient UUID was previously required.
        </p>
        {user.role === 'RECEPTIONIST' && !canFetch ? (
          <p style={{ marginTop: '0.75rem', color: 'var(--status-warning)' }}>
            Provide a case or patient code to review archived files.
          </p>
        ) : null}
      </section>

      <section className="grid-panel">
        {!canFetch ? (
          <article className="panel" style={{ gridColumn: '1 / -1', color: 'var(--text-muted)' }}>
            Waiting for a case or patient code…
          </article>
        ) : isLoading ? (
          <article className="panel" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>
            Loading case archive…
          </article>
        ) : isError ? (
          <article className="panel" style={{ gridColumn: '1 / -1', color: '#dc2626' }}>
            {errorMessage}
          </article>
        ) : cases.length === 0 ? (
          <article className="panel" style={{ gridColumn: '1 / -1', color: 'var(--text-muted)' }}>
            No cases matched the current filters.
          </article>
        ) : (
          cases.map((caseRecord) => (
            <article className="panel" key={caseRecord.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/cases/${caseRecord.id}`)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{caseRecord.case_code}</h3>
                  <p style={{ margin: 0, color: 'var(--text-muted)' }}>{formatPatient(caseRecord)}</p>
                </div>
                <span className="status-pill">{caseRecord.status}</span>
              </div>
              <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Lead: {formatDoctor(caseRecord)}</p>
              {caseRecord.symptoms_text ? <p style={{ color: 'var(--text-muted)' }}>{caseRecord.symptoms_text}</p> : null}
              <small style={{ color: 'var(--text-muted)' }}>Updated {relativeTime(caseRecord.updated_at)}</small>
            </article>
          ))
        )}
      </section>
    </div>
  );
};
