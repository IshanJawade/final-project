import React, { useMemo } from 'react';
import { useAdminDirectory } from '../utils/useAdminDirectory.js';
import { formatDateMMDDYYYY } from '../utils/date.js';

function StatCard({ title, value, subtext }) {
  return (
    <div className="stat-card">
      <span className="stat-card-title">{title}</span>
      <span className="stat-card-value">{value}</span>
      {subtext && <span className="stat-card-subtext">{subtext}</span>}
    </div>
  );
}

export default function AdminDashboard() {
  const {
    stats,
    users,
    professionals,
    loading,
    error,
    refresh,
  } = useAdminDirectory({ includeStats: true, includeLists: true });

  const formatter = useMemo(() => new Intl.NumberFormat(), []);

  const statCards = useMemo(() => {
    if (!stats) {
      return [];
    }
    return [
      {
        title: 'Total Users',
        value: formatter.format(stats.users.total || 0),
        subtext: `${formatter.format(stats.users.approved || 0)} approved | ${formatter.format(
          stats.users.pending || 0
        )} pending`,
      },
      {
        title: 'Online Users',
        value: formatter.format(stats.users.online || 0),
        subtext: 'Active in last 15 minutes',
      },
      {
        title: 'Medical Professionals',
        value: formatter.format(stats.professionals.total || 0),
        subtext: `${formatter.format(stats.professionals.approved || 0)} approved | ${formatter.format(
          stats.professionals.pending || 0
        )} pending`,
      },
      {
        title: 'Online Professionals',
        value: formatter.format(stats.professionals.online || 0),
        subtext: 'Active in last 15 minutes',
      },
      {
        title: 'Total Records',
        value: formatter.format(stats.records.total || 0),
        subtext: `${formatter.format(stats.records.last24h || 0)} added in last 24h`,
      },
      {
        title: 'Active Access Grants',
        value: formatter.format(stats.access.activeGrants || 0),
        subtext: `${formatter.format(stats.access.pendingRequests || 0)} pending requests`,
      },
    ];
  }, [formatter, stats]);

  return (
    <div className="panel-section">
      <div className="panel">
        <h2>Admin Control Center</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="inline-actions">
          <button type="button" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh Snapshot'}
          </button>
        </div>
        {loading && <p className="muted">Loading dashboard snapshot…</p>}
        {!loading && statCards.length === 0 && <p className="muted">No analytics available yet.</p>}
        {statCards.length > 0 && (
          <div className="stat-grid">
            {statCards.map((card) => (
              <StatCard
                key={card.title}
                title={card.title}
                value={card.value}
                subtext={card.subtext}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
