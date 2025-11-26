import { ChangeEvent, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { AppointmentSummary } from '../types';

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
  const { authedRequest } = useAuth();
  const [statusFilter, setStatusFilter] = useState<'ALL' | AppointmentSummary['status']>('ALL');
  const [upcomingOnly, setUpcomingOnly] = useState(true);

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
