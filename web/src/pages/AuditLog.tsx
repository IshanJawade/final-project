import { FormEvent, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { AuditLogEntry } from '../types';

const describeError = (error: unknown) => {
  if (error instanceof ApiError) {
    return error.detail || `Request failed (${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unexpected error occurred.';
};

export const AuditLogPage = () => {
  const { authedRequest, user } = useAuth();
  const [actorFilter, setActorFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const params = useMemo(() => {
    const query = new URLSearchParams({ limit: '100' });
    if (actorFilter) {
      query.set('actor', actorFilter);
    }
    if (resourceTypeFilter) {
      query.set('resource_type', resourceTypeFilter);
    }
    if (fromDate) {
      query.set('from', new Date(fromDate).toISOString());
    }
    if (toDate) {
      const endOfDay = new Date(toDate);
      endOfDay.setHours(23, 59, 59, 999);
      query.set('to', endOfDay.toISOString());
    }
    return query.toString();
  }, [actorFilter, resourceTypeFilter, fromDate, toDate]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['audit-log', params],
    queryFn: () => authedRequest<{ data: AuditLogEntry[] }>(`/admin/audit?${params}`),
    enabled: user.role === 'ADMIN'
  });

  const logs = data?.data ?? [];

  const handleReset = (event: FormEvent) => {
    event.preventDefault();
    setActorFilter('');
    setResourceTypeFilter('');
    setFromDate('');
    setToDate('');
  };

  if (user.role !== 'ADMIN') {
    return (
      <div>
        <div className="page-heading">
          <h1>Audit Log</h1>
          <span>Access restricted to administrators</span>
        </div>
        <article className="panel">
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            Only administrators can view audit logs. Contact your system administrator if you need access.
          </p>
        </article>
      </div>
    );
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Audit Log</h1>
        <span>System activity and access records</span>
      </div>

      <article className="panel" style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ marginTop: 0 }}>Filters</h2>
        <form onSubmit={(e) => e.preventDefault()} className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <label>
            Actor User ID
            <input
              type="text"
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              placeholder="UUID"
            />
          </label>
          <label>
            Resource Type
            <input
              type="text"
              value={resourceTypeFilter}
              onChange={(e) => setResourceTypeFilter(e.target.value)}
              placeholder="Case, Visit, etc."
            />
          </label>
          <label>
            From Date
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label>
            To Date
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="ghost-btn" onClick={handleReset}>
              Reset Filters
            </button>
          </div>
        </form>
      </article>

      <article className="panel table-card">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Outcome</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem' }}>
                  Loading audit log...
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: '#dc2626' }}>
                  {describeError(error)}
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem' }}>
                  No audit log entries match the current filters.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.timestamp).toLocaleString()}</td>
                  <td>
                    {log.actor
                      ? `${log.actor.first_name} ${log.actor.last_name} (${log.actor.role})`
                      : 'System'}
                  </td>
                  <td>{log.action}</td>
                  <td>
                    {log.resource_type}
                    {log.resource_id ? ` (${log.resource_id.slice(0, 8)}...)` : ''}
                  </td>
                  <td>
                    <span
                      className="status-pill"
                      style={{
                        background:
                          log.outcome === 'SUCCESS'
                            ? 'rgba(34,197,94,0.12)'
                            : log.outcome === 'DENY'
                            ? 'rgba(239,68,68,0.12)'
                            : 'rgba(234,179,8,0.12)',
                        border: 'none'
                      }}
                    >
                      {log.outcome}
                    </span>
                  </td>
                  <td>{log.ip || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>
    </div>
  );
};

