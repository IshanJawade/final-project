import { useAuth } from '../context/AuthContext';

const controls = [
  { name: 'Audit Log Rotation', status: 'Tracked', owner: 'Infra Ops' },
  { name: 'PHI Access Reviews', status: 'Due in 3 days', owner: 'Security' },
  { name: 'Backup Integrity', status: 'Green', owner: 'SRE' }
];

export const CompliancePage = () => {
  const { user } = useAuth();

  if (user.role !== 'ADMIN') {
    return (
      <div>
        <div className="page-heading">
          <h1>Compliance</h1>
          <span>Operational guardrails &amp; attestations</span>
        </div>
        <article className="panel">
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            Compliance dashboards are restricted to administrators. Contact the security team for reporting support.
          </p>
        </article>
      </div>
    );
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Compliance</h1>
        <span>Operational guardrails &amp; attestations</span>
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
};
