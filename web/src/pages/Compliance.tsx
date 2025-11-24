const controls = [
  { name: 'Audit Log Rotation', status: 'Tracked', owner: 'Infra Ops' },
  { name: 'PHI Access Reviews', status: 'Due in 3 days', owner: 'Security' },
  { name: 'Backup Integrity', status: 'Green', owner: 'SRE' }
];

export const CompliancePage = () => (
  <div>
    <div className="page-heading">
      <h1>Compliance</h1>
      <span>Operational guardrails & attestations</span>
    </div>
    <section className="grid-panel">
      {controls.map((control) => (
        <article className="panel" key={control.name}>
          <h3 style={{ marginTop: 0 }}>{control.name}</h3>
          <p style={{ color: 'var(--text-muted)' }}>Owner: {control.owner}</p>
          <span className="status-pill">{control.status}</span>
        </article>
      ))}
    </section>
  </div>
);
