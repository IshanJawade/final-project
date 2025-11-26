import { FormEvent, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { CaseSummary } from '../types';

const formatDoctor = (caseRecord: CaseSummary) => {
  if (!caseRecord.assigned_doctor) {
    return 'Unassigned';
  }
  const { first_name, last_name, specialization } = caseRecord.assigned_doctor;
  const name = `${first_name} ${last_name}`.trim();
  return specialization ? `${name} (${specialization})` : name;
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

export const CasesPage = () => {
  const { authedRequest, user } = useAuth();
  const isReceptionist = user.role === 'RECEPTIONIST';
  const [patientId, setPatientId] = useState('');
  const [submittedPatientId, setSubmittedPatientId] = useState('');

  const params = useMemo(() => {
    const base = new URLSearchParams({ limit: '50' });
    if (isReceptionist) {
      if (submittedPatientId.trim()) {
        base.set('patient_id', submittedPatientId.trim());
      }
    }
    return base.toString();
  }, [isReceptionist, submittedPatientId]);

  const canFetch = !isReceptionist || submittedPatientId.trim().length > 0;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['cases', user.role, params],
    queryFn: () => authedRequest<{ data: CaseSummary[] }>(`/cases?${params}`),
    enabled: canFetch
  });

  const cases = data?.data ?? [];
  const errorMessage = error instanceof Error ? error.message : 'Failed to load cases.';

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmittedPatientId(patientId);
  };

  return (
    <div>
      <div className="page-heading">
        <h1>Cases</h1>
        <span>Ownership map &amp; clinical priority</span>
      </div>

      {isReceptionist ? (
        <article className="panel" style={{ marginBottom: '1.25rem' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label htmlFor="case-patient" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                Enter patient ID to retrieve cases
              </label>
              <input
                id="case-patient"
                type="text"
                placeholder="Patient UUID"
                value={patientId}
                onChange={(event) => setPatientId(event.target.value)}
                style={{ borderRadius: '0.9rem', border: '1px solid var(--border-soft)', padding: '0.7rem 1rem' }}
              />
            </div>
            <button type="submit" className="auth-submit" style={{ alignSelf: 'flex-end', padding: '0.7rem 1.4rem' }}>
              Load Cases
            </button>
          </form>
          <p style={{ marginTop: '0.75rem', color: 'var(--text-muted)' }}>
            Reception roles require an explicit patient context to view case files.
          </p>
        </article>
      ) : null}

      <section className="grid-panel">
        {!canFetch ? (
          <article className="panel" style={{ gridColumn: '1 / -1' }}>
            Provide a patient identifier to load intake cases.
          </article>
        ) : isLoading ? (
          <article className="panel" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>
            Loading case directory...
          </article>
        ) : isError ? (
          <article className="panel" style={{ gridColumn: '1 / -1', color: '#dc2626' }}>
            {errorMessage}
          </article>
        ) : cases.length === 0 ? (
          <article className="panel" style={{ gridColumn: '1 / -1' }}>
            No cases matched the current filters.
          </article>
        ) : (
          cases.map((caseRecord) => (
            <article className="panel" key={caseRecord.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{caseRecord.id}</h3>
                  <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                    {caseRecord.patient ? `${caseRecord.patient.first_name} ${caseRecord.patient.last_name}` : 'No patient linked'}
                  </p>
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
