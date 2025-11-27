import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { CaseSummary, DoctorSummary, PatientSummary, SpecializationSummary } from '../types';

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
  const queryClient = useQueryClient();
  const isReceptionist = user.role === 'RECEPTIONIST';
  const canCreate = user.role === 'ADMIN' || user.role === 'RECEPTIONIST';
  const [patientId, setPatientId] = useState('');
  const [submittedPatientId, setSubmittedPatientId] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [patientLookupQuery, setPatientLookupQuery] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [specializationFilter, setSpecializationFilter] = useState('');
  const [summary, setSummary] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

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

  const patientSearchResults = useQuery({
    queryKey: ['patient-search', patientLookupQuery],
    queryFn: () => authedRequest<{ data: PatientSummary[] }>(`/patients?limit=10&query=${encodeURIComponent(patientLookupQuery)}`),
    enabled: canCreate && patientLookupQuery.trim().length >= 2
  });

  const specializationQuery = useQuery({
    queryKey: ['specializations'],
    queryFn: () => authedRequest<{ data: SpecializationSummary[] }>('/specializations'),
    enabled: canCreate
  });

  const doctorQuery = useQuery({
    queryKey: ['doctor-directory', specializationFilter],
    queryFn: () =>
      authedRequest<{ data: DoctorSummary[] }>(
        `/doctors?limit=50${specializationFilter ? `&specialization=${encodeURIComponent(specializationFilter)}` : ''}`
      ),
    enabled: canCreate
  });

  const doctorOptions = doctorQuery.data?.data ?? [];

  useEffect(() => {
    if (!selectedDoctorId && doctorOptions.length > 0) {
      setSelectedDoctorId(doctorOptions[0].id);
    } else if (selectedDoctorId && doctorOptions.every((doctor) => doctor.id !== selectedDoctorId)) {
      setSelectedDoctorId(doctorOptions[0]?.id ?? '');
    }
  }, [doctorOptions, selectedDoctorId]);

  const createCaseMutation = useMutation<{ case: CaseSummary }, unknown, { patientId: string; doctorId: string; summary: string; symptoms: string }>({
    mutationFn: (payload) =>
      authedRequest<{ case: CaseSummary }>('/cases', {
        method: 'POST',
        body: {
          patient_id: payload.patientId,
          assigned_doctor_id: payload.doctorId,
          summary: payload.summary.trim() ? payload.summary.trim() : undefined,
          symptoms_text: payload.symptoms.trim() ? payload.symptoms.trim() : undefined
        }
      }),
    onSuccess: (response) => {
      setCreateError(null);
      setCreateMessage(`Case ${response.case.id} opened for patient ${response.case.patient?.first_name ?? ''}.`);
      setSummary('');
      setSymptoms('');
      queryClient.invalidateQueries({ predicate: (queryItem) => Array.isArray(queryItem.queryKey) && queryItem.queryKey[0] === 'cases' });
    },
    onError: (err) => {
      setCreateMessage(null);
      setCreateError(describeError(err));
    }
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmittedPatientId(patientId);
  };

  const handlePatientSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPatientLookupQuery(patientSearch);
  };

  const handlePatientSelect = (id: string) => {
    setSelectedPatientId(id);
    setPatientId(id);
    setSubmittedPatientId(id);
  };

  const handleCaseCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateMessage(null);
    if (!selectedPatientId) {
      setCreateError('Select a patient before creating a case.');
      return;
    }
    if (!selectedDoctorId) {
      setCreateError('Select a doctor before creating a case.');
      return;
    }
    createCaseMutation.mutate({
      patientId: selectedPatientId,
      doctorId: selectedDoctorId,
      summary,
      symptoms
    });
  };

  return (
    <div>
      <div className="page-heading">
        <h1>Cases</h1>
        <span>Ownership map &amp; clinical priority</span>
      </div>

      {canCreate ? (
        <section className="panel" style={{ marginBottom: '1.5rem' }}>
          <header className="form-panel-header">
            <div>
              <h2>Intake: Create Case</h2>
              <p>Find patient, pick a clinician, and capture intake notes.</p>
            </div>
          </header>
          <div className="form-grid">
            <form onSubmit={handlePatientSearch} style={{ display: 'contents' }}>
              <label style={{ gridColumn: 'span 2' }}>
                Patient lookup
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    required
                    minLength={2}
                    value={patientSearch}
                    onChange={(event) => setPatientSearch(event.target.value)}
                    placeholder="MRN or name"
                    style={{ flex: '1 1 220px' }}
                  />
                  <button className="primary-btn" type="submit" disabled={patientSearch.trim().length < 2}>
                    Search
                  </button>
                </div>
              </label>
            </form>

            <label style={{ gridColumn: 'span 2' }}>
              Search results
              <select
                value={selectedPatientId}
                onChange={(event) => handlePatientSelect(event.target.value)}
              >
                <option value="">{patientSearchResults.isFetching ? 'Searching...' : 'Select patient'}</option>
                {(patientSearchResults.data?.data ?? []).map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.mrn} · {patient.first_name} {patient.last_name} · {patient.dob}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Specialization filter
              <select value={specializationFilter} onChange={(event) => setSpecializationFilter(event.target.value)}>
                <option value="">All specializations</option>
                {(specializationQuery.data?.data ?? []).map((spec) => (
                  <option key={spec.id} value={spec.name}>
                    {spec.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Assign doctor
              <select value={selectedDoctorId} onChange={(event) => setSelectedDoctorId(event.target.value)}>
                {doctorOptions.length === 0 ? <option value="">No active doctors found</option> : null}
                {doctorOptions.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.first_name} {doctor.last_name}
                    {doctor.specialization ? ` · ${doctor.specialization}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <form onSubmit={handleCaseCreate} style={{ display: 'contents' }}>
              <label style={{ gridColumn: 'span 2' }}>
                Intake summary (optional)
                <input
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  placeholder="Short summary for the attending doctor"
                />
              </label>
              <label style={{ gridColumn: 'span 2' }}>
                Symptoms &amp; notes
                <textarea
                  value={symptoms}
                  onChange={(event) => setSymptoms(event.target.value)}
                  rows={4}
                  style={{ border: '1px solid var(--border-soft)', borderRadius: '0.85rem', padding: '0.75rem', resize: 'vertical' }}
                  placeholder="Document chief complaint and triage observations"
                />
              </label>
              <div className="form-actions" style={{ gridColumn: 'span 2' }}>
                <button className="primary-btn" type="submit" disabled={createCaseMutation.isPending}>
                  {createCaseMutation.isPending ? 'Opening case...' : 'Open case'}
                </button>
              </div>
            </form>
          </div>
          {patientSearchResults.isError ? <div className="feedback error">{describeError(patientSearchResults.error)}</div> : null}
          {doctorQuery.isError ? <div className="feedback error">{describeError(doctorQuery.error)}</div> : null}
          {createError ? <div className="feedback error">{createError}</div> : null}
          {createMessage ? <div className="feedback success">{createMessage}</div> : null}
        </section>
      ) : null}

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
