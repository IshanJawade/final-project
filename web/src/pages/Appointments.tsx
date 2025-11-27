import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { AppointmentSummary, AvailabilitySlot, CaseSummary } from '../types';

const describeError = (error: unknown) => {
  if (error instanceof ApiError) {
    return error.detail || `Request failed (${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unexpected error occurred.';
};

const formatDateTime = (iso: string) => {
  const dt = new Date(iso);
  return dt.toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
};

const patientLabel = (appointment: AppointmentSummary) => {
  if (appointment.patient) {
    return `${appointment.patient.first_name} ${appointment.patient.last_name}`.trim();
  }
  return 'Restricted';
};

export const AppointmentsPage = () => {
  const { authedRequest, user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'ALL' | AppointmentSummary['status']>('ALL');
  const [upcomingOnly, setUpcomingOnly] = useState(true);
  const [caseInput, setCaseInput] = useState('');
  const [caseLookup, setCaseLookup] = useState('');
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const params = useMemo(() => {
    const query = new URLSearchParams({ limit: '50' });
    if (statusFilter !== 'ALL') {
      query.set('status', statusFilter);
    }
    if (upcomingOnly) {
      query.set('from', new Date().toISOString());
    }
    return query.toString();
  }, [statusFilter, upcomingOnly]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['appointments', params],
    queryFn: () => authedRequest<{ data: AppointmentSummary[] }>(`/appointments?${params}`)
  });

  const appointments = data?.data ?? [];
  const errorMessage = error instanceof Error ? error.message : 'Failed to load appointments.';

  const canSchedule = user.role === 'ADMIN' || user.role === 'RECEPTIONIST';

  const availabilityRange = useMemo(() => {
    const from = new Date();
    const to = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  const caseDetailsQuery = useQuery({
    queryKey: ['case-detail', caseLookup],
    queryFn: () => authedRequest<{ case: CaseSummary }>(`/cases/${caseLookup}`),
    enabled: canSchedule && Boolean(caseLookup)
  });

  const caseRecord = caseDetailsQuery.data?.case;
  const assignedDoctorId = caseRecord?.assigned_doctor?.id ?? '';

  const availabilityQuery = useQuery({
    queryKey: ['availability', assignedDoctorId],
    queryFn: () =>
      authedRequest<{ data: AvailabilitySlot[] }>(
        `/doctors/${assignedDoctorId}/availability?from=${encodeURIComponent(availabilityRange.from)}&to=${encodeURIComponent(availabilityRange.to)}`
      ),
    enabled: canSchedule && Boolean(assignedDoctorId)
  });

  const availability = availabilityQuery.data?.data ?? [];

  const toLocalInputValue = (iso: string) => {
    const dt = new Date(iso);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };

  const handleSlotPick = (slot: AvailabilitySlot) => {
    setStartInput(toLocalInputValue(slot.start_time));
    setEndInput(toLocalInputValue(slot.end_time));
  };

  const scheduleMutation = useMutation<{ appointment: AppointmentSummary }, unknown, { caseId: string; startIso: string; endIso: string }>({
    mutationFn: (payload) => {
      return authedRequest<{ appointment: AppointmentSummary }>('/appointments', {
        method: 'POST',
        body: {
          case_id: payload.caseId,
          start_time: payload.startIso,
          end_time: payload.endIso
        }
      });
    },
    onSuccess: (response) => {
      setScheduleError(null);
      setScheduleMessage(`Scheduled visit on ${new Date(response.appointment.start_time).toLocaleString()}.`);
      setStartInput('');
      setEndInput('');
      queryClient.invalidateQueries({ predicate: (queryItem) => Array.isArray(queryItem.queryKey) && queryItem.queryKey[0] === 'appointments' });
      queryClient.invalidateQueries({ predicate: (queryItem) => Array.isArray(queryItem.queryKey) && queryItem.queryKey[0] === 'availability' });
    },
    onError: (err) => {
      setScheduleMessage(null);
      setScheduleError(describeError(err));
    }
  });

  const handleCaseLookup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setScheduleMessage(null);
    setScheduleError(null);
    setStartInput('');
    setEndInput('');
    setCaseLookup(caseInput.trim());
  };

  const handleSchedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setScheduleMessage(null);
    setScheduleError(null);
    if (!caseRecord) {
      setScheduleError('Load a case before scheduling.');
      return;
    }
    if (!startInput || !endInput) {
      setScheduleError('Provide both start and end times.');
      return;
    }
    const startIso = new Date(startInput).toISOString();
    const endIso = new Date(endInput).toISOString();
    scheduleMutation.mutate({ caseId: caseRecord.id, startIso, endIso });
  };

  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(event.target.value as typeof statusFilter);
  };

  const handleUpcomingToggle = (event: ChangeEvent<HTMLInputElement>) => {
    setUpcomingOnly(event.target.checked);
  };

  return (
    <div>
      <div className="page-heading">
        <h1>Appointments</h1>
        <span>Doctor capacity and live queue health</span>
      </div>

      {canSchedule ? (
        <section className="panel" style={{ marginBottom: '1.25rem' }}>
          <header className="form-panel-header">
            <div>
              <h2>Schedule Appointment</h2>
              <p>Lookup a case, review availability, and confirm a time slot.</p>
            </div>
          </header>
          <div className="form-grid">
            <form onSubmit={handleCaseLookup} style={{ display: 'contents' }}>
              <label>
                Case identifier
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    required
                    value={caseInput}
                    onChange={(event) => setCaseInput(event.target.value)}
                    placeholder="Case UUID"
                    style={{ flex: '1 1 auto' }}
                  />
                  <button className="primary-btn" type="submit" disabled={!caseInput.trim()}>
                    Load context
                  </button>
                </div>
              </label>
            </form>

            {caseDetailsQuery.isFetching ? (
              <div style={{ gridColumn: 'span 2', color: 'var(--text-muted)' }}>Fetching case context…</div>
            ) : caseRecord ? (
              <div className="panel" style={{ gridColumn: 'span 2', borderStyle: 'dashed', margin: 0 }}>
                <strong>Patient</strong>: {caseRecord.patient?.first_name} {caseRecord.patient?.last_name} ({caseRecord.patient?.mrn})<br />
                <strong>Doctor</strong>: {caseRecord.assigned_doctor?.first_name} {caseRecord.assigned_doctor?.last_name}
                {caseRecord.assigned_doctor?.specialization ? ` · ${caseRecord.assigned_doctor.specialization}` : ''}
                <br />
                <strong>Status</strong>: {caseRecord.status}
              </div>
            ) : (
              <div style={{ gridColumn: 'span 2', color: 'var(--text-muted)' }}>Load a case to view details.</div>
            )}

            <form onSubmit={handleSchedule} style={{ display: 'contents' }}>
              <label>
                Start time
                <input
                  type="datetime-local"
                  value={startInput}
                  onChange={(event) => setStartInput(event.target.value)}
                  required
                />
              </label>
              <label>
                End time
                <input
                  type="datetime-local"
                  value={endInput}
                  onChange={(event) => setEndInput(event.target.value)}
                  required
                />
              </label>
              <div className="form-actions" style={{ gridColumn: 'span 2' }}>
                <button className="primary-btn" type="submit" disabled={scheduleMutation.isPending || !caseRecord}>
                  {scheduleMutation.isPending ? 'Scheduling...' : 'Schedule appointment'}
                </button>
              </div>
            </form>
          </div>

          {assignedDoctorId ? (
            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={{ marginTop: 0 }}>Available slots</h3>
              {availabilityQuery.isLoading ? (
                <p style={{ color: 'var(--text-muted)' }}>Loading availability…</p>
              ) : availability.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No open slots for the next interval.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {availability.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      className="primary-btn"
                      style={{ alignSelf: 'flex-start', background: 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(34,211,238,0.15))', color: 'var(--text-primary)' }}
                      onClick={() => handleSlotPick(slot)}
                    >
                      {new Date(slot.start_time).toLocaleString()} → {new Date(slot.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {caseDetailsQuery.isError ? <div className="feedback error">{describeError(caseDetailsQuery.error)}</div> : null}
          {availabilityQuery.isError ? <div className="feedback error">{describeError(availabilityQuery.error)}</div> : null}
          {scheduleError ? <div className="feedback error">{scheduleError}</div> : null}
          {scheduleMessage ? <div className="feedback success">{scheduleMessage}</div> : null}
        </section>
      ) : null}

      <article className="panel" style={{ marginBottom: '1.25rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem' }}>
          Status filter
          <select value={statusFilter} onChange={handleStatusChange} style={{ borderRadius: '0.9rem', border: '1px solid var(--border-soft)', padding: '0.6rem 0.9rem' }}>
            <option value="ALL">All statuses</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="NO_SHOW">No-show</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={upcomingOnly} onChange={handleUpcomingToggle} /> Upcoming only
        </label>
      </article>

      <article className="panel table-card">
        <table>
          <thead>
            <tr>
              <th>Start</th>
              <th>End</th>
              <th>Doctor</th>
              <th>Patient</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem' }}>
                  Loading appointment board...
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem', color: '#dc2626' }}>
                  {errorMessage}
                </td>
              </tr>
            ) : appointments.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem' }}>
                  No appointments match the current filters.
                </td>
              </tr>
            ) : (
              appointments.map((appointment) => (
                <tr key={appointment.id}>
                  <td>{formatDateTime(appointment.start_time)}</td>
                  <td>{formatDateTime(appointment.end_time)}</td>
                  <td>{`${appointment.doctor.first_name} ${appointment.doctor.last_name}`}</td>
                  <td>{patientLabel(appointment)}</td>
                  <td>
                    <span className="status-pill" style={{ fontSize: '0.7rem' }}>
                      {appointment.status}
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
