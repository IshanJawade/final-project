const metricCards = [
  { title: 'Active Cases', value: '128', trend: '+12% vs last week' },
  { title: 'Appointments Today', value: '42', trend: '+5 urgent' },
  { title: 'Avg. Wait Time', value: '08m', trend: '-2m optimization' },
  { title: 'Compliance Score', value: '99.2%', trend: 'Audit ready' }
];

const timeline = [
  { time: '08:30', title: 'Cardiology board huddle', detail: 'Dr. House + Ops' },
  { time: '10:00', title: 'MRI follow-up', detail: 'Patient MRN-1001' },
  { time: '13:15', title: 'Intake review', detail: '12 new patients' }
];

const quickActions = ['New Intake', 'Assign Case', 'Create Visit', 'Add File'];

export const Dashboard = () => {
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
            {timeline.map((item) => (
              <div className="timeline-item" key={item.title}>
                <div className="timeline-marker" />
                <div>
                  <strong>{item.time}</strong>
                  <div>{item.title}</div>
                  <small style={{ color: 'var(--text-muted)' }}>{item.detail}</small>
                </div>
              </div>
            ))}
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
