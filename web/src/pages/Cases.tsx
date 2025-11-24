const mockCases = [
  { id: 'CAS-9012', patient: 'Jane Doe', severity: 'High', doctor: 'Dr. House', updated: '2m ago' },
  { id: 'CAS-9013', patient: 'Carlos Vega', severity: 'Medium', doctor: 'Dr. Foreman', updated: '18m ago' },
  { id: 'CAS-9014', patient: 'Jo Park', severity: 'Low', doctor: 'Dr. Cameron', updated: '1h ago' }
];

export const CasesPage = () => (
  <div>
    <div className="page-heading">
      <h1>Cases</h1>
      <span>Ownership map & clinical priority</span>
    </div>
    <section className="grid-panel">
      {mockCases.map((c) => (
        <article className="panel" key={c.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0 }}>{c.id}</h3>
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>{c.patient}</p>
            </div>
            <span className="status-pill">{c.severity}</span>
          </div>
          <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Lead: {c.doctor}</p>
          <small style={{ color: 'var(--text-muted)' }}>Updated {c.updated}</small>
        </article>
      ))}
    </section>
  </div>
);
