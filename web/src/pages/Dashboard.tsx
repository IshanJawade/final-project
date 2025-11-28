import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { AppointmentSummary, CaseSummary, DashboardMetrics } from '../types';

type TimelineItem = {
  id: string;
  time: string;
  title: string;
  detail: string;
};

const formatTime = (iso: string) => {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatPerson = (first?: string, last?: string) => {
  if (!first && !last) {
    return 'Unknown';
  }
  return `${first ?? ''} ${last ?? ''}`.trim();
};

const startAndEndOfToday = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

export const Dashboard = () => {
  const { authedRequest, user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const canLoadCases = user.role !== 'RECEPTIONIST';

  const metricsQuery = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: () => authedRequest<DashboardMetrics>('/admin/dashboard-metrics'),
    enabled: isAdmin
  });

  const casesQuery = useQuery({
    queryKey: ['dashboard-cases', user.role],
    queryFn: () => authedRequest<{ data: CaseSummary[] }>('/cases?limit=25'),
    enabled: canLoadCases
  });

  const { start, end } = useMemo(() => startAndEndOfToday(), []);
  const appointmentParams = useMemo(() => {
    const params = new URLSearchParams({
      limit: '50',
      from: start.toISOString(),
      to: end.toISOString()
    });
    return params.toString();
  }, [start, end]);

  const appointmentsQuery = useQuery({
    queryKey: ['dashboard-appointments', user.role, appointmentParams],
    queryFn: () => authedRequest<{ data: AppointmentSummary[] }>(`/appointments?${appointmentParams}`)
  });

  const metrics = metricsQuery.data;
  const cases = casesQuery.data?.data ?? [];
  const appointments = appointmentsQuery.data?.data ?? [];

  const openCaseCount = isAdmin && metrics ? metrics.open_cases_total : cases.filter((item) => item.status === 'OPEN').length;
  const todaysCompleted = appointments.filter((appt) => appt.status === 'COMPLETED').length;

  const upcomingTimeline: TimelineItem[] = appointments
    .slice()
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(0, 6)
    .map((appt) => ({
      id: appt.id,
      time: formatTime(appt.start_time),
      title: appt.patient ? `Visit · ${formatPerson(appt.patient.first_name, appt.patient.last_name)}` : `Case ${appt.case_id}`,
      detail: `Dr. ${formatPerson(appt.doctor.first_name, appt.doctor.last_name)} · ${appt.status}`
    }));

  const quickActions = user.role === 'PATIENT' ? ['View Cases', 'Upcoming Visits'] : ['New Intake', 'Assign Case', 'Create Visit', 'Add File'];

  const metricCards = [
    {
      title: 'Open Cases',
      value: canLoadCases ? openCaseCount.toString() : '—',
      trend: canLoadCases ? (isAdmin && metrics ? `${metrics.open_cases_total} total` : `${cases.length} total tracked`) : 'Requires patient context'
    },
    {
      title: 'Appointments Today',
      value: (isAdmin && metrics ? metrics.appointments_today : appointments.length).toString(),
      trend: `${todaysCompleted} completed`
    },
    ...(isAdmin && metrics
      ? [
          {
            title: 'Patients',
            value: metrics.patients_total.toString(),
            trend: 'Total registered'
          },
          {
            title: 'Staff',
            value: (metrics.doctors_total + metrics.receptionists_total).toString(),
            trend: `${metrics.doctors_total} doctors, ${metrics.receptionists_total} receptionists`
          }
        ]
      : [
          {
            title: 'Upcoming Window',
            value: upcomingTimeline.length.toString(),
            trend: 'Next scheduled visits'
          },
          {
            title: 'Compliance Score',
            value: '99.2%',
            trend: 'Audit ready'
          }
        ])
  ];

  return (
    <div className="dashboard">
      <div className="page-heading">
        <h1>Operations Hub</h1>
        <span>HIPAA-observant control tower</span>
      </div>

      <section className="grid-panel">
        {metricCards.map((card) => (
          <article className="panel metric-card" key={card.title}>
            <h3>{card.title}</h3>
            <p className="metric-value">{card.value}</p>
            <p className="metric-trend">{card.trend}</p>
          </article>
        ))}
      </section>

      <section className="grid-panel" style={{ marginTop: '1.5rem' }}>
        <article className="panel" style={{ minHeight: 280 }}>
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0 }}>Operational Timeline</h3>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Critical checkpoints for the next shift</p>
            </div>
            <span className="badge">Live</span>
          </div>
          <div className="timeline" style={{ marginTop: '1.5rem' }}>
            {upcomingTimeline.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>No scheduled activity for the current window.</div>
            ) : (
              upcomingTimeline.map((item) => (
                <div className="timeline-item" key={item.id}>
                  <div className="timeline-marker" />
                  <div>
                    <strong>{item.time}</strong>
                    <div>{item.title}</div>
                    <small style={{ color: 'var(--text-muted)' }}>{item.detail}</small>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="panel">
          <h3 style={{ marginTop: 0 }}>Quick Actions</h3>
          <div className="quick-actions" style={{ marginTop: '1rem' }}>
            {quickActions.map((action) => (
              <button key={action}>{action}</button>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
};
